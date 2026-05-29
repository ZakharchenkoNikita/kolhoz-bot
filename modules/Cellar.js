const BaseModule = require('../core/BaseModule');
const { URL } = require('url');
const RecipeBookScanner = require('../core/RecipeBookScanner'); // 📖 ДОБАВЛЕНО: Импорт сканера

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

    // ==========================================
    // 🧠 ФАЗА ВЫБОРА ЦЕЛИ
    // ==========================================
    static chooseTarget(db, currentLevel) {
        let isSkillOn = db.getAccountSettings('culinary_skill') === 'true';
        if (!isSkillOn) return { mode: 'FARM' }; // Возвращаемся к ручному режиму

        let profile = db.getProfile();
        let recipeBook = profile.recipe_book || {};
        let allRecipes = db.db.getAllRecipes(); // Используем глобальную БД

        // Отбираем рецепты-кандидаты
        let candidates = allRecipes.filter(r => {
            if (r.req_level > currentLevel) return false; // Уровень не подходит
            if (recipeBook[r.name] === undefined) return false; // Скрытый/неоткрытый рецепт
            if (recipeBook[r.name] >= r.max_mastery) return false; // Уже прокачан на фулл
            return true;
        });

        if (candidates.length === 0) {
            console.log('🎯 Погреб: Все доступные рецепты прокачаны на максимум! Переходим в режим FARM.');
            return { mode: 'FARM' };
        }

        // Сортируем от самых высокоуровневых к простым (чтобы быстрее получать опыт и монеты)
        candidates.sort((a, b) => b.req_level - a.req_level);
        let target = candidates[0];

        // Собираем правильный URL (ingredients - это массив, превращаем в 15/13/2)
        let ings = Array.isArray(target.ingredients) ? target.ingredients.join('/') : target.ingredients;
        let url = `/recipe/${target.id}/${ings}/${target.time_min}/${target.hash}`;
        
        console.log(`🎯 Погреб: Цель -> ${target.name} (Мастерство: ${recipeBook[target.name] || 0}/${target.max_mastery})`);
        
        return { mode: 'UPGRADE', url: url, name: target.name };
    }

    // ==========================================
    // 🚜 ФАЗА СБОРА
    // ==========================================
    static async harvest(client, db, $, currentUrl, allLinks, workers) {
        let sellLink = allLinks.find(l => l.text.includes('продать всё') || l.text.includes('продать все'));
        if (sellLink) {
            let actionUrl = this.getAbsoluteUrl(sellLink.href, currentUrl);
            let $result = await client.fetchHtml(actionUrl);
            if ($result) {
                let resultText = $result('body').text();
                // Ловим табличку +X к.м.
                if (resultText.includes('получили +') && resultText.includes('к.м.')) {
                    console.log(`🆙 Погреб: Получено кулинарное мастерство! Обновляем Книгу Рецептов...`);
                    let scanner = new RecipeBookScanner(client, db.db, workers.username);
                    await scanner.scan();
                }
            }
            db.saveTimer('kb_cel_timer', Date.now() + 3000);
            return true;
        }
        return false;
    }

    // ==========================================
    // 🍯 ФАЗА ЗАКЛАДКИ
    // ==========================================
    static async cook(client, db, $, currentUrl, target) {
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

            let bL;
            // Разделение логики закупки
            if (target.mode === 'UPGRADE') {
                bL = buyLinks[0]; // На 1 порцию
                console.log(`🛒 Погреб: Закупаем на 1 порцию (Прокачка мастерства)`);
            } else {
                bL = buyLinks[buyLinks.length - 1]; // На все доступные полки
                console.log(`🛒 Погреб: Закупаем на все полки (Обычный фарм)`);
            }

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
            console.log(`🍯 Погреб: Банки успешно поставлены!`);
        }
    }

    // ==========================================
    // ⚙️ ГЛАВНЫЙ ЦИКЛ ПОГРЕБА
    // ==========================================
    static async execute(client, db, workers) {
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

            let checkWork = () => {
                if (allLinks.some(l => l.text.includes('продать всё') || l.text.includes('продать все'))) return true;
                if (pageText.includes('пустая полка') && allLinks.some(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'))) return true;
                return false;
            };

            if (checkWork()) {
                let isSkillOn = db.getAccountSettings('culinary_skill') === 'true';

                // Если включена Дарья И мы НЕ в режиме умной прокачки
                if (db.getAccountSettings('use_workers') === 'true' && !isSkillOn) {
                    console.log(`👩‍🍳 Погреб: Нанимаем Дарью для работы...`);
                    db.saveTimer('kb_cel_timer', Date.now() + 60000);
                    await workers.process(7, 'worker', 'mycellar', 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                    return;
                } 
                else {
                    // ФАЗА СБОРА
                    let harvested = await this.harvest(client, db, $, startUrl, allLinks, workers);
                    if (harvested) return;

                    // ФАЗА ЗАКЛАДКИ
                    if (pageText.includes('пустая полка')) {
                        let fillLink = allLinks.find(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'));
                        
                        if (fillLink) {
                            let currentLevel = db.getProfile().level || 0;
                            let target = this.chooseTarget(db, currentLevel);
                            
                            // Если UPGRADE - идем по сгенерированной идеальной ссылке, иначе идем туда, куда ведет кнопка
                            let actionUrl = (target.mode === 'UPGRADE' && target.url) ? target.url : this.getAbsoluteUrl(fillLink.href, startUrl);
                            
                            let recipe$ = await client.fetchHtml(actionUrl);
                            if (recipe$) await this.cook(client, db, recipe$, actionUrl, target);
                            
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
            db.saveTimer('kb_cel_timer', Date.now() + 60000); 
        }
    }
}

module.exports = CellarModule;