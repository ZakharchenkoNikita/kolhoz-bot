const cheerio = require('cheerio');

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
    static PAUSE_MS = 500;

    static async execute(client, db, workers) {
        if (!client || !db || !client.accountId) return;

        const spiceMap = db.getSpicesToUnlock(client.accountId);
        if (Object.keys(spiceMap).length === 0) return;

        console.log(`[${client.username}] 🌶️ Начат круговой обход магазина специй...`);

        try {
            await this.runPurchaseCycles(client, db, spiceMap);
            console.log(`[${client.username}] 🏁 Закупка специй завершена.`);
        } catch (error) {
            if (error.message === 'LOW_BALANCE') {
                console.log(`[${client.username}] 🛑 Покупка остановлена: баланс опустился ниже 50кк!`);
            } else {
                console.error(`[${client.username}] ❌ Ошибка в модуле SpiceBuyer:`, error.message);
            }
        }
    }

    // Круговой обход страниц, пока не кончатся специи или монеты
    static async runPurchaseCycles(client, db, spiceMap) {
        let needsAnotherRound = true;
        let currentBalance = Infinity;

        while (needsAnotherRound && Object.keys(spiceMap).length > 0 && currentBalance >= this.MIN_COINS) {
            needsAnotherRound = false; 
            let page = 0;
            let hasMorePages = true;

            while (hasMorePages && Object.keys(spiceMap).length > 0) {
                const result = await this.processShopPage(client, db, page, spiceMap);
                
                currentBalance = result.balance;
                if (currentBalance < this.MIN_COINS) throw new Error('LOW_BALANCE');

                if (result.boughtSomething) needsAnotherRound = true;
                hasMorePages = result.hasMorePages;
                page++;
            }
        }
    }

    // Обработка одной страницы магазина
    static async processShopPage(client, db, page, spiceMap) {
        const url = `/shop/additions?warehousePage=true&page=${page}`;
        const res = await client.get(url);
        
        if (!res || !res.data) return { balance: Infinity, boughtSomething: false, hasMorePages: false };

        const $ = cheerio.load(res.data);
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
                currentBalance = await this.buySingleSpice(client, db, originalSpiceName, itemName, buyLink, spiceMap);
                boughtSomething = true;
                
                if (currentBalance < this.MIN_COINS) throw new Error('LOW_BALANCE');
            }
        }

        const hasMorePages = $('.pag').filter((_, el) => $(el).text().includes('>')).length > 0;
        return { balance: currentBalance, boughtSomething, hasMorePages };
    }

    // Покупка конкретной специи и проверка успеха
    static async buySingleSpice(client, db, spiceName, shopName, buyLink, spiceMap) {
        await new Promise(r => setTimeout(r, this.PAUSE_MS));
        
        console.log(`[${client.username}] 🛒 Покупаем: ${shopName} (круг)`);
        const buyRes = await client.get(buyLink);
        
        if (!buyRes || !buyRes.data) return Infinity;

        const buy$ = cheerio.load(buyRes.data);
        const balance = this.parseBalance(buy$);
        
        const unlockedRecipe = this.checkSuccess(buy$);
        if (unlockedRecipe) {
            console.log(`[${client.username}] 🎉 ОТКРЫТИЕ: Разблокирован рецепт "${unlockedRecipe}"! (Специя: ${spiceName})`);
            
            db.addUnlockedRecipe(client.accountId, unlockedRecipe);
            this.logSuccess(db, client.accountId, spiceName, unlockedRecipe);

            spiceMap[spiceName] = spiceMap[spiceName].filter(r => r !== unlockedRecipe);

            if (spiceMap[spiceName].length === 0) {
                delete spiceMap[spiceName];
            }
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
            
            let currentLogStr = db.getTimer(accountId, key);
            let currentLog = {};
            
            if (currentLogStr && typeof currentLogStr === 'string') {
                try { currentLog = JSON.parse(currentLogStr); } catch(e) {}
            }
            
            if (!currentLog[spiceName]) currentLog[spiceName] = [];
            if (!currentLog[spiceName].includes(recipeName)) {
                currentLog[spiceName].push(recipeName);
            }
            
            db.saveTimer(accountId, key, JSON.stringify(currentLog));
        } catch (e) {
            // Игнорируем ошибки
        }
    }
}

module.exports = SpiceBuyer;