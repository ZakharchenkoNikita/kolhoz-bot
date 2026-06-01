// Файл: /core/RecipeManager.js

/**
 * Генерирует готовый JSON для дашборда рецептов
 */
function buildRecipeDashboardData(db, accountId) {
    try {
        const allRecipes = db.getAllRecipes();
        const profile = db.getProfile(accountId);
        const recipeBook = profile && profile.recipe_book ? profile.recipe_book : {};

        // 💡 1. НАША "МЯСОРУБКА" (Нижний регистр, только буквы и цифры)
        const sanitize = (str) => str.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');

        const normalizedRecipeBook = {};
        for (const [key, value] of Object.entries(recipeBook)) {
            normalizedRecipeBook[sanitize(key)] = value;
        }

        // 2. Строим карту связей "Кто кого открывает"
        const unlocksMap = {};
        for (const recipe of allRecipes) {
            const conditions = recipe.unlock_conditions; 
            if (conditions && conditions.by_cooking && Array.isArray(conditions.by_cooking)) {
                for (const reqRecipeName of conditions.by_cooking) {
                    if (!unlocksMap[reqRecipeName]) unlocksMap[reqRecipeName] = [];
                    unlocksMap[reqRecipeName].push(recipe.name);
                }
            }
        }

        const result = { available: [], locked: [], maxed: [] };

        // 3. Прогоняем рецепты
        for (const recipe of allRecipes) {
            let ings = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('/') : (recipe.ingredients || '');
            
            const frontendObj = {
                id: recipe.id,
                name: recipe.name,
                level: recipe.req_level || 0,
                copyUrl: `/recipe/${recipe.id}/${ings}/${recipe.time_min}/${recipe.hash}`,
                unlocksNext: unlocksMap[recipe.name] || [], 
                requirements: []
            };

            // 💡 4. Генерируем оба варианта имени
            const nameClean = sanitize(recipe.name);
            const nameAuthor = sanitize(`${recipe.name}авторский`);

            let currentMastery = null;

            // 🛡️ УМНЫЙ ФОЛБЭК: Защита от ошибок парсера БД
            if (recipe.is_author) {
                if (normalizedRecipeBook.hasOwnProperty(nameAuthor)) {
                    currentMastery = normalizedRecipeBook[nameAuthor];
                } else if (normalizedRecipeBook.hasOwnProperty(nameClean)) {
                    // Баг БД: флаг стоит 1, но у игрока рецепт без приписки
                    currentMastery = normalizedRecipeBook[nameClean]; 
                }
            } else {
                if (normalizedRecipeBook.hasOwnProperty(nameClean)) {
                    currentMastery = normalizedRecipeBook[nameClean];
                } else if (normalizedRecipeBook.hasOwnProperty(nameAuthor)) {
                    // Баг БД: флаг стоит 0, но у игрока рецепт с припиской
                    currentMastery = normalizedRecipeBook[nameAuthor]; 
                }
            }

            // 5. Проверка совпадений
            if (currentMastery !== null) {
                if (currentMastery >= recipe.max_mastery) {
                    result.maxed.push(frontendObj);
                } else {
                    result.available.push(frontendObj);
                }
            } else {
                // Если не нашли вообще ни в каком виде — Заблокировано
                const conditions = recipe.unlock_conditions;
                if (conditions) {
                    if (conditions.by_spice) frontendObj.requirements.push(`🧂 Специя: ${conditions.by_spice}`);
                    if (conditions.by_cooking && Array.isArray(conditions.by_cooking)) {
                        conditions.by_cooking.forEach(req => frontendObj.requirements.push(`🍳 Готовка: ${req}`));
                    }
                }
                result.locked.push(frontendObj);
            }
        }

        // 6. Сортируем
        const sortByLevel = (a, b) => a.level - b.level;
        result.available.sort(sortByLevel);
        result.locked.sort(sortByLevel);
        result.maxed.sort(sortByLevel);

        return result;

    } catch (error) {
        console.error("❌ Ошибка в RecipeManager:", error);
        return { available: [], locked: [], maxed: [] };
    }
}

module.exports = { buildRecipeDashboardData };