const BaseModule = require('../core/BaseModule');

class ZagonModule extends BaseModule {
    
    // Умный расчет времени до Дня Двойного Опыта (для режима голодовки)
    static timeUntilXPDay(db) {
        let profile = db.getProfile();
        if (!profile || !profile.xp_day || profile.xp_day === '-') return 0;
        
        const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
        let xpNum = days.indexOf(profile.xp_day);
        if (xpNum === -1) return 0;

        // Берем текущее время строго по МСК
        let msk = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
        let day = msk.getDay();
        
        // Если до дня опыта осталось 1, 2 или 3 дня (начинаем голодовку)
        if ([ (xpNum - 1 + 7) % 7, (xpNum - 2 + 7) % 7, (xpNum - 3 + 7) % 7 ].includes(day)) {
            let target = new Date(msk);
            target.setDate(msk.getDate() + ((xpNum - day + 7) % 7));
            target.setHours(0, 0, 1, 0); // Ставим цель на 00:00:01 по МСК в День Х
            return target.getTime() - msk.getTime();
        }
        return 0;
    }

    static async execute(client, db, workers) {
        console.log('🐮 Анализируем Загоны...');

        const $ = await client.fetchHtml('/mypetfarm');
        if (!$) return;

        let allLinks = [];
        $('a').each((i, el) => {
            allLinks.push({
                href: $(el).attr('href') || '',
                text: $(el).text().toLowerCase().trim()
            });
        });

        // 1. Сбор продукции (Собрать всё / Продать всё)
        let harvestLink = allLinks.find(l => l.href.includes('harvestAll') || l.text.includes('сбор продукции') || l.text.includes('продать всё') || l.text.includes('продать все'));
        
        if (harvestLink) {
            let actionUrl = harvestLink.href.replace(/^\.\//, '/');
            if (!actionUrl.startsWith('/') && !actionUrl.startsWith('http')) actionUrl = '/' + actionUrl;
            
            console.log(`⚡ Загоны: Собираем продукцию!`);
            await client.fetchHtml(actionUrl);
            db.saveTimer('kb_z_timer', Date.now() + 3000);
            return;
        }

        // 2. Голодовка или Кормежка?
        let starveMs = this.timeUntilXPDay(db);
        let isStarving = starveMs > 0;

        if (!isStarving) {
            let feedLink = allLinks.find(l => l.href.includes('foodAllLink') || l.text.includes('накормить'));
            if (feedLink) {
                let actionUrl = feedLink.href.replace(/^\.\//, '/');
                if (!actionUrl.startsWith('/') && !actionUrl.startsWith('http')) actionUrl = '/' + actionUrl;
                
                console.log(`⚡ Загоны: Кормим животных!`);
                let result$ = await client.fetchHtml(actionUrl);
                
                // 🔥 ФИКС БАГА: Ищем и нажимаем подтверждение траты монет на корм
                if (result$) {
                    let confirmNode = result$('a').filter((i, el) => {
                        let href = result$(el).attr('href') || '';
                        return href.includes('confirmLink') || result$(el).text().toLowerCase().includes('да, подтверждаю');
                    }).first();

                    if (confirmNode.length > 0) {
                        let confirmHref = confirmNode.attr('href');
                        let confirmUrl = confirmHref.replace(/^\.\//, '/');
                        if (!confirmUrl.startsWith('/') && !confirmUrl.startsWith('http')) confirmUrl = '/' + confirmUrl;
                        
                        console.log(`⚠️ Загоны: Подтверждаем покупку корма!`);
                        await client.fetchHtml(confirmUrl);
                    }
                }
                
                db.saveTimer('kb_z_timer', Date.now() + 3000);
                return;
            }
        } else {
            console.log(`🌟 Загоны: Включен режим голодовки ради Опыта! Ждем дня Х.`);
        }

        // 3. Расчет таймера
        if (isStarving) {
            db.saveTimer('kb_z_timer', Date.now() + starveMs);
            console.log(`✅ Загоны: Режим голодовки. Спим ${Math.floor(starveMs / 3600000)} часов.`);
        } else {
            // Тики в игре происходят каждые 4 часа по МСК: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
            let msk = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
            let targetH = new Date(msk);
            targetH.setHours(Math.floor(msk.getHours() / 4) * 4 + 4, 1, 0, 0); // +1 минута для страховки от рассинхрона
            
            let msToNextTick = targetH.getTime() - msk.getTime();
            db.saveTimer('kb_z_timer', Date.now() + msToNextTick);
            console.log(`✅ В загонах всё сделано. След. кормежка через ${Math.floor(msToNextTick / 60000)} минут.`);
        }
    }
}

module.exports = ZagonModule;