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

    // ==========================================
    // 1. МИКРО-ФУНКЦИИ (ХЕЛПЕРЫ)
    // ==========================================
    static parseHelicopters($) {
        let helis = [];
        $('li').each((i, el) => {
            let node = $(el);
            let nameEl = node.find('.epic');
            if (nameEl.length > 0) {
                let nameText = nameEl.text().toLowerCase();
                let realName = nameEl.text().trim().split('(')[0] || 'Вертолет';
                let callLink = node.find('a').filter((idx, a) => $(a).text().toLowerCase().includes('вызвать')).first();
                let fullText = node.text();
                helis.push({ node, nameText, realName, callLink, fullText });
            }
        });
        return helis;
    }

    static async callHelicopter(client, href, startUrl, realName) {
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
        return true;
    }

    static getMinTimer(helis, allowedNames) {
        let minTimeMs = Infinity;
        for (let h of helis) {
            let isAllowed = allowedNames.some(name => h.nameText.includes(name));
            if (isAllowed) {
                let ms = this.extractTime(h.fullText);
                if (ms !== null && ms > 0 && ms < minTimeMs) {
                    minTimeMs = ms;
                }
            }
        }
        return minTimeMs;
    }

    // ==========================================
    // 2. ОСНОВНАЯ ЛОГИКА ВЫПОЛНЕНИЯ
    // ==========================================
    static async execute(client, db) {
        console.log('🚁 Проверяем Ангар (Вертолет)...');

        const startUrl = '/collective/callhelicopter';
        // Читаем настройку приоритета (по умолчанию: Гром и аналоги)
        const heliTarget = db.getAccountSettings('heli_target') || 'thunder_or_alt';

        let $ = await client.fetchHtml(startUrl);
        if (!$) return;

        let helis = this.parseHelicopters($);
        let called = false;

        // --- ЛОГИКА: ТОЛЬКО ЯСТРЕБ ---
        if (heliTarget === 'only_hawk') {
            let hawk = helis.find(h => h.nameText.includes('ястреб') && h.callLink.length > 0);
            if (hawk) {
                await this.callHelicopter(client, hawk.callLink.attr('href'), startUrl, hawk.realName);
                called = true;
            }
        } 
        // --- ЛОГИКА: ГРОМ И АНАЛОГИ ---
        else {
            let thunder = helis.find(h => h.nameText.includes('гром') && h.callLink.length > 0);
            
            // Если есть Гром - вызываем ТОЛЬКО его
            if (thunder) {
                await this.callHelicopter(client, thunder.callLink.attr('href'), startUrl, thunder.realName);
                called = true;
            } 
            // Если Грома нет - выгребаем все доступные аналоги
            else {
                const alts = ['дракон', 'ястреб', 'шмель'];
                for (let h of helis) {
                    let isAlt = alts.some(alt => h.nameText.includes(alt));
                    if (isAlt && h.callLink.length > 0) {
                        await this.callHelicopter(client, h.callLink.attr('href'), startUrl, h.realName);
                        called = true;
                    }
                }
            }
        }

        // Обновляем страницу, если что-то вызывали, чтобы увидеть свежие таймеры
        if (called) {
            $ = await client.fetchHtml(startUrl);
            if (!$) return;
            helis = this.parseHelicopters($);
        }

        // Вычисляем таймер на основе выбранного режима
        let allowedNames = heliTarget === 'only_hawk' ? ['ястреб'] : ['гром', 'дракон', 'ястреб', 'шмель'];
        let minTimeMs = this.getMinTimer(helis, allowedNames);

        // Устанавливаем таймер
        if (minTimeMs !== Infinity) {
            db.saveTimer('kb_heli_timer', Date.now() + minTimeMs);
            console.log(`✅ Вертолет: Считан таймер со страницы. Ждем ${Math.floor(minTimeMs / 60000)} минут.`);
        } else {
            // Если нужных вертолетов нет или таймер не распарсился — стандартная защита 5 минут
            db.saveTimer('kb_heli_timer', Date.now() + 300000);
            console.log(`⚠️ Вертолет: Таймер не найден. Засыпаем на 5 минут.`);
        }
    }
}

module.exports = HeliModule;