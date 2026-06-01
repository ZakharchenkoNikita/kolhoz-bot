// Файл: /core/RecipeManager.js

/**
 * Генерирует готовый JSON для дашборда рецептов
 * @param {Object} db - Экземпляр твоего класса Database (DBManager)
 * @param {number|string} accountId - ID аккаунта игрока
 */
function buildRecipeDashboardData(db, accountId) {
    try {
        // 1. Получаем рецепты и профиль (твой DBManager парсит JSON автоматически!)
        const allRecipes = db.getAllRecipes();
        const profile = db.getProfile(accountId);
        const recipeBook = profile && profile.recipe_book ? profile.recipe_book : {};

        // 2. Строим карту связей "Кто кого открывает"
        const unlocksMap = {};
        
        for (const recipe of allRecipes) {
            const conditions = recipe.unlock_conditions; // Уже готовый объект!
            
            if (conditions && conditions.by_cooking && Array.isArray(conditions.by_cooking)) {
                for (const reqRecipeName of conditions.by_cooking) {
                    if (!unlocksMap[reqRecipeName]) {
                        unlocksMap[reqRecipeName] = [];
                    }
                    unlocksMap[reqRecipeName].push(recipe.name);
                }
            }
        }

        // 3. Подготавливаем 3 массива
        const result = {
            available: [],
            locked: [],
            maxed: []
        };

        // 4. Прогоняем рецепты через логику статусов
        for (const recipe of allRecipes) {
            // Формируем ингредиенты
            let ings = Array.isArray(recipe.ingredients) 
                ? recipe.ingredients.join('/') 
                : (recipe.ingredients || '');
            
            const frontendObj = {
                id: recipe.id,
                name: recipe.name,
                level: recipe.req_level || 0, // Берем из твоей базы
                copyUrl: `/recipe/${recipe.id}/${ings}/${recipe.time_min}/${recipe.hash}`,
                unlocksNext: unlocksMap[recipe.name] || [], // Подставляем вычисленные связи
                requirements: []
            };

            // 💡 Учитываем авторские рецепты для точного поиска в профиле игрока
            const searchName = recipe.is_author ? `${recipe.name} (авторский)` : recipe.name;

            // Проверка: Изучен или нет?
            if (recipeBook.hasOwnProperty(searchName)) {
                const currentMastery = recipeBook[searchName];
                
                if (currentMastery >= recipe.max_mastery) {
                    result.maxed.push(frontendObj);
                } else {
                    result.available.push(frontendObj);
                }
            } else {
                // Рецепт заблокирован - собираем красивые тэги
                const conditions = recipe.unlock_conditions;
                if (conditions) {
                    if (conditions.by_spice) {
                        frontendObj.requirements.push(`🧂 Специя: ${conditions.by_spice}`);
                    }
                    if (conditions.by_cooking && Array.isArray(conditions.by_cooking)) {
                        conditions.by_cooking.forEach(reqName => {
                            frontendObj.requirements.push(`🍳 Готовка: ${reqName}`);
                        });
                    }
                }
                result.locked.push(frontendObj);
            }
        }

        // 5. Сортируем все 3 массива по req_level (от меньшего к большему)
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