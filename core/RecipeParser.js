const GameClient = require('./GameClient'); // Проверь правильность пути к твоим файлам
const DBManager = require('./Database');

async function startParser() {
    // 1. Получаем никнейм из консоли (например: node RecipeParser.js Labhelper)
    const username = process.argv[2];
    if (!username) {
        console.error('❌ Укажите никнейм донора! Пример: node RecipeParser.js Labhelper');
        process.exit(1);
    }

    console.log(`🤖 Запускаем парсер рецептов под аккаунтом: ${username}`);
    const db = new DBManager();
    
    // 2. Ищем аккаунт в базе, чтобы взять пароль
    const accounts = db.getAccounts();
    const account = accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
    
    if (!account) {
        console.error(`❌ Аккаунт ${username} не найден в базе данных!`);
        process.exit(1);
    }

    // 3. Авторизуемся в игре
    const client = new GameClient();
    const isLogged = await client.login(account.username, account.password);
    if (!isLogged) {
        console.error(`❌ Ошибка авторизации для ${username}.`);
        process.exit(1);
    }

    console.log(`✅ Успешный вход. Начинаем сканирование форума...`);

    // 4. Идем в главную тему "Рецепты по уровням"
    let $ = await client.fetchHtml('/topic/1185116');
    if (!$) {
        console.error('❌ Не удалось загрузить главную тему форума.');
        process.exit(1);
    }

    // 5. Собираем все ссылки на страницы диапазонов уровней
    let pageLinks = [];
    $('a').each((i, el) => {
        let href = $(el).attr('href');
        // Ищем ссылки, которые ведут на темы форума (содержат цифры) и лежат в блоке навигации
        if (href && href.includes('/topic/') && !href.includes('1185116')) {
            // Добавляем только уникальные ссылки
            if (!pageLinks.includes(href)) pageLinks.push(href);
        }
    });

    console.log(`📚 Найдено страниц с рецептами: ${pageLinks.length}`);

    let totalSaved = 0;

    // 6. Проходим по каждой странице
    for (let link of pageLinks) {
        console.log(`\n🔍 Сканируем страницу: ${link}`);
        let $page = await client.fetchHtml(link);
        if (!$page) continue;

        // На форуме каждый пост (рецепт) обычно лежит в блоке .pb или .nickModerator
        $page('.pb').each((i, el) => {
            let htmlText = $page(el).html(); // Берем HTML для поиска картинок
            let plainText = $page(el).text().replace(/\s+/g, ' ').trim(); // Берем чистый текст
            
            // Если в блоке нет собачек, это не рецепт (например, шапка темы)
            if (!plainText.includes('Идеальный состав рецепта:') || !htmlText.includes('@<a href=')) return;

            try {
                let recipe = {};

                // --- 1. ПАРСИМ ГЛАВНУЮ ССЫЛКУ И ИНГРЕДИЕНТЫ ---
                // Ищем строку вида: @<a href="/recipe/134/31/22/15/15/1255782634">Чурчхела виноградная,31,22,15,00:15</a>@
                const linkMatch = htmlText.match(/@<a href="\/recipe\/(\d+)\/([\d\/]+)\/(-?\d+)">([^,]+),.*?<\/a>@/);
                if (!linkMatch) return;

                recipe.id = parseInt(linkMatch[1]); // 134
                let rawParams = linkMatch[2].split('/').filter(x => x !== ''); // ["31", "22", "15", "15"]
                recipe.time_min = parseInt(rawParams.pop()); // Последний элемент - время в минутах
                recipe.ingredients = rawParams.map(Number); // Оставшиеся - массив ингредиентов [31, 22, 15]
                recipe.hash = linkMatch[3]; // "1255782634"
                recipe.name = linkMatch[4].trim(); // "Чурчхела виноградная"

                // --- 2. ПАРСИМ УРОВЕНЬ ---
                const levelMatch = plainText.match(/требуется (\d+) уровень/i) || plainText.match(/(\d+) уровень/i);
                recipe.req_level = levelMatch ? parseInt(levelMatch[1]) : 0;

                // --- 3. ПАРСИМ ТРЕБУЕМОЕ К.М. ДЛЯ СТАРТА ---
                const reqMasteryMatch = plainText.match(/треб\.?\s*(\d+)\s*к\.м/i);
                recipe.req_mastery = reqMasteryMatch ? parseInt(reqMasteryMatch[1]) : 0;

                // --- 4. ПАРСИМ МАКСИМАЛЬНОЕ МАСТЕРСТВО ---
                const maxMasteryMatch = plainText.match(/(\d+)\s*к\.м\.\s*\(при идеальном составе/i);
                recipe.max_mastery = maxMasteryMatch ? parseInt(maxMasteryMatch[1]) : 0;

                // --- 5. ФЛАГИ (Авторский, Сложный) ---
                recipe.is_author = plainText.toLowerCase().includes('авторский');
                recipe.is_hard = plainText.includes('Сложный в открытии рецепт') || htmlText.includes('advice.png');

                // --- 6. ПАРСИМ ЦЕНУ ---
                const priceMatch = plainText.match(/Цена в магазине:.*?(\d+)\s*\(без учета акции\)/i) || 
                                   htmlText.match(/ruby\.png".*?>\s*(\d+)/i);
                recipe.price = priceMatch ? parseInt(priceMatch[1]) : 0;

                // --- 7. ПАРСИМ УСЛОВИЯ ОТКРЫТИЯ (БОНУС) ---
                recipe.unlock_conditions = {};
                if (plainText.includes('Покупкой специй:')) {
                    // Ищем текст между "Покупкой специй:(...)" и "Купить специи"
                    const spiceMatch = plainText.match(/Покупкой специй:.*?неизвестно\)\s*([А-Яа-яЁё\s]+?)\s*Купить специи/i);
                    if (spiceMatch && !spiceMatch[1].includes('Не найдено')) {
                        recipe.unlock_conditions.by_spice = spiceMatch[1].trim();
                    }
                }

                // Сохраняем в БД!
                db.saveRecipe(recipe);
                totalSaved++;
                console.log(`  [+] Сохранен рецепт: ${recipe.name} (ID: ${recipe.id}, Ур: ${recipe.req_level})`);

            } catch (e) {
                console.log(`  [!] Ошибка при парсинге одного из рецептов: ${e.message}`);
            }
        });

        // Делаем паузу 2 секунды между страницами, чтобы не получить бан от игры за спам запросами
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n🎉 Парсинг завершен! Успешно собрано рецептов: ${totalSaved}`);
    process.exit(0);
}

startParser();