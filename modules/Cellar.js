const BaseModule = require('../core/BaseModule');
const { URL } = require('url');

class CellarModule extends BaseModule {
    static getAbsoluteUrl(href, baseUrl) {
        if (!href) return null;
        try {
            let cleanHref = href.replace(/&amp;/g, '&');
            let base = baseUrl.startsWith('http') ? baseUrl : `https://sadovnik.mobi${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
            let u = new URL(cleanHref, base);
            return u.pathname + u.search;
        } catch (e) { return href; }
    }

    // 🛠️ Вшиваем парсер времени прямо в модуль, чтобы избежать крашей
    static extractTime(timeStr) {
        if (!timeStr) return null;
        let totalMs = 0;
        let hMatch = timeStr.match(/(\d+)\s*(?:ч|час)/i);
        let mMatch = timeStr.match(/(\d+)\s*(?:м|мин)/i);
        let sMatch = timeStr.match(/(\d+)\s*(?:с|сек)/i);
        if (hMatch) totalMs += parseInt(hMatch[1], 10) * 3600000;
        if (mMatch) totalMs += parseInt(mMatch[1], 10) * 60000;
        if (sMatch) totalMs += parseInt(sMatch[1], 10) * 1000;
        return totalMs > 0 ? totalMs : null;
    }

    static async execute(client, db, workers) {
        // 🛡️ Броня от вылетов: оборачиваем всё в try-catch
        try {
            console.log('🥫 Анализируем Погреб...');

            let pauseUntil = db.getTimer('kb_cel_pause') || 0;
            if (Date.now() < pauseUntil) {
                db.saveTimer('kb_cel_timer', Date.now() + 300000); 
                return;
            }

            const startUrl = '/mycellar';
            const $ = await client.fetchHtml(startUrl);
            if (!$) return;

            let allLinks = [];
            $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });
            let pageText = $('body').text().toLowerCase();

            // Проверяем, есть ли работа в погребе
            let checkWork = () => {
                if (allLinks.some(l => l.text.includes('продать всё') || l.text.includes('продать все'))) return true;
                if (pageText.includes('пустая полка') && allLinks.some(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'))) return true;
                if (allLinks.some(l => l.text.includes('поставить') || l.text.includes('докупить состав на'))) return true;
                return false;
            };

            if (checkWork()) {
                // Если включены Работники — зовем Дарью!
                if (db.getAccountSettings('use_workers') === 'true') {
                    console.log(`👩‍🍳 Погреб: Нанимаем Дарью для работы...`);
                    db.saveTimer('kb_cel_timer', Date.now() + 60000);
                    await workers.process(7, 'worker', 'mycellar', 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                    return;
                }
                // Ручной режим
                else {
                    let sellLink = allLinks.find(l => l.text.includes('продать всё') || l.text.includes('продать все'));
                    if (sellLink) {
                        let actionUrl = this.getAbsoluteUrl(sellLink.href, startUrl);
                        await client.fetchHtml(actionUrl);
                        db.saveTimer('kb_cel_timer', Date.now() + 3000);
                        return;
                    }

                    if (pageText.includes('пустая полка')) {
                        let fillLink = allLinks.find(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'));
                        if (fillLink) {
                            let actionUrl = this.getAbsoluteUrl(fillLink.href, startUrl);
                            let recipe$ = await client.fetchHtml(actionUrl);
                            if (recipe$) await this.processRecipePage(client, db, recipe$, actionUrl);
                            db.saveTimer('kb_cel_timer', Date.now() + 3000);
                            return;
                        }
                    }
                }
            }

            let minTimeMs = Infinity;
            let R_TIMERS = /(?:через|осталось)\s+(.{0,30})/gi;
            let match;
            while ((match = R_TIMERS.exec(pageText)) !== null) {
                let ms = this.extractTime(match[1]);
                if (ms !== null && ms > 0 && ms < minTimeMs) minTimeMs = ms;
            }

            if (minTimeMs === Infinity) minTimeMs = 300000;
            db.saveTimer('kb_cel_timer', Date.now() + minTimeMs);

        } catch (e) {
            console.error("🚨 КРИТИЧЕСКАЯ ОШИБКА В ПОГРЕБЕ:", e);
            db.saveTimer('kb_cel_timer', Date.now() + 60000); // Спим минуту, чтобы не спамить лог ошибками
        }
    }

    static async processRecipePage(client, db, $, currentUrl) {
        let allLinks = [];
        $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });

        let buyLinks = allLinks.filter(l => l.text.includes('докупить состав на'));
        if (buyLinks.length > 0) {
            let buyingTimer = db.getTimer('kb_cel_buying') || 0;
            if (Date.now() < buyingTimer) {
                console.log(`❌ Погреб: Не хватает монет для закупки! Уходим в паузу на 2 часа.`);
                db.saveTimer('kb_cel_pause', Date.now() + 7200000);
                db.saveTimer('kb_cel_buying', 0);
                return;
            }

            let bL = buyLinks[buyLinks.length - 1];
            let buyUrl = this.getAbsoluteUrl(bL.href, currentUrl);
            db.saveTimer('kb_cel_buying', Date.now() + 15000);
            $ = await client.fetchHtml(buyUrl);
            if (!$) return;

            allLinks = [];
            $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });
        }

        let startLink = allLinks.find(l => l.text === 'поставить' || l.href.includes('putLink'));
        if (startLink) {
            let startUrl = this.getAbsoluteUrl(startLink.href, currentUrl);
            db.saveTimer('kb_cel_buying', 0); 
            await client.fetchHtml(startUrl);
        }
    }
}

module.exports = CellarModule;