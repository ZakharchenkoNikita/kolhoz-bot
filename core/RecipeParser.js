const GameClient = require('./GameClient');
const DBManager  = require('./Database');

// ─── Константы ────────────────────────────────────────────────────────────────

const BASE_TOPIC_URL = '/topic/1185116';
const REQUEST_DELAY  = 1_500;   // мс между запросами
const RETRY_DELAY    = 3_000;   // мс перед повторной попыткой
const MAX_RETRIES    = 2;

/**
 * Жёсткий список категорий-резервов.
 * Всегда добавляются к найденным, даже если regex-поиск сработал.
 * ИСПРАВЛЕНИЕ: добавлен /topic/875462, который отсутствовал ранее.
 */
const FALLBACK_CATEGORIES = [
    '/topic/524596',  '/topic/525072',  '/topic/525073',  '/topic/525074',
    '/topic/525075',  '/topic/525076',  '/topic/525077',  '/topic/874470',
    '/topic/875462',  // ← новая категория
    '/topic/1030605', '/topic/1071985', '/topic/1071986', '/topic/1135639',
];

// ─── Утилиты ──────────────────────────────────────────────────────────────────

const pause = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Fetch с автоматическими повторными попытками при ошибке.
 * Старый код просто пропускал страницу при первой ошибке.
 */
async function safeFetch(client, url) {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        const $ = await client.fetchHtml(url);
        if ($) return $;
        if (attempt <= MAX_RETRIES) {
            console.log(`\n⚠️  [${url}] Ошибка, попытка ${attempt + 1}/${MAX_RETRIES + 1}...`);
            await pause(RETRY_DELAY);
        }
    }
    return null;
}

/**
 * Ищет ссылку на следующую страницу пагинации.
 * Нужна для обхода многостраничных категорий.
 */
function findNextPageUrl($, currentUrl) {
    let nextHref = null;
    $('a').each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        const href = $(el).attr('href') || '';
        if (href.includes('/topic/') &&
            href !== currentUrl &&
            (text === '→' || text === '>' || text.startsWith('след'))) {
            nextHref = href;
        }
    });
    return nextHref;
}

// ─── Этап 1: Сбор ссылок ─────────────────────────────────────────────────────

/**
 * Читает главную тему и возвращает список категорий.
 * ИСПРАВЛЕНИЕ: раньше если regex находил хоть что-то, FALLBACK_CATEGORIES
 * полностью игнорировался. Теперь они всегда объединяются.
 */
async function fetchCategoryLinks(client) {
    const found = [];
    const $ = await safeFetch(client, BASE_TOPIC_URL);

    if ($) {
        $('a').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            if (href.includes('/topic/') && /^\d+-\d+$/.test(text) && !found.includes(href)) {
                found.push(href);
            }
        });
    } else {
        console.log('⚠️  Главная тема недоступна. Используем только резервный список.');
    }

    // Всегда добавляем резервные категории, которых нет в найденных
    for (const url of FALLBACK_CATEGORIES) {
        if (!found.includes(url)) found.push(url);
    }

    return found;
}

/**
 * Собирает ссылки "Описание" из ВСЕХ страниц категории.
 *
 * ГЛАВНЫЙ БАГ (исправлен): старый код читал только первую страницу каждой
 * категории. Из-за этого /topic/524596 (и другие многостраничные категории)
 * теряли рецепты со 2-й страницы и далее. Именно поэтому ~30 рецептов
 * не попали в базу.
 */
async function fetchRecipeLinksFromCategory(client, catUrl) {
    const links = [];
    let currentUrl = catUrl;
    const visited  = new Set();

    while (currentUrl && !visited.has(currentUrl)) {
        visited.add(currentUrl);
        const $ = await safeFetch(client, currentUrl);
        if (!$) break;

        $('a').each((_, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href') || '';
            if (/^описание$/i.test(text) && href.includes('/topic/') && !links.includes(href)) {
                links.push(href);
            }
        });

        const nextUrl = findNextPageUrl($, currentUrl);
        currentUrl = nextUrl || null;
        if (currentUrl) await pause(REQUEST_DELAY);
    }

    return links;
}

// ─── Этап 2: Парсинг рецептов ─────────────────────────────────────────────────

/**
 * Парсит данные одного рецепта из текста форумного поста.
 * Логика разбора не изменялась — только вынесена в отдельную функцию
 * для читаемости и тестируемости.
 *
 * @returns {object|null} — объект рецепта или null, если страница не распознана
 */
function parseRecipe(htmlText, plainText) {
    // Якорь: разделяем страницу на ВЕРХ (условия) и НИЗ (сам рецепт)
    let anchorPlain = plainText.indexOf('Идеальный состав рецепта:');
    if (anchorPlain === -1) anchorPlain = plainText.indexOf('Идеальный рецепт:');

    let anchorHtml = htmlText.indexOf('Идеальный состав рецепта:');
    if (anchorHtml === -1) anchorHtml = htmlText.indexOf('Идеальный рецепт:');

    if (anchorPlain === -1 || anchorHtml === -1) return null;

    let topPlain    = plainText.substring(0, anchorPlain);
    let bottomPlain = plainText.substring(anchorPlain);
    let topHtml     = htmlText.substring(0, anchorHtml);
    let bottomHtml  = htmlText.substring(anchorHtml);

    // Отрезаем мусор снизу (подписи, чужие уровни)
    const cutPlain = bottomPlain.indexOf('Проверить наличие рецепта:');
    if (cutPlain !== -1) bottomPlain = bottomPlain.substring(0, cutPlain);

    const cutHtml = bottomHtml.indexOf('Проверить наличие рецепта:');
    if (cutHtml !== -1) bottomHtml = bottomHtml.substring(0, cutHtml);

    // 1. Ссылка и ингредиенты
    const linkMatch = bottomHtml.match(/@<a href="\/recipe\/(\d+)\/([\d\/]+)\/(-?\d+)">([^,]+),.*?<\/a>@/s);
    if (!linkMatch) return null;

    const recipe       = {};
    recipe.id          = parseInt(linkMatch[1]);
    const rawParams    = linkMatch[2].split('/').filter(Boolean);
    recipe.time_min    = parseInt(rawParams.pop());
    recipe.ingredients = rawParams.map(Number);
    recipe.hash        = linkMatch[3];
    recipe.name        = linkMatch[4].trim();

    // 2. Уровень и мастерство
    const levelMatch   = topPlain.match(/ребуется (\d+) уровень/i) || topPlain.match(/(\d+) уровень/i);
    recipe.req_level   = levelMatch ? parseInt(levelMatch[1]) : 0;

    const reqMastMatch = topPlain.match(/треб\.?\s*(\d+)\s*к\.м/i);
    recipe.req_mastery = reqMastMatch ? parseInt(reqMastMatch[1]) : 0;

    const maxMastMatch = bottomPlain.match(/(\d+)\s*к\.м\.\s*\(при идеальном/i);
    recipe.max_mastery = maxMastMatch ? parseInt(maxMastMatch[1]) : 0;

    // 3. Флаги
    recipe.is_author = topPlain.toLowerCase().includes('авторский');
    recipe.is_hard   = topPlain.includes('Сложный в открытии рецепт') || topHtml.includes('advice.png');

    // 4. Цена
    const priceMatch = topPlain.match(/Цена в магазине:.*?(\d[\d\s\']*)\s*\(/i);
    recipe.price     = priceMatch ? parseInt(priceMatch[1].replace(/[\s\']/g, '')) : 0;

    // 5. Условия открытия (строго из ВЕРХНЕЙ части)
    recipe.unlock_conditions = {};

    const unlockPlainIdx = topPlain.indexOf('Чем открыть:');
    if (unlockPlainIdx !== -1) {
        const block = topPlain.substring(unlockPlainIdx);
        if (block.includes('Покупкой специй:')) {
            const spiceMatch = block.match(
                /Покупкой специй:.*?неизвестно\)\s*([А-Яа-яЁё\-\s]+?)\s*Купить специи/i
            );
            if (spiceMatch && !spiceMatch[1].includes('Не найдено')) {
                recipe.unlock_conditions.by_spice = spiceMatch[1].trim();
            }
        }
    }

    const unlockHtmlIdx = topHtml.indexOf('Чем открыть:');
    if (unlockHtmlIdx !== -1) {
        const block = topHtml.substring(unlockHtmlIdx);
        if (block.includes('Закаткой:')) {
            const cookMatches = [...block.matchAll(/@<a href="\/recipe\/[^"]+">([^,]+),.*?<\/a>@/g)];
            const reqRecipes  = cookMatches.map(m => m[1].trim());
            if (reqRecipes.length > 0) recipe.unlock_conditions.by_cooking = reqRecipes;
        }
    }

    return recipe;
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

async function startParser() {
    const username = process.argv[2];
    if (!username) {
        console.error('❌ Укажите никнейм донора! Пример: node core/RecipeParser.js Labhelper');
        process.exit(1);
    }

    console.log(`🤖 Запускаем парсер рецептов под аккаунтом: ${username}`);
    const db      = new DBManager();
    const account = db.getAccounts().find(a => a.username.toLowerCase() === username.toLowerCase());

    if (!account) {
        console.error(`❌ Аккаунт ${username} не найден в базе данных!`);
        process.exit(1);
    }

    const client   = new GameClient();
    const isLogged = await client.login(account.username, account.password);
    if (!isLogged) {
        console.error(`❌ Ошибка авторизации для ${username}.`);
        process.exit(1);
    }

    console.log(`✅ Успешный вход. Очищаем старую базу рецептов...`);
    db.db.exec('DELETE FROM recipes_kb');

    // ─── Этап 1: Сбор ссылок ───────────────────────────────────────────────

    console.log('\n📂 Этап 1: сбор ссылок на категории...');
    const categoryLinks = await fetchCategoryLinks(client);
    console.log(`   Категорий для обхода: ${categoryLinks.length}`);

    const recipeLinks = [];
    for (let i = 0; i < categoryLinks.length; i++) {
        const catUrl = categoryLinks[i];
        process.stdout.write(`\r   Сканируем [${i + 1}/${categoryLinks.length}]: ${catUrl}`.padEnd(80));
        const links = await fetchRecipeLinksFromCategory(client, catUrl);
        for (const l of links) {
            if (!recipeLinks.includes(l)) recipeLinks.push(l);
        }
        await pause(REQUEST_DELAY);
    }

    console.log(`\n\n🎯 Найдено рецептов для анализа: ${recipeLinks.length}`);
    if (recipeLinks.length === 0) {
        return console.log('❌ Парсинг остановлен: рецепты не найдены.');
    }

    // ─── Этап 2: Парсинг рецептов ──────────────────────────────────────────

    console.log(`⏳ Этап 2: глубокий парсинг. Это займёт около 10-15 минут...\n`);

    let totalSaved  = 0;
    let totalFailed = 0;

    for (let i = 0; i < recipeLinks.length; i++) {
        const link  = recipeLinks[i];
        const $page = await safeFetch(client, link);

        if (!$page) {
            totalFailed++;
            process.stdout.write(`\r💾 [${i + 1}/${recipeLinks.length}] ❌ Недоступен: ${link}`.padEnd(80));
            await pause(REQUEST_DELAY);
            continue;
        }

        try {
            const htmlText  = $page('.pb').html() || '';
            const plainText = $page('.pb').text().replace(/\s+/g, ' ').trim();
            const recipe    = parseRecipe(htmlText, plainText);

            if (recipe) {
                db.saveRecipe(recipe);
                totalSaved++;
                process.stdout.write(`\r💾 [${i + 1}/${recipeLinks.length}] ✅ ${recipe.name}`.padEnd(80));
            } else {
                totalFailed++;
                process.stdout.write(`\r💾 [${i + 1}/${recipeLinks.length}] ⏭️  Нераспознан: ${link}`.padEnd(80));
            }
        } catch (e) {
            totalFailed++;
            console.log(`\n[!] Ошибка парсинга: ${link} — ${e.message}`);
        }

        await pause(REQUEST_DELAY);
    }

    console.log(`\n\n🎉 Готово! Сохранено: ${totalSaved} | Пропущено/Ошибок: ${totalFailed}`);
    process.exit(0);
}

startParser();