const BaseModule = require('../core/BaseModule');

class FarmModule extends BaseModule {
    static R_TIMERS = /([а-яёA-Z]{3,})?\s*(?:через|осталось)\s+(.{0,30})/gi;

    static async execute(client, db, workers) {
        console.log('🧑‍🌾 Анализируем грядки...');

        const $ = await client.fetchHtml('/myfarm');
        if (!$) return;

        const actions = [
            { kw: 'harvestAll', text: 'собрать' },
            { kw: 'digAll', text: 'вскопать' },
            { kw: 'seedAll', text: 'засеять' },
            { kw: 'seatAll', text: 'посадить' },
            { kw: 'soilAll', text: 'удобрить' },
            { kw: 'waterAll', text: 'полить' }
        ];

        let targetAction = null;
        let targetLink = null;

        // Проверяем, есть ли работа на грядках
        for (let action of actions) {
            let link = $('a').filter((i, el) => {
                let href = $(el).attr('href') || '';
                let text = $(el).text().toLowerCase();
                if (href.includes('buyCellLink') || href.includes('clearCellLink')) return false;
                return href.includes(action.kw) || text.includes(action.text);
            }).first();

            if (link.length > 0) {
                targetAction = action;
                targetLink = link;
                break;
            }
        }

        if (targetAction) {
            // Если включены Работники — зовем Ярило!
            if (db.getAccountSettings('use_workers') === 'true') {
                console.log(`👨‍🌾 Грядки: Нанимаем Ярило для работы...`);
                db.saveTimer('kb_f_timer', Date.now() + 60000); // Страховка от спама на 1 минуту
                await workers.process(3, 'gardener', 'myfarm', 'myfarm?-1.ILinkListener-farmBonusPanel-fireWorkerLink');
                return;
            } 
            // Иначе — ручной режим
            else {
                let href = targetLink.attr('href');
                if (href) {
                    let actionUrl = href.replace(/^\.\//, '/');
                    console.log(`⚡ Выполняю действие: ${targetAction.text.toUpperCase()}`);
                    await client.fetchHtml(actionUrl);
                    db.saveTimer('kb_f_timer', Date.now() + 3000); 
                    return; 
                }
            }
        }

        // Парсим таймер
        let bodyText = $('body').text();
        let minTimeMs = Infinity;
        this.R_TIMERS.lastIndex = 0;
        let match;
        
        while ((match = this.R_TIMERS.exec(bodyText)) !== null) {
            let timeMs = this.extractTime(match[2]); 
            if (timeMs !== null && timeMs > 0 && timeMs < minTimeMs) {
                minTimeMs = timeMs;
            }
        }

        if (minTimeMs === Infinity) minTimeMs = 300000; 
        db.saveTimer('kb_f_timer', Date.now() + minTimeMs);
        console.log(`✅ На грядках всё сделано. Спим ${Math.floor(minTimeMs / 60000)} минут.`);
    }
}

module.exports = FarmModule;