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

    console.log(`✅ Успешный вход. Очищаем старую базу рецептов...`);
    // ШАГ 1: Полностью сносим старую таблицу, чтобы начать с чистого листа
    db.db.exec('DELETE FROM recipes_kb');

    console.log(`Начинаем первый этап: сбор ссылок...`);

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

        try {
            let recipe = {};

            // ШАГ 2: Находим якорь для разделения страницы на ВЕРХ (условия) и НИЗ (сам рецепт)
            let anchorPlain = plainText.indexOf('Идеальный состав рецепта:');
            if (anchorPlain === -1) anchorPlain = plainText.indexOf('Идеальный рецепт:');
            
            let anchorHtml = htmlText.indexOf('Идеальный состав рецепта:');
            if (anchorHtml === -1) anchorHtml = htmlText.indexOf('Идеальный рецепт:');

            if (anchorPlain === -1 || anchorHtml === -1) continue; // Пропускаем кривые страницы

            // Разделяем текст (Хирургический разрез)
            let topPlain = plainText.substring(0, anchorPlain);
            let bottomPlain = plainText.substring(anchorPlain);

            let topHtml = htmlText.substring(0, anchorHtml);
            let bottomHtml = htmlText.substring(anchorHtml);

            // Отрезаем мусор снизу (подписи, чужие уровни)
            let endIdxPlain = bottomPlain.indexOf('Проверить наличие рецепта:');
            if (endIdxPlain !== -1) bottomPlain = bottomPlain.substring(0, endIdxPlain);

            let endIdxHtml = bottomHtml.indexOf('Проверить наличие рецепта:');
            if (endIdxHtml !== -1) bottomHtml = bottomHtml.substring(0, endIdxHtml);

            // --- 1. ПАРСИМ ССЫЛКУ И ИНГРЕДИЕНТЫ ИЗ НИЖНЕЙ ЧАСТИ ---
            // Теперь скрипт физически не видит ссылки из блока "Чем открыть", так как они остались в topHtml
            const linkMatch = bottomHtml.match(/@<a href="\/recipe\/(\d+)\/([\d\/]+)\/(-?\d+)">([^,]+),.*?<\/a>@/s);
            if (!linkMatch) continue;

            recipe.id = parseInt(linkMatch[1]);
            let rawParams = linkMatch[2].split('/').filter(x => x !== ''); 
            recipe.time_min = parseInt(rawParams.pop()); 
            recipe.ingredients = rawParams.map(Number); 
            recipe.hash = linkMatch[3]; 
            recipe.name = linkMatch[4].trim(); 

            // --- 2. УРОВЕНЬ И МАСТЕРСТВО (сверху и снизу) ---
            const levelMatch = topPlain.match(/ребуется (\d+) уровень/i) || topPlain.match(/(\d+) уровень/i);
            recipe.req_level = levelMatch ? parseInt(levelMatch[1]) : 0;

            const reqMasteryMatch = topPlain.match(/треб\.?\s*(\d+)\s*к\.м/i);
            recipe.req_mastery = reqMasteryMatch ? parseInt(reqMasteryMatch[1]) : 0;

            const maxMasteryMatch = bottomPlain.match(/(\d+)\s*к\.м\.\s*\(при идеальном/i);
            recipe.max_mastery = maxMasteryMatch ? parseInt(maxMasteryMatch[1]) : 0;

            // --- 3. ФЛАГИ ---
            recipe.is_author = topPlain.toLowerCase().includes('авторский');
            recipe.is_hard = topPlain.includes('Сложный в открытии рецепт') || topHtml.includes('advice.png');

            // --- 4. ЦЕНА ---
            const priceMatch = topPlain.match(/Цена в магазине:.*?(\d[\d\s\']*)\s*\(/i);
            recipe.price = priceMatch ? parseInt(priceMatch[1].replace(/[\s\']/g, '')) : 0;

            // --- 5. УСЛОВИЯ ОТКРЫТИЯ (строго из ВЕРХНЕЙ части!) ---
            recipe.unlock_conditions = {};
            
            let unlockStartPlain = topPlain.indexOf('Чем открыть:');
            if (unlockStartPlain !== -1) {
                let unlockBlockPlain = topPlain.substring(unlockStartPlain);
                if (unlockBlockPlain.includes('Покупкой специй:')) {
                    const spiceMatch = unlockBlockPlain.match(/Покупкой специй:.*?неизвестно\)\s*([А-Яа-яЁё\-\s]+?)\s*Купить специи/i);
                    if (spiceMatch && !spiceMatch[1].includes('Не найдено')) {
                        recipe.unlock_conditions.by_spice = spiceMatch[1].trim();
                    }
                }
            }

            let unlockStartHtml = topHtml.indexOf('Чем открыть:');
            if (unlockStartHtml !== -1) {
                let unlockBlockHtml = topHtml.substring(unlockStartHtml);
                if (unlockBlockHtml.includes('Закаткой:')) {
                    let reqRecipes = [];
                    const cookMatches = [...unlockBlockHtml.matchAll(/@<a href="\/recipe\/[^"]+">([^,]+),.*?<\/a>@/g)];
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
            
            process.stdout.write(`\r💾 Прогресс: [${index + 1}/${recipeLinks.length}] Сохранен: ${recipe.name}`.padEnd(80));

        } catch (e) {
            console.log(`\n[!] Ошибка при парсинге рецепта: ${link} - ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 1500)); 
    }

    console.log(`\n\n🎉 Парсинг успешно завершен! Собрано уникальных рецептов: ${totalSaved}`);
    process.exit(0);
}

startParser();