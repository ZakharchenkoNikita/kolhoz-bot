// Файл: /core/RecipeManager.js

function buildRecipeDashboardData(db, accountId) {
    try {
        const allRecipes = db.getAllRecipes();
        const profile = db.getProfile(accountId);
        const recipeBook = profile && profile.recipe_book ? profile.recipe_book : {};

        const sanitize = (str) => str.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
        const normalizedRecipeBook = {};
        for (const [key, value] of Object.entries(recipeBook)) {
            normalizedRecipeBook[sanitize(key)] = value;
        }

        // 1. Предварительно вычисляем статусы ВСЕХ рецептов (maxed, available, locked)
        const recipeStatusMap = {};
        for (const recipe of allRecipes) {
            const nameClean = sanitize(recipe.name);
            const nameAuthor = sanitize(`${recipe.name}авторский`);
            let currentMastery = null;

            if (recipe.is_author) {
                if (normalizedRecipeBook.hasOwnProperty(nameAuthor)) currentMastery = normalizedRecipeBook[nameAuthor];
                else if (normalizedRecipeBook.hasOwnProperty(nameClean)) currentMastery = normalizedRecipeBook[nameClean];
            } else {
                if (normalizedRecipeBook.hasOwnProperty(nameClean)) currentMastery = normalizedRecipeBook[nameClean];
                else if (normalizedRecipeBook.hasOwnProperty(nameAuthor)) currentMastery = normalizedRecipeBook[nameAuthor];
            }

            if (currentMastery !== null) {
                recipeStatusMap[recipe.name] = (currentMastery >= recipe.max_mastery) ? 'maxed' : 'available';
            } else {
                recipeStatusMap[recipe.name] = 'locked';
            }
        }

        // 2. Строим карту связей (теперь отдаем объекты со статусами)
        const unlocksMap = {};
        for (const recipe of allRecipes) {
            const conditions = recipe.unlock_conditions; 
            if (conditions && conditions.by_cooking && Array.isArray(conditions.by_cooking)) {
                for (const reqRecipeName of conditions.by_cooking) {
                    if (!unlocksMap[reqRecipeName]) unlocksMap[reqRecipeName] = [];
                    unlocksMap[reqRecipeName].push({
                        name: recipe.name,
                        status: recipeStatusMap[recipe.name] || 'locked'
                    });
                }
            }
        }

        const result = { available: [], locked: [], maxed: [] };

        // 3. Собираем финальные карточки
        for (const recipe of allRecipes) {
            let ings = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('/') : (recipe.ingredients || '');
            const myStatus = recipeStatusMap[recipe.name];
            const frontendObj = {
                id: recipe.id,
                name: recipe.name,
                level: recipe.req_level || 0,
                isHard: (recipe.is_hard == 1 || recipe.is_hard === '1'), // 💡 Передаем флаг сложности на фронт
                copyUrl: `/recipe/${recipe.id}/${ings}/${recipe.time_min}/${recipe.hash}`,
                unlocksNext: unlocksMap[recipe.name] || [], // Сюда придут объекты
                reqCooking: [], // Требования готовки
                reqSpice: []    // Требования специй
            };

            if (myStatus === 'locked') {
                const conditions = recipe.unlock_conditions;
                if (conditions) {
                    if (conditions.by_spice) {
                        // 💡 Магия Regex: разбиваем строку по пробелу, за которым идет ЗАГЛАВНАЯ буква
                        const spiceList = typeof conditions.by_spice === 'string' 
                            ? conditions.by_spice.split(/\s+(?=[А-ЯЁ])/) 
                            : conditions.by_spice;
                            
                        if (Array.isArray(spiceList)) {
                            spiceList.forEach(s => frontendObj.reqSpice.push(s.trim()));
                        } else {
                            frontendObj.reqSpice.push(conditions.by_spice);
                        }
                    }
                    if (conditions.by_cooking && Array.isArray(conditions.by_cooking)) {
                        conditions.by_cooking.forEach(req => {
                            frontendObj.reqCooking.push({
                                name: req,
                                status: recipeStatusMap[req] || 'locked'
                            });
                        });
                    }
                }
            }

            if (myStatus === 'maxed') result.maxed.push(frontendObj);
            else if (myStatus === 'available') result.available.push(frontendObj);
            else result.locked.push(frontendObj);
        }

        // 4. Сортируем
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