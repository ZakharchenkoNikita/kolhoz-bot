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

    static async execute(client, db, accountId, workers) {
        if (!client || !db || !accountId) return;

        // Достаем красивое имя профиля для логов
        let username = accountId;
        try {
            const profile = db.getProfile(accountId);
            if (profile && profile.username) username = profile.username;
        } catch (e) {}

        try {
            const spiceMap = db.getSpicesToUnlock(accountId) || {};
            
            if (Object.keys(spiceMap).length === 0) {
                console.log(`[${username}] 🛑 Список специй пуст (все рецепты открыты).`);
                return;
            }

            console.log(`[${username}] 🌶️ Начат круговой обход магазина специй...`);
            await this.runPurchaseCycles(client, db, accountId, spiceMap, username);
            console.log(`[${username}] 🏁 Закупка специй завершена.`);
            
        } catch (error) {
            if (error.message === 'LOW_BALANCE') {
                console.log(`[${username}] 🛑 Покупка остановлена: баланс опустился ниже 50кк!`);
            } else {
                console.error(`[${username}] ❌ Ошибка в модуле SpiceBuyer:`, error.message);
            }
        }
    }

    static async runPurchaseCycles(client, db, accountId, spiceMap, username) {
        let needsAnotherRound = true;
        let currentBalance = Infinity;

        while (needsAnotherRound && Object.keys(spiceMap).length > 0 && currentBalance >= this.MIN_COINS) {
            needsAnotherRound = false; 
            let page = 0;
            let hasMorePages = true;

            while (hasMorePages && Object.keys(spiceMap).length > 0) {
                const result = await this.processShopPage(client, db, accountId, page, spiceMap, username);
                
                currentBalance = result.balance;
                if (currentBalance < this.MIN_COINS) throw new Error('LOW_BALANCE');

                if (result.boughtSomething) needsAnotherRound = true;
                hasMorePages = result.hasMorePages;
                page++;
            }
        }
    }

    static async processShopPage(client, db, accountId, page, spiceMap, username) {
        const url = `/shop/additions?warehousePage=true&page=${page}`;
        
        // 🛠️ ИСПОЛЬЗУЕМ ТВОЙ ФИРМЕННЫЙ МЕТОД FETCH
        const $ = await client.fetchHtml(url);
        if (!$) return { balance: Infinity, boughtSomething: false, hasMorePages: false };

        let currentBalance = this.parseBalance($);
        if (currentBalance < this.MIN_COINS) {
            return { balance: currentBalance, boughtSomething: false, hasMorePages: false };
        }

        const items = $('li');
        if (items.length === 0) return { balance: currentBalance, boughtSomething: false, hasMorePages: false };

        let boughtSomething = false;

        for (let i = 0; i < items.length; i++) {
            if (Object.keys(spiceMap).length === 0) break;

            const aTag = $(items[i]).find('a[href*="buyLink"]');
            if (!aTag.length) continue;

            const itemName = aTag.find('span').eq(1).text().trim();
            const buyLink = aTag.attr('href').replace('./', '/shop/');
            const originalSpiceName = this.findOriginalSpiceName(itemName);
            
            if (originalSpiceName && spiceMap[originalSpiceName]) {
                currentBalance = await this.buySingleSpice(client, db, accountId, originalSpiceName, itemName, buyLink, spiceMap, username);
                boughtSomething = true;
                
                if (currentBalance < this.MIN_COINS) throw new Error('LOW_BALANCE');
            }
        }

        const hasMorePages = $('.pag').filter((_, el) => $(el).text().includes('>')).length > 0;
        return { balance: currentBalance, boughtSomething, hasMorePages };
    }

    static async buySingleSpice(client, db, accountId, spiceName, shopName, buyLink, spiceMap, username) {
        await new Promise(r => setTimeout(r, this.PAUSE_MS));
        
        console.log(`[${username}] 🛒 Покупаем: ${shopName}...`);
        
        // 🛠️ ИСПОЛЬЗУЕМ ТВОЙ ФИРМЕННЫЙ МЕТОД FETCH
        const buy$ = await client.fetchHtml(buyLink);
        if (!buy$) return Infinity;

        const balance = this.parseBalance(buy$);
        
        const unlockedRecipe = this.checkSuccess(buy$);
        if (unlockedRecipe) {
            console.log(`[${username}] 🎉 ОТКРЫТИЕ: Разблокирован рецепт "${unlockedRecipe}"! (Специя: ${spiceName})`);
            
            db.addUnlockedRecipe(accountId, unlockedRecipe);
            this.logSuccess(db, accountId, spiceName, unlockedRecipe);

            spiceMap[spiceName] = spiceMap[spiceName].filter(r => r !== unlockedRecipe);
            if (spiceMap[spiceName].length === 0) delete spiceMap[spiceName];
        }

        return balance;
    }

    static parseBalance($) {
        const coinsText = $('.block.small img[src*="money.png"]').next('.title').text();
        return parseInt(coinsText.replace(/'/g, '').trim()) || 0;
    }

    static checkSuccess($) {
        const html = $.html(); // Извлекаем HTML из объекта cheerio
        
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
            if (!currentLog[spiceName].includes(recipeName)) {
                currentLog[spiceName].push(recipeName);
            }
            
            const updateStmt = db.db.prepare(`INSERT INTO account_timers (account_id, module, value) VALUES (?, ?, ?) ON CONFLICT(account_id, module) DO UPDATE SET value = excluded.value`);
            updateStmt.run(accountId, key, JSON.stringify(currentLog));
        } catch (e) {}
    }
}

module.exports = SpiceBuyer;