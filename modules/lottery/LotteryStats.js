class LotteryStats {
    // 🧮 Умный парсер чисел (превращает 26.0m в 26000000)
    static parseValueToNumber(str) {
        if (!str) return 0;
        let cleanStr = str.toString().toLowerCase().replace(/'/g, '').trim();
        let multiplier = 1;
        
        if (cleanStr.includes('k')) multiplier = 1000;
        else if (cleanStr.includes('m')) multiplier = 1000000;
        else if (cleanStr.includes('g')) multiplier = 1000000000;
        
        let num = parseFloat(cleanStr.replace(/[^0-9.]/g, ''));
        if (isNaN(num)) return 0;
        return Math.floor(num * multiplier);
    }

    // 📈 Обновление и сохранение дневной статистики
    static updateDailyStats(db, username, spent = 0, winningsObj = null) {
        let today = new Date().toLocaleDateString('ru-RU'); // Берем локальную дату
        let statsStr = db.getAccountSettings('lottery_daily_stats');
        
        // Теперь мы храним всю историю по дням
        let history = statsStr ? JSON.parse(statsStr) : {};

        // 🛡️ МИГРАЦИЯ: Если база в старом формате (где date в корне), оборачиваем её в словарь
        if (history && history.date) {
            let oldRecord = { ...history };
            history = {};
            history[oldRecord.date] = oldRecord;
        }

        // Если сегодня еще нет в истории - создаем чистый лист
        if (!history[today]) {
            let availableDates = Object.keys(history);
            
            // Если история не пуста, значит наступил новый день. Выводим итог за вчера.
            if (availableDates.length > 0) {
                let lastDate = availableDates[availableDates.length - 1]; // Берем последний день
                console.log(`\n=========================================`);
                console.log(`📅 Итоги лотереи за вчера (${lastDate}):`);
                this.printStats(username, history[lastDate]);
                console.log(`=========================================\n`);
            }

            history[today] = {
                date: today, // Оставляем поле для обратной совместимости с printStats
                spent: 0,
                tickets: 0,
                exp: 0,
                money: 0,
                rubies: 0,
                kolkhozRubies: 0, 
                items: {} 
            };
        }

        // Работаем со статистикой только текущего дня
        let stats = history[today];

        // Записываем расходы
        if (spent > 0) {
            stats.spent += spent;
            stats.tickets += 1;
        }

        // Записываем доходы (опыт, монеты, рубины и предметы)
        if (winningsObj) {
            if (winningsObj.exp) stats.exp += winningsObj.exp;
            if (winningsObj.money) stats.money += winningsObj.money;
            if (winningsObj.rubies) stats.rubies += winningsObj.rubies;
            if (winningsObj.kolkhozRubies) stats.kolkhozRubies += winningsObj.kolkhozRubies; 
            
            if (winningsObj.items && winningsObj.items.length > 0) {
                for (let item of winningsObj.items) {
                    if (!stats.items[item]) stats.items[item] = 0;
                    stats.items[item] += 1;
                }
            }
        }

        // Сохраняем всю историю (словарь) в базу данных
        db.saveAccountSettings('lottery_daily_stats', JSON.stringify(history));

        // Выводим красивый отчет за сегодня
        this.printStats(username, stats);
    }

    // 🖨️ Красивый вывод в консоль
    static printStats(username, stats) {
        let parts = [];
        if (stats.exp > 0) parts.push(`${this.formatNumber(stats.exp)} опыта`);
        if (stats.money > 0) parts.push(`${this.formatNumber(stats.money)} монет`);
        if (stats.rubies > 0) parts.push(`${stats.rubies} личных рубинов`); 
        if (stats.kolkhozRubies > 0) parts.push(`${stats.kolkhozRubies} рубинов в колхоз 🏛️`); 
        
        // Выводим все собранные предметы и их количество
        for (let [itemName, count] of Object.entries(stats.items)) {
            parts.push(`"${itemName}"` + (count > 1 ? ` (x${count})` : ''));
        }

        let profitStr = parts.length > 0 ? parts.join(', ') : 'Пока пусто';
        let spentStr = this.formatNumber(stats.spent);
        
        console.log(`📊 [${username} | Итог за ${stats.date}]: Куплено билетов: ${stats.tickets} (-${spentStr} монет) | Профит: ${profitStr}`);
    }

    // Форматирование чисел обратно в красивый вид (12000000 -> 12.0m)
    static formatNumber(num) {
        if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'g';
        if (num >= 1000000) return (num / 1000000).toFixed(2) + 'm';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }
}

module.exports = LotteryStats;