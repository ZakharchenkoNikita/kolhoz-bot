class SpiceBuyer {
    
    static SPICE_MAPPING = {
        'Корица': 'Корицу', 'Морская соль': 'Морскую соль', 'Лимонная кислота': 'Лимонную кислоту',
        'Ванилин': 'Ванилин', 'Уксус': 'Уксус', 'Укроп': 'Укроп', 'Петрушка': 'Петрушку',
        'Черный перец': 'Черный перец', 'Красный перец': 'Красный перец', 'Кардамон': 'Кардамон',
        'Гвоздика': 'Гвоздику', 'Бадьян': 'Бадьян', 'Тмин': 'Тмин', 'Мята': 'Мяту',
        'Имбирь': 'Имбирь', 'Мускатный орех': 'Мускатный орех', 'Куркума': 'Куркуму',
        'Шафран': 'Шафран', 'Розмарин': 'Розмарин', 'Тимьян': 'Тимьян', 'Горчица': 'Горчицу',
        'Желатин': 'Желатин', 'Сахар': 'Сахар', 'Соль': 'Cоль', 'Вода': 'Воду',
        'Масло растительное': 'Масло растительное'
    };

    static MIN_COINS = 50000000;
    static PAUSE_MS = 600;

    static shopState = {};

    static async execute(client, db, accountId, workers) {
        if (!client || !db || !accountId) return;

        let username = accountId;
        let profile = {};
        try {
            profile = db.getProfile(accountId) || {};
            if (profile.username) username = profile.username;
        } catch (e) {}

        try {
            let spiceMap = db.getSpicesToUnlock(accountId) || {};
            
            // ==========================================
            // 🧠 УМНАЯ ФИЛЬТРАЦИЯ (ВЫЧЕРКИВАЕМ ЛИШНЕЕ)
            // ==========================================
            let knownRecipes = profile.recipe_book || {};
            let dailyRecipes = {};
            
            try {
                const today = new Date().toLocaleDateString('ru-RU');
                const key = `opened_recipes_${today}`;
                const stmt = db.db.prepare(`SELECT value FROM account_timers WHERE account_id = ? AND module = ?`);
                const row = stmt.get(accountId, key);
                if (row && row.value) dailyRecipes = JSON.parse(row.value);
            } catch (e) {}

            for (const spice in spiceMap) {
                spiceMap[spice] = spiceMap[spice].filter(recipe => {
                    const alreadyInBook = knownRecipes[recipe];
                    const alreadyOpenedToday = dailyRecipes[spice] && dailyRecipes[spice].includes(recipe);
                    return !alreadyInBook && !alreadyOpenedToday;
                });
                if (spiceMap[spice].length === 0) delete spiceMap[spice];
            }
            // ==========================================

            if (Object.keys(spiceMap).length === 0) {
                console.log(`[${username}] ✅ Все нужные рецепты открыты! Выключаю закупку.`);
                db.saveAccountSettings(accountId, 'unlock_recipe', 'false');
                this.shopState[accountId] = 0;
                return;
            }

            if (this.shopState[accountId] === undefined) {
                this.shopState[accountId] = 0;
            }
            
            let currentPage = this.shopState[accountId];
            
            const result = await this.processSinglePage(client, db, accountId, currentPage, spiceMap, username);

            // 🛠️ ИСПРАВЛЕНИЕ: Теперь бот ВСЕГДА листает страницу вперед, если они еще есть
            if (result.hasMorePages) {
                this.shopState[accountId]++; // Переходим на следующую
                if (result.boughtSomething) {
                    console.log(`[${username}] ⏳ Скупил всё на стр. ${currentPage + 1}. Уступаю очередь, дальше пойду на стр. ${currentPage + 2}...`);
                } else {
                    console.log(`[${username}] ⏭️ Страница ${currentPage + 1} пуста. Уступаю очередь...`);
                }
            } else {
                console.log(`[${username}] 🏁 Конец магазина. Начинаю поиск с начала.`);
                this.shopState[accountId] = 0; // Сбрасываем в начало
            }
            
        } catch (error) {
            if (error.message === 'LOW_BALANCE') {
                console.log(`[${username}] 🛑 Покупка остановлена: баланс ниже 50кк!`);
                db.saveAccountSettings(accountId, 'unlock_recipe', 'false');
                this.shopState[accountId] = 0;
            } else {
                console.error(`[${username}] ❌ Ошибка в SpiceBuyer:`, error.message);
            }
        }
    }

    static async processSinglePage(client, db, accountId, page, spiceMap, username) {
        const url = `/shop/additions?warehousePage=true&page=${page}`;
        
        const $ = await client.fetchHtml(url);
        if (!$) return { boughtSomething: false, hasMorePages: false };

        let currentBalance = this.parseBalance($);
        if (currentBalance < this.MIN_COINS) throw new Error('LOW_BALANCE');

        const items = $('li');
        if (items.length === 0) return { boughtSomething: false, hasMorePages: false };

        let boughtSomething = false;

        for (let i = 0; i < items.length; i++) {
            if (Object.keys(spiceMap).length === 0) break;

            let checkToggle = db.getAccountSettings(accountId, 'unlock_recipe');
            if (checkToggle === 'false' || checkToggle === false) {
                return { boughtSomething: false, hasMorePages: false }; 
            }

            // 🛠️ ИСПРАВЛЕНИЕ: Берем имя специи до того, как искать ссылку <a>
            const itemName = $(items[i]).find('span').eq(1).text().trim();
            const originalSpiceName = this.findOriginalSpiceName(itemName);
            
            if (originalSpiceName && spiceMap[originalSpiceName]) {
                const aTag = $(items[i]).find('a[href*="buyLink"]');
                
                // 🛑 ПРОВЕРКА НА УРОВЕНЬ: Специя нужна, но кнопки покупки нет!
                if (!aTag.length) {
                    console.log(`[${username}] ⚠️ Специя "${itemName}" недоступна (не хватает уровня). Убираю из списка покупок!`);
                    delete spiceMap[originalSpiceName]; // Вычеркиваем, чтобы бот не искал ее вечно
                    continue; 
                }

                // Ссылка есть, уровень подходит - покупаем!
                const buyLink = aTag.attr('href').replace('./', '/shop/');
                currentBalance = await this.buySingleSpice(client, db, accountId, originalSpiceName, itemName, buyLink, spiceMap, username);
                boughtSomething = true;
                
                if (currentBalance < this.MIN_COINS) throw new Error('LOW_BALANCE');
            }
        }

        const hasMorePages = $('.pag').filter((_, el) => $(el).text().includes('>')).length > 0;
        return { boughtSomething, hasMorePages };
    }

    static async buySingleSpice(client, db, accountId, spiceName, shopName, buyLink, spiceMap, username) {
        await new Promise(r => setTimeout(r, this.PAUSE_MS));
        console.log(`[${username}] 🛒 Покупаем: ${shopName}...`);
        
        const buy$ = await client.fetchHtml(buyLink);
        if (!buy$) return Infinity;

        const balance = this.parseBalance(buy$);
        const unlockedRecipe = this.checkSuccess(buy$);
        
        if (unlockedRecipe) {
            console.log(`[${username}] 🎉 ОТКРЫТИЕ: Разблокирован рецепт "${unlockedRecipe}"! (Специя: ${spiceName})`);
            
            // Вычеркиваем из текущего списка покупок
            spiceMap[spiceName] = spiceMap[spiceName].filter(r => r !== unlockedRecipe);
            if (spiceMap[spiceName].length === 0) delete spiceMap[spiceName];

            db.addUnlockedRecipe(accountId, unlockedRecipe);
            this.logSuccess(db, accountId, spiceName, unlockedRecipe);
        }

        return balance;
    }

    static parseBalance($) {
        const coinsText = $('.block.small img[src*="money.png"]').next('.title').text();
        return parseInt(coinsText.replace(/'/g, '').trim()) || 0;
    }

    static checkSuccess($) {
        const html = $.html(); 
        const newMatch = html.match(/Вы узнали новый рецепт:\s*<span class="title">([^<]+)<\/span>/i);
        if (newMatch) return newMatch[1];

        const levelMatch = html.match(/составляющие этого рецепта \(<span class="title">([^<]+)<\/span>\)\s*требуется/i);
        if (levelMatch) return levelMatch[1];
        return null;
    }

    static findOriginalSpiceName(shopName) {
        const normalizedShopName = shopName.replace('C', 'С'); 
        for (const [orig, acc] of Object.entries(this.SPICE_MAPPING)) {
            if (acc === shopName || acc === normalizedShopName) return orig;
        }
        return null;
    }

    static logSuccess(db, accountId, spiceName, recipeName) {
        try {
            const today = new Date().toLocaleDateString('ru-RU');
            const key = `opened_recipes_${today}`;
            const stmt = db.db.prepare(`SELECT value FROM account_timers WHERE account_id = ? AND module = ?`);
            const row = stmt.get(accountId, key);
            
            let currentLog = {};
            if (row && row.value) {
                try { currentLog = JSON.parse(row.value); } catch(e) {}
            }
            
            if (!currentLog[spiceName]) currentLog[spiceName] = [];
            if (!currentLog[spiceName].includes(recipeName)) currentLog[spiceName].push(recipeName);
            
            const updateStmt = db.db.prepare(`INSERT INTO account_timers (account_id, module, value) VALUES (?, ?, ?) ON CONFLICT(account_id, module) DO UPDATE SET value = excluded.value`);
            updateStmt.run(accountId, key, JSON.stringify(currentLog));
        } catch (e) {}
    }
}

module.exports = SpiceBuyer;