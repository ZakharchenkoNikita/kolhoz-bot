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
    
    static cleanName(name) {
        return name.toLowerCase().split('(')[0].trim();
    }

    static getRecipeMastery(dbName, recipeBook) {
        let cleanDb = this.cleanName(dbName);
        for (let key in recipeBook) {
            if (this.cleanName(key) === cleanDb) {
                let val = recipeBook[key];
                if (val === null || Number.isNaN(val) || val === 'NaN') return 'MAX';
                return parseInt(val, 10);
            }
        }
        return 0; 
    }

    static chooseTarget(db, currentLevel, cookingNow = []) {
        let isSkillOn = db.getAccountSettings('culinary_skill') === 'true';
        if (!isSkillOn) return { mode: 'FARM' }; 

        let profile = db.getProfile();
        let recipeBook = profile.recipe_book || {};
        let allRecipes = db.db.getAllRecipes(); 

        let candidates = allRecipes.filter(r => {
            if (r.req_level > currentLevel) return false; 
            
            let currentM = this.getRecipeMastery(r.name, recipeBook);
            if (currentM === 'MAX') return false; 
            if (currentM >= r.max_mastery) return false; 
            
            let cleanRName = this.cleanName(r.name);
            let isCooking = cookingNow.some(cn => cn.name && cn.name === cleanRName);
            if (isCooking) return false;
            
            return true;
        });

        if (candidates.length === 0) {
            console.log('⏳ Погреб: Все доступные рецепты прокачаны или заняты!');
            return { mode: 'WAIT' };
        }

        candidates.sort((a, b) => b.req_level - a.req_level);
        let target = candidates[0];

        let ings = Array.isArray(target.ingredients) ? target.ingredients.join('/') : target.ingredients;
        let url = `/recipe/${target.id}/${ings}/${target.time_min}/${target.hash}`;
        
        let currentM = this.getRecipeMastery(target.name, recipeBook);
        console.log(`🎯 Погреб: Цель -> ${target.name} (Мастерство: ${currentM}/${target.max_mastery})`);
        
        return { mode: 'UPGRADE', url: url, name: target.name };
    }

    // ==========================================
    // 🚜 ВНУТРЕННИЕ ИНСТРУМЕНТЫ (НОВАЯ АРХИТЕКТУРА)
    // ==========================================
    
    // 1. РАЗВЕДЧИК
    static analyzeStatus($, pageText, allLinks) {
        let canHarvest = allLinks.some(l => l.text.includes('продать всё') || l.text.includes('продать все'));
        
        // Точный подсчет пустых полок по HTML-маркеру
        let emptyShelves = 0;
        if ($) {
            $('span.title').each((i, el) => {
                if ($(el).text().toLowerCase().includes('пустая полка')) {
                    emptyShelves++;
                }
            });
        }
        // Запасной вариант на случай изменений верстки
        if (emptyShelves === 0 && pageText.includes('пустая полка')) {
            let match = pageText.match(/пустая полка/gi);
            if (match) emptyShelves = match.length;
        }

        return { canHarvest, emptyShelves };
    }

    // 2. СБОРЩИК
    static async handleHarvest(client, db, currentUrl, allLinks) {
        let sellLink = allLinks.find(l => l.text.includes('продать всё') || l.text.includes('продать все'));
        if (sellLink) {
            let actionUrl = this.getAbsoluteUrl(sellLink.href, currentUrl);
            let $result = await client.fetchHtml(actionUrl);
            
            if ($result) {
                console.log(`🆙 Погреб: Урожай собран!`);
            }
            db.saveTimer('kb_cel_timer', Date.now() + 3000);
            return true;
        }
        return false;
    }

    // 3. КОНВЕЙЕР ПОСАДКИ
    static async handlePlanting(client, db, startUrl, emptyShelvesCount, currentLevel, workers) {
        console.log(`🔍 Погреб: Вижу ${emptyShelvesCount} пустых полок! Сканируем Книгу Рецептов перед конвейером...`);
        let scanner = new RecipeBookScanner(client, db.db, workers.username);
        await scanner.scan();

        let $ = await client.fetchHtml(startUrl);
        if (!$) return null;

        // Жесткий цикл по количеству пустых полок
        for (let i = 0; i < emptyShelvesCount; i++) {
            // На каждом круге гарантируем, что панель открыта
            $ = await this.openPanel(client, $, startUrl);
            
            let allLinks = [];
            $('a').each((idx, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });

            let fillLink = allLinks.find(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'));
            if (!fillLink) {
                break; // Кнопка пропала, выходим из цикла
            }

            // Обновляем память о том, что мы уже посадили на предыдущих кругах
            let cookingNow = [];
            try {
                let savedCooking = db.getAccountSettings('kb_cel_cooking');
                if (savedCooking) {
                    cookingNow = JSON.parse(savedCooking).filter(item => item.finishTime > Date.now());
                }
            } catch (e) {}

            let target = this.chooseTarget(db, currentLevel, cookingNow);
            if (target.mode === 'WAIT') {
                break; // Подходящих рецептов больше нет
            }

            let actionUrl = (target.mode === 'UPGRADE' && target.url) ? target.url : this.getAbsoluteUrl(fillLink.href, startUrl);
            let recipe$ = await client.fetchHtml(actionUrl);
            
            if (recipe$) {
                await this.cook(client, db, recipe$, actionUrl, target); // Сама посадка
            }

            // Скачиваем свежую страницу для следующего круга
            $ = await client.fetchHtml(startUrl);
            if (!$) break;
        }

        // Сворачиваем панель после завершения конвейера
        $ = await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
        return $; // Возвращаем финальную страницу Хронометристу
    }

    // 4. ХРОНОМЕТРИСТ
    static updateSleepTimer(db, pageText) {
        let minTimeMs = Infinity;
        let R_TIMERS = /(?:через|осталось)\s+(.{0,30})/gi;
        let match;
        while ((match = R_TIMERS.exec(pageText)) !== null) {
            let ms = this.extractTime(match[1]);
            if (ms !== null && ms > 0 && ms < minTimeMs) minTimeMs = ms;
        }

        if (minTimeMs === Infinity) minTimeMs = 300000;
        db.saveTimer('kb_cel_timer', Date.now() + minTimeMs);
    }

    // ==========================================
    // 🍯 МЕТОД ФИЗИЧЕСКОЙ ПОСАДКИ (COOK)
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

            let bL = (target.mode === 'UPGRADE') ? buyLinks[0] : buyLinks[buyLinks.length - 1]; 
            console.log(target.mode === 'UPGRADE' ? `🛒 Погреб: Закупаем на 1 порцию (Прокачка)` : `🛒 Погреб: Закупаем на все полки (Фарм)`);

            let buyUrl = this.getAbsoluteUrl(bL.href, currentUrl);
            db.saveTimer('kb_cel_buying', Date.now() + 15000);
            $ = await client.fetchHtml(buyUrl);
            if (!$) return;

            allLinks = [];
            $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });
        }

        let startLink;
        if (target.mode === 'UPGRADE') {
            startLink = allLinks.find(l => l.text === 'поставить' || (l.href.includes('putLink') && !l.href.includes('putAllLink')));
        } else {
            startLink = allLinks.find(l => l.text.includes('заготовить всё') || l.href.includes('putAllLink'));
            if (!startLink) startLink = allLinks.find(l => l.text === 'поставить' || l.href.includes('putLink'));
        }

        if (startLink) {
            let startUrl = this.getAbsoluteUrl(startLink.href, currentUrl);
            db.saveTimer('kb_cel_buying', 0); 
            let result$ = await client.fetchHtml(startUrl);
            
            if (result$) {
                let pageText = result$('body').text().toLowerCase();
                if (pageText.includes('будет готово через') || pageText.includes('осталось')) {
                    console.log(`🍯 Погреб: Банки успешно поставлены и подтверждены игрой!`);
                    
                    try {
                        if (target.name) {
                            let cookingNow = [];
                            let savedCooking = db.getAccountSettings('kb_cel_cooking');
                            if (savedCooking) {
                                cookingNow = JSON.parse(savedCooking).filter(item => item.finishTime > Date.now()); 
                            }
                            
                            let cleanRName = this.cleanName(target.name);
                            if (!cookingNow.some(item => item.name === cleanRName)) {
                                let targetTimeMin = target.time_min || 60; 
                                let finishTimeMs = Date.now() + (targetTimeMin * 60000) + 15000; 
                                cookingNow.push({ name: cleanRName, finishTime: finishTimeMs });
                                db.saveAccountSettings('kb_cel_cooking', JSON.stringify(cookingNow));
                                console.log(`📝 Погреб: Запомнили рецепт -> ${target.name} (Таймер: ${targetTimeMin} мин)`);
                            }
                        }
                    } catch (e) {
                        console.error("🚨 Ошибка сохранения kb_cel_cooking в БД:", e);
                    }
                } else {
                    console.log(`❌ Погреб: Сбой при посадке! (Банка не появилась)`);
                }
            }
        }
    }

    // ==========================================
    // ⚙️ ДИСПЕТЧЕР (ЧИСТЫЙ И КРАСИВЫЙ)
    // ==========================================
    static async execute(client, db, workers) {
        try {
            if (!this.isInitialScanDone) {
                console.log('🔍 Погреб: Первый запуск! Делаем контрольную синхронизацию...');
                let scanner = new RecipeBookScanner(client, db.db, workers.username);
                await scanner.scan();
                this.isInitialScanDone = true;
            }

            console.log('🥫 Анализируем Погреб...');

            let pauseUntil = db.getTimer('kb_cel_pause') || 0;
            if (Date.now() < pauseUntil) {
                db.saveTimer('kb_cel_timer', Date.now() + 300000); 
                return;
            }

            // 🛡️ ЖЕЛЕЗНАЯ ЗАЩИТА УРОВНЯ
            // Считываем до начала всех операций, чтобы сканер не перетер данные
            let currentLevel = db.getProfile().level || 0;

            const startUrl = '/mycellar';
            let $ = await client.fetchHtml(startUrl);
            if (!$) return;

            $ = await this.openPanel(client, $, startUrl);

            let allLinks = [];
            $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });
            let pageText = $('body').text().toLowerCase();

            // Очистка памяти занятых полок от устаревших таймеров
            try {
                let savedCooking = db.getAccountSettings('kb_cel_cooking');
                if (savedCooking) {
                    let parsed = JSON.parse(savedCooking);
                    let cookingNow = parsed.filter(item => item.finishTime > Date.now());
                    if (parsed.length !== cookingNow.length) {
                        db.saveAccountSettings('kb_cel_cooking', JSON.stringify(cookingNow));
                        console.log(`🧹 Погреб: Освободились полки, память просроченных рецептов очищена.`);
                    }
                }
            } catch (e) {}

            // РАЗВЕДКА
            let status = this.analyzeStatus($, pageText, allLinks);

            let isSkillOn = db.getAccountSettings('culinary_skill') === 'true';
            if (db.getAccountSettings('use_workers') === 'true' && !isSkillOn && (status.canHarvest || status.emptyShelves > 0)) {
                console.log(`👩‍🍳 Погреб: Нанимаем Дарью для работы...`);
                db.saveTimer('kb_cel_timer', Date.now() + 60000);
                await workers.process(7, 'worker', 'mycellar', 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                return;
            } 

            // СБОР
            if (status.canHarvest) {
                let harvested = await this.handleHarvest(client, db, startUrl, allLinks);
                if (harvested) {
                    await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                    return; // Уходим на 3 секунды, вернемся в чистый погреб
                }
            }

            // КОНВЕЙЕР ПОСАДКИ
            if (status.emptyShelves > 0) {
                $ = await this.handlePlanting(client, db, startUrl, status.emptyShelves, currentLevel, workers);
            } else {
                $ = await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
            }

            // ХРОНОМЕТРИСТ
            if ($) {
                pageText = $('body').text().toLowerCase();
                this.updateSleepTimer(db, pageText);
            }

        } catch (e) {
            console.error("🚨 КРИТИЧЕСКАЯ ОШИБКА В ПОГРЕБЕ:", e);
            db.saveTimer('kb_cel_timer', Date.now() + 60000); 
        }
    }
}

module.exports = CellarModule;