const BaseModule = require('../core/BaseModule');
const { URL } = require('url');
const RecipeBookScanner = require('../core/RecipeBookScanner'); 

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
    // 👁️ МЕТОДЫ УПРАВЛЕНИЯ ПАНЕЛЬЮ
    // ==========================================
    static async openPanel(client, $, currentUrl) {
        if (!$) return null;
        let openLink = $('a').filter((i, el) => ($(el).attr('href') || '').includes('BonusPanel-openLink')).first().attr('href');
        
        if (openLink) {
            let actionUrl = this.getAbsoluteUrl(openLink, currentUrl);
            let newPage = await client.fetchHtml(actionUrl);
            return newPage ? newPage : $; 
        }
        return $;
    }

    static async hidePanel(client, $, currentUrl, fireUrlPattern = null) {
        if (!$) return null;
        let hideLink = $('a').filter((i, el) => ($(el).attr('href') || '').includes('BonusPanel-hideLink')).first().attr('href');
        let finalHideUrl = null;

        if (hideLink) {
            finalHideUrl = this.getAbsoluteUrl(hideLink, currentUrl);
        } else if (fireUrlPattern) {
            let html = $.html();
            let vMatch = html.match(/\?(\d+)-/);
            if (vMatch) {
                let formattedFire = fireUrlPattern.replace('?-1', `?${vMatch[1]}`).replace('fireWorkerLink', 'hideLink');
                finalHideUrl = this.getAbsoluteUrl(`/${formattedFire}`, currentUrl);
            }
        }

        if (finalHideUrl) {
            let newPage = await client.fetchHtml(finalHideUrl);
            return newPage ? newPage : $;
        }
        return $;
    }

    // ==========================================
    // 🧠 ФАЗА ВЫБОРА ЦЕЛИ И СВЕРКА С БАЗОЙ
    // ==========================================
    
    // Очищаем названия от приписки (авторский) для идеального совпадения
    static cleanName(name) {
        return name.toLowerCase().replace(/\(авторский\)/gi, '').trim();
    }

    // Получаем реальный прогресс, учитывая NaN/null как Идеальный (MAX)
    static getRecipeMastery(dbName, recipeBook) {
        let cleanDb = this.cleanName(dbName);
        for (let key in recipeBook) {
            if (this.cleanName(key) === cleanDb) {
                let val = recipeBook[key];
                if (val === null || Number.isNaN(val) || val === 'NaN') return 'MAX';
                return parseInt(val, 10);
            }
        }
        return undefined;
    }

    static chooseTarget(db, currentLevel, cookingNow = []) {
        let isSkillOn = db.getAccountSettings('culinary_skill') === 'true';
        if (!isSkillOn) return { mode: 'FARM' }; 

        let profile = db.getProfile();
        let recipeBook = profile.recipe_book || {};
        let allRecipes = db.db.getAllRecipes(); 

        // Отбираем рецепты-кандидаты
        let candidates = allRecipes.filter(r => {
            if (r.req_level > currentLevel) return false; 
            
            let currentM = this.getRecipeMastery(r.name, recipeBook);
            if (currentM === undefined) return false; // Скрыт или еще не открыт
            if (currentM === 'MAX') return false; // Идеальный рецепт
            if (currentM >= r.max_mastery) return false; // Достиг лимита
            
            // 🚫 Проверка на дубликаты: сверяем с объектами в памяти (name + таймер)
            let cleanRName = this.cleanName(r.name);
            let isCooking = cookingNow.some(cn => cn.name && (cn.name.includes(cleanRName) || cleanRName.includes(cn.name)));
            if (isCooking) return false;
            
            return true;
        });

        if (candidates.length === 0) {
            console.log('🎯 Погреб: Все доступные рецепты прокачаны на максимум, либо заняты! Переходим в режим FARM.');
            return { mode: 'FARM' };
        }

        // Сортируем от самых высокоуровневых к простым
        candidates.sort((a, b) => b.req_level - a.req_level);
        let target = candidates[0];

        let ings = Array.isArray(target.ingredients) ? target.ingredients.join('/') : target.ingredients;
        let url = `/recipe/${target.id}/${ings}/${target.time_min}/${target.hash}`;
        
        let currentM = this.getRecipeMastery(target.name, recipeBook);
        console.log(`🎯 Погреб: Цель -> ${target.name} (Мастерство: ${currentM}/${target.max_mastery})`);
        
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
                // Ловим табличку получения мастерства по точному тексту
                if (resultText.includes('кулинарное мастерство увеличено с')) {
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

        // 🛡️ ЖЕСТКОЕ РАЗДЕЛЕНИЕ КНОПОК ПОСАДКИ
        let startLink;
        if (target.mode === 'UPGRADE') {
            // В режиме Прокачки ищем только одиночную кнопку, игнорируем массовую
            startLink = allLinks.find(l => l.text === 'поставить' || (l.href.includes('putLink') && !l.href.includes('putAllLink')));
        } else {
            // В режиме Фарма ищем "Заготовить всё"
            startLink = allLinks.find(l => l.text.includes('заготовить всё') || l.href.includes('putAllLink'));
            if (!startLink) {
                // Запасной вариант, если доступна только 1 полка
                startLink = allLinks.find(l => l.text === 'поставить' || l.href.includes('putLink'));
            }
        }

        if (startLink) {
            let startUrl = this.getAbsoluteUrl(startLink.href, currentUrl);
            db.saveTimer('kb_cel_buying', 0); 
            await client.fetchHtml(startUrl);
            console.log(`🍯 Погреб: Банки успешно поставлены!`);

            // Умное добавление рецепта с таймером в базу данных
            try {
                if (target.name) {
                    let cookingNow = [];
                    let savedCooking = db.getAccountSettings('kb_cel_cooking');
                    if (savedCooking) {
                        let parsed = JSON.parse(savedCooking);
                        let now = Date.now();
                        cookingNow = parsed.filter(item => item.finishTime > now); // Берем только актуальные
                    }
                    
                    let cleanRName = this.cleanName(target.name);
                    // Проверяем, нет ли его уже в списке (по name)
                    if (!cookingNow.some(item => item.name === cleanRName)) {
                        let targetTimeMin = target.time_min || 60; // дефолт 60 минут, если вдруг time_min пропал
                        let finishTimeMs = Date.now() + (targetTimeMin * 60000) + 15000; // +15 секунд запаса
                        cookingNow.push({ name: cleanRName, finishTime: finishTimeMs });
                        
                        db.saveAccountSettings('kb_cel_cooking', JSON.stringify(cookingNow));
                        console.log(`📝 Погреб: Запомнили рецепт -> ${target.name} (Таймер: ${targetTimeMin} мин)`);
                    }
                }
            } catch (e) {
                console.error("🚨 Ошибка сохранения kb_cel_cooking в БД:", e);
            }
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
            let $ = await client.fetchHtml(startUrl);
            if (!$) return;

            // 🔓 РАЗВОРАЧИВАЕМ ПАНЕЛЬ ПЕРЕД АНАЛИЗОМ
            $ = await this.openPanel(client, $, startUrl);

            let allLinks = [];
            $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });
            let pageText = $('body').text().toLowerCase();

            // Получаем и АВТОМАТИЧЕСКИ ОЧИЩАЕМ список занятых рецептов
            let cookingNow = [];
            try {
                let savedCooking = db.getAccountSettings('kb_cel_cooking');
                if (savedCooking) {
                    let parsed = JSON.parse(savedCooking);
                    let now = Date.now();
                    // Оставляем только те, время которых еще не истекло
                    cookingNow = parsed.filter(item => item.finishTime > now);
                    
                    // Если просроченные рецепты были удалены - обновляем БД
                    if (parsed.length !== cookingNow.length) {
                        db.saveAccountSettings('kb_cel_cooking', JSON.stringify(cookingNow));
                        console.log(`🧹 Погреб: Освободились полки, память просроченных рецептов очищена.`);
                    }
                }
            } catch (e) {
                console.error("🚨 Ошибка парсинга kb_cel_cooking из БД:", e);
            }

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
                    if (harvested) {
                        // 🔒 СВОРАЧИВАЕМ ПАНЕЛЬ ПЕРЕД ВЫХОДОМ
                        await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                        return;
                    }

                    // ФАЗА ЗАКЛАДКИ
                    if (pageText.includes('пустая полка')) {
                        let fillLink = allLinks.find(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'));
                        
                        if (fillLink) {
                            let currentLevel = db.getProfile().level || 0;
                            let target = this.chooseTarget(db, currentLevel, cookingNow); // 🧠 Передаем занятые полки
                            
                            // Если UPGRADE - идем по сгенерированной идеальной ссылке, иначе идем туда, куда ведет кнопка
                            let actionUrl = (target.mode === 'UPGRADE' && target.url) ? target.url : this.getAbsoluteUrl(fillLink.href, startUrl);
                            
                            let recipe$ = await client.fetchHtml(actionUrl);
                            if (recipe$) await this.cook(client, db, recipe$, actionUrl, target);
                            
                            // 🔒 СВОРАЧИВАЕМ ПАНЕЛЬ ПЕРЕД ВЫХОДОМ
                            await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                            
                            db.saveTimer('kb_cel_timer', Date.now() + 3000);
                            return;
                        }
                    }
                }
            }

            // 🔒 СВОРАЧИВАЕМ ПАНЕЛЬ, ДАЖЕ ЕСЛИ ПРОСТО ЗАШЛИ СНЯТЬ ТАЙМЕРЫ
            await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');

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