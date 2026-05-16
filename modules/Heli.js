const BaseModule = require('../core/BaseModule');
const { URL } = require('url');

class HeliModule extends BaseModule {
    
    static getAbsoluteUrl(href, baseUrl) {
        if (!href) return null;
        try {
            let cleanHref = href.replace(/&amp;/g, '&');
            let base = baseUrl.startsWith('http') ? baseUrl : `https://sadovnik.mobi${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
            let u = new URL(cleanHref, base);
            return u.pathname + u.search;
        } catch (e) {
            return href;
        }
    }

    static async execute(client, db) {
        console.log('🚁 Проверяем Ангар (Вертолет)...');

        const startUrl = '/collective/callhelicopter';
        let $ = await client.fetchHtml(startUrl);
        if (!$) return;

        let called = false;

        // 1. Ищем вертолет "Гром" и пытаемся его вызвать
        let helis = [];
        $('li').each((i, el) => {
            helis.push($(el));
        });

        for (let el of helis) {
            let nameEl = el.find('.epic');
            let nameText = nameEl.text().toLowerCase();
            let realName = nameEl.text().trim().split('(')[0] || 'Вертолет';

            // Работаем только с вертолетом "Гром" (как заложено в твоем коде)
            if (!nameText.includes('гром')) continue; 

            let callLink = el.find('a').filter((idx, a) => $(a).text().toLowerCase().includes('вызвать')).first();

            if (callLink.length > 0) {
                let href = callLink.attr('href');
                if (href) {
                    let actionUrl = this.getAbsoluteUrl(href, startUrl);
                    console.log(`⚡ Ангар: Вызываем ${realName}!`);
                    
                    let result$ = await client.fetchHtml(actionUrl);
                    
                    // Перехватчик "Вы уверены?"
                    if (result$) {
                        let confirmNode = result$('a').filter((idx, a) => (result$(a).attr('href') || '').includes('confirmLink')).first();
                        if (confirmNode.length > 0) {
                            console.log(`⚠️ Ангар: Подтверждаем вызов!`);
                            await client.fetchHtml(this.getAbsoluteUrl(confirmNode.attr('href'), actionUrl));
                        }
                    }
                    
                    called = true;
                    break; // Успешно нажали, выходим из цикла
                }
            }
        }

        // 2. Если мы вызвали вертолет, нам нужно получить свежую страницу, 
        // чтобы прочитать ТОЧНОЕ время отката, которое только что выдала игра!
        if (called) {
            $ = await client.fetchHtml(startUrl);
            if (!$) return;
        }

        // 3. Собираем точное время (Парсим страницу)
        let minTimeMs = Infinity;
        
        $('li').each((i, el) => {
            let nameEl = $(el).find('.epic');
            let nameText = nameEl.text().toLowerCase();
            
            // Парсим таймеры только у нужных нам вертолетов
            if (!nameText.includes('гром')) return; 

            // Достаем время прямо из текста (например: "осталось 3 часа 59 минут")
            let ms = this.extractTime($(el).text());
            if (ms !== null && ms > 0 && ms < minTimeMs) {
                minTimeMs = ms;
            }
        });

        // 4. Устанавливаем таймер
        if (minTimeMs !== Infinity) {
            db.saveTimer('kb_heli_timer', Date.now() + minTimeMs);
            console.log(`✅ Вертолет: Считан таймер со страницы. Ждем ${Math.floor(minTimeMs / 60000)} минут.`);
        } else {
            // Если вертолетов нет или таймер не распарсился — стандартная защита 5 минут
            db.saveTimer('kb_heli_timer', Date.now() + 300000);
            console.log(`⚠️ Вертолет: Таймер не найден. Засыпаем на 5 минут.`);
        }
    }
}

module.exports = HeliModule;