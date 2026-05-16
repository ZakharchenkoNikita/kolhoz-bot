const BaseModule = require('../core/BaseModule');

class PondsModule extends BaseModule {
    static R_TIMERS = /(вырастет|созреет|рост|кормлени[ея]|покормить).*?(?:через|осталось)\s+(.{0,30})/gi;
    static R_IS_GROW = /вырастет|созреет|рост/i;
    static R_IS_FEED = /корм|покорм/i;

    static async execute(client, db, workers) {
        console.log('🐟 Анализируем Пруды...');

        const $ = await client.fetchHtml('/mypool');
        if (!$) return;

        let allLinks = [];
        $('a').each((i, el) => {
            allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().trim() });
        });

        const actions = [
            { kw: 'harvestAll', name: 'СОБРАТЬ УЛОВ' },
            { kw: 'setAll', name: 'РАЗВОДИТЬ' },
            { kw: 'foodAll', name: 'ПОКОРМИТЬ' }
        ];

        let targetLink = null;
        for (let action of actions) {
            targetLink = allLinks.find(l => l.href.includes(action.kw));
            if (targetLink) break;
        }

        if (targetLink) {
            // Если включены Работники — зовем Трофима!
            if (db.getAccountSettings('use_workers') === 'true') {
                console.log(`🎣 Пруды: Нанимаем Трофима для работы...`);
                db.saveTimer('kb_p_feed_timer', Date.now() + 60000);
                db.saveTimer('kb_p_grow_timer', Date.now() + 60000);
                await workers.process(8, 'worker', 'mypool', 'mypool?-1.ILinkListener-poolBonusPanel-fireWorkerLink');
                return;
            }
            // Ручной режим
            else {
                let rawHref = targetLink.href;
                let actionUrl = rawHref;
                
                if (actionUrl.startsWith('./')) actionUrl = actionUrl.substring(1); 
                else if (!actionUrl.startsWith('/') && !actionUrl.startsWith('http')) actionUrl = '/' + actionUrl;

                console.log(`⚡ Пруды: Жмем "${targetLink.text}"...`);
                let result$ = await client.fetchHtml(actionUrl);
                
                if (result$) {
                    let confirmNode = result$('a').filter((i, el) => (result$(el).attr('href') || '').includes('confirmLink')).first();
                    if (confirmNode.length > 0) {
                        let confirmHref = confirmNode.attr('href');
                        let confirmUrl = confirmHref;
                        if (confirmUrl.startsWith('./')) confirmUrl = confirmUrl.substring(1);
                        else if (!confirmUrl.startsWith('/')) confirmUrl = '/' + confirmUrl;
                        await client.fetchHtml(confirmUrl);
                    }
                }
                
                db.saveTimer('kb_p_feed_timer', Date.now() + 3000);
                db.saveTimer('kb_p_grow_timer', Date.now() + 3000);
                return;
            }
        }

        let text = $('body').text();
        let feedMs = Infinity, growMs = Infinity;
        
        this.R_TIMERS.lastIndex = 0;
        let match;

        while ((match = this.R_TIMERS.exec(text)) !== null) {
            let context = match[1]; 
            let timeStr = match[2]; 
            let isGrow = this.R_IS_GROW.test(context);
            let isFeed = this.R_IS_FEED.test(context);
            
            let ms = this.extractTime(timeStr);
            if (ms !== null && ms > 0) {
                if (isFeed && ms < feedMs) feedMs = ms;
                if (isGrow && ms < growMs) growMs = ms;
            }
        }

        if (feedMs === Infinity) feedMs = 3600000;
        if (growMs === Infinity) growMs = 3600000;

        db.saveTimer('kb_p_feed_timer', Date.now() + feedMs);
        db.saveTimer('kb_p_grow_timer', Date.now() + growMs);
    }
}

module.exports = PondsModule;