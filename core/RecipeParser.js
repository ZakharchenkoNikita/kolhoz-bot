const GameClient = require('./GameClient'); 
const DBManager = require('./Database');

async function startParser() {
    const username = process.argv[2];
    if (!username) {
        console.error('❌ Укажите никнейм донора! Пример: node core/RecipeParser.js Labhelper');
        process.exit(1);
    }

    console.log(`🤖 Запускаем парсер рецептов под аккаунтом: ${username}`);
    const db = new DBManager();
    const accounts = db.getAccounts();
    const account = accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
    
    if (!account) {
        console.error(`❌ Аккаунт ${username} не найден в базе данных!`);
        process.exit(1);
    }

    const client = new GameClient();
    const isLogged = await client.login(account.username, account.password);
    if (!isLogged) {
        console.error(`❌ Ошибка авторизации для ${username}.`);
        process.exit(1);
    }

    console.log(`✅ Успешный вход. Начинаем первый этап: сбор ссылок...`);

    // 1. Идем в главную тему "Рецепты по уровням"
    let $ = await client.fetchHtml('/topic/1185116');
    if (!$) return console.error('❌ Не удалось загрузить главную тему форума.');

    // Собираем ссылки на диапазоны уровней (ищем текст вида "10-21")
    let categoryLinks = [];
    $('a').each((i, el) => {
        let href = $(el).attr('href');
        let text = $(el).text().trim();
        if (href && href.includes('/topic/') && text.match(/^\d+-\d+$/)) {
            if (!categoryLinks.includes(href)) categoryLinks.push(href);
        }
    });

    // Пуленепробиваемый резерв: если регулярка не сработала, используем жестко заданные ссылки
    if (categoryLinks.length === 0) {
        console.log('⚠️ Используем резервный алгоритм поиска категорий...');
        categoryLinks = [
            '/topic/524596', '/topic/525072', '/topic/525073', '/topic/525074',
            '/topic/525075', '/topic/525076', '/topic/525077', '/topic/874470',
            '/topic/1030605', '/topic/1071985', '/topic/1071986', '/topic/1135639'
        ];
    }

    console.log(`📂 Найдено категорий уровней: ${categoryLinks.length}`);

    // 2. Проходим по категориям и собираем ссылки на "Описание" рецептов
    let recipeLinks = [];
    for (let catLink of categoryLinks) {
        console.log(`   > Сканируем категорию: ${catLink}`);
        let $cat = await client.fetchHtml(catLink);
        if (!$cat) continue;

        $cat('a').each((i, el) => {
            let text = $cat(el).text().trim();
            let href = $cat(el).attr('href');
            if (text === 'Описание' && href && href.includes('/topic/')) {
                if (!recipeLinks.includes(href)) recipeLinks.push(href);
            }
        });
        await new Promise(r => setTimeout(r, 1500)); // Пауза, чтобы не получить бан
    }

    console.log(`\n🎯 Найдено рецептов для анализа: ${recipeLinks.length}`);
    if (recipeLinks.length === 0) return console.log("❌ Парсинг остановлен, так как рецепты не найдены.");
    
    console.log(`⏳ Начинаем второй этап: глубокий парсинг. Это займет около 10-15 минут...\n`);

    let totalSaved = 0;

    // 3. Проходим по каждому конкретному рецепту
    for (let index = 0; index < recipeLinks.length; index++) {
        let link = recipeLinks[index];
        let $page = await client.fetchHtml(link);
        if (!$page) continue;

        let htmlText = $page('.pb').html() || '';
        let plainText = $page('.pb').text().replace(/\s+/g, ' ').trim();

        // ХОТФИКС: Отрезаем мусор снизу (подписи пользователей со случайными цифрами уровней)
        let endIdxHtml = htmlText.indexOf('Проверить наличие рецепта:');
        if (endIdxHtml !== -1) htmlText = htmlText.substring(0, endIdxHtml);

        let endIdxText = plainText.indexOf('Проверить наличие рецепта:');
        if (endIdxText !== -1) plainText = plainText.substring(0, endIdxText);

        try {
            let recipe = {};

            // --- 1. ПАРСИМ ССЫЛКУ И ИНГРЕДИЕНТЫ ---
            const linkMatch = htmlText.match(/@<a href="\/recipe\/(\d+)\/([\d\/]+)\/(-?\d+)">([^,]+),.*?<\/a>@/s);
            if (!linkMatch) continue; // Пропускаем, если это не страница рецепта

            recipe.id = parseInt(linkMatch[1]);
            let rawParams = linkMatch[2].split('/').filter(x => x !== ''); 
            recipe.time_min = parseInt(rawParams.pop()); 
            recipe.ingredients = rawParams.map(Number); 
            recipe.hash = linkMatch[3]; 
            recipe.name = linkMatch[4].trim(); 

            // --- 2. УРОВЕНЬ И МАСТЕРСТВО ---
            const levelMatch = plainText.match(/ребуется (\d+) уровень/i);
            recipe.req_level = levelMatch ? parseInt(levelMatch[1]) : 0;

            const reqMasteryMatch = plainText.match(/треб\.?\s*(\d+)\s*к\.м/i);
            recipe.req_mastery = reqMasteryMatch ? parseInt(reqMasteryMatch[1]) : 0;

            const maxMasteryMatch = plainText.match(/(\d+)\s*к\.м\.\s*\(при идеальном/i);
            recipe.max_mastery = maxMasteryMatch ? parseInt(maxMasteryMatch[1]) : 0;

            // --- 3. ФЛАГИ ---
            recipe.is_author = plainText.toLowerCase().includes('авторский');
            recipe.is_hard = plainText.includes('Сложный в открытии рецепт') || htmlText.includes('advice.png');

            // --- 4. ЦЕНА ---
            const priceMatch = plainText.match(/Цена в магазине:.*?(\d[\d\s\']*)\s*\(/i);
            recipe.price = priceMatch ? parseInt(priceMatch[1].replace(/[\s\']/g, '')) : 0;

            // --- 5. УСЛОВИЯ ОТКРЫТИЯ ---
            recipe.unlock_conditions = {};
            
            let unlockStart = plainText.indexOf('Чем открыть:');
            let unlockEnd = plainText.indexOf('Идеальный состав рецепта:');
            if (unlockEnd === -1) unlockEnd = plainText.indexOf('Идеальный рецепт:'); // Учитываем разное написание

            let unlockStartHtml = htmlText.indexOf('Чем открыть:');
            let unlockEndHtml = htmlText.indexOf('Идеальный состав рецепта:');
            if (unlockEndHtml === -1) unlockEndHtml = htmlText.indexOf('Идеальный рецепт:');
            
            if (unlockStart !== -1 && unlockEnd !== -1 && unlockStartHtml !== -1 && unlockEndHtml !== -1) {
                let unlockStrPlain = plainText.substring(unlockStart, unlockEnd);
                let unlockStrHtml = htmlText.substring(unlockStartHtml, unlockEndHtml);

                // А) Открытие специей
                if (unlockStrPlain.includes('Покупкой специй:')) {
                    const spiceMatch = unlockStrPlain.match(/Покупкой специй:.*?неизвестно\)\s*([А-Яа-яЁё\-\s]+?)\s*Купить специи/i);
                    if (spiceMatch && !spiceMatch[1].includes('Не найдено')) {
                        recipe.unlock_conditions.by_spice = spiceMatch[1].trim();
                    }
                }

                // Б) Открытие варкой (Закаткой)
                if (unlockStrHtml.includes('Закаткой:')) {
                    let reqRecipes = [];
                    const cookMatches = [...unlockStrHtml.matchAll(/@<a href="\/recipe\/[^"]+">([^,]+),.*?<\/a>@/g)];
                    for (let m of cookMatches) {
                        reqRecipes.push(m[1].trim());
                    }
                    if (reqRecipes.length > 0) {
                        recipe.unlock_conditions.by_cooking = reqRecipes;
                    }
                }
            }

            db.saveRecipe(recipe);
            totalSaved++;
            
            // Выводим красивый прогресс в консоль
            process.stdout.write(`\r💾 Прогресс: [${index + 1}/${recipeLinks.length}] Сохранен: ${recipe.name}`.padEnd(80));

        } catch (e) {
            console.log(`\n[!] Ошибка при парсинге рецепта: ${link} - ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 1500)); // Жесткая пауза
    }

    console.log(`\n\n🎉 Парсинг успешно завершен! Собрано рецептов в Базу Знаний: ${totalSaved}`);
    process.exit(0);
}

startParser();