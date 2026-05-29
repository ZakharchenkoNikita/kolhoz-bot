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
    // 🧠 ФАЗА ВЫБОРА ЦЕЛИ И УМНЫЕ ФИЛЬТРЫ
    // ==========================================
    
    static isCooking(dbName, cookingNames) {
        let clean = (s) => s.toLowerCase().replace(/[^а-яёa-z]/gi, '');
        let cleanDb = clean(dbName);
        const getRoots = (str) => str.toLowerCase().replace(/[^а-яёa-z]/gi, ' ').split(/\s+/).filter(w => w.length > 3).map(w => w.substring(0, w.length - 2));
        let dbRoots = getRoots(dbName);

        for (let cn of cookingNames) {
            if (clean(cn).includes(cleanDb) || cleanDb.includes(clean(cn))) return true; 
            
            let cnRoots = getRoots(cn);
            if (dbRoots.length > 0 && cnRoots.length > 0) {
                let matches = dbRoots.filter(dr => cnRoots.some(cr => cr.includes(dr) || dr.includes(cr)));
                if (matches.length >= Math.min(dbRoots.length, cnRoots.length)) return true;
            }
        }
        return false;
    }

    static getRecipeMastery(dbName, recipeBook) {
        let clean = (s) => s.toLowerCase().replace(/[^а-яёa-z]/gi, '');
        let cleanDb = clean(dbName);
        const getRoots = (str) => str.toLowerCase().replace(/[^а-яёa-z]/gi, ' ').split(/\s+/).filter(w => w.length > 3).map(w => w.substring(0, w.length - 2));
        let dbRoots = getRoots(dbName);

        for (let key in recipeBook) {
            let isMatch = false;
            let cleanKey = clean(key);
            
            if (cleanDb === cleanKey) {
                isMatch = true;
            } else {
                let keyRoots = getRoots(key);
                if (dbRoots.length > 0 && keyRoots.length > 0) {
                    let matches = dbRoots.filter(dr => keyRoots.some(kr => kr.includes(dr) || dr.includes(kr)));
                    if (matches.length >= Math.min(dbRoots.length, keyRoots.length)) isMatch = true;
                }
            }

            if (isMatch) {
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

        let candidates = allRecipes.filter(r => {
            if (r.req_level > currentLevel) return false; 
            
            let currentM = this.getRecipeMastery(r.name, recipeBook);
            
            if (currentM === undefined) return false; 
            if (currentM === 'MAX') return false; 
            if (currentM >= r.max_mastery) return false; 
            
            if (this.isCooking(r.name, cookingNow)) return false; 
            
            return true;
        });

        if (candidates.length === 0) {
            console.log('🎯 Погреб: Все доступные рецепты прокачаны на максимум, либо заняты! Переходим в режим FARM.');
            return { mode: 'FARM' };
        }

        candidates.sort((a, b) => b.req_level - a.req_level);
        let target = candidates[0];

        let ings = Array.isArray(target.ingredients) ? target.ingredients.join('/') : target.ingredients;
        let url = `/recipe/${target.id}/${ings}/${target.time_min}/${target.hash}`;
        
        let currentM = this.getRecipeMastery(target.name, recipeBook);
        console.log(`🎯 Погреб: Цель -> ${target.name} (Мастерство: ${currentM}/${target.max_mastery})`);
        
        return { mode: 'UPGRADE', url: url, name: target.name, max_mastery: target.max_mastery };
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
    static async cook(client, db, $, currentUrl, target, workers) {
        let pageText = $('body').text().toLowerCase();

        let isMaxed = false;
        let masteryMatch = pageText.match(/кулинарное мастерство:\s*(\d+)/i);
        if (masteryMatch && target.max_mastery) {
            let currentM = parseInt(masteryMatch[1], 10);
            if (currentM >= target.max_mastery) isMaxed = true;
        }
        
        if (pageText.includes('идеальный') || pageText.includes('идеальная') || pageText.includes('идеальное')) {
            isMaxed = true;
        }

        if (target.mode === 'UPGRADE' && isMaxed) {
            console.log(`✨ Погреб: Стоп! Рецепт "${target.name}" достиг максимума! Обновляем Книгу Рецептов.`);
            let scanner = new RecipeBookScanner(client, db.db, workers.username);
            await scanner.scan();
            return false; 
        }

        let allLinks = [];
        $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });

        let buyLinks = allLinks.filter(l => l.text.includes('докупить состав на'));
        if (buyLinks.length > 0) {
            let buyingTimer = db.getTimer('kb_cel_buying') || 0;
            if (Date.now() < buyingTimer) {
                console.log(`❌ Погреб: Не хватает монет для закупки! Уходим в паузу на 2 часа.`);
                db.saveTimer('kb_cel_pause', Date.now() + 7200000);
                db.saveTimer('kb_cel_buying', 0);
                return false;
            }

            let bL;
            if (target.mode === 'UPGRADE') {
                bL = buyLinks[0]; 
                console.log(`🛒 Погреб: Закупаем на 1 порцию (Прокачка мастерства)`);
            } else {
                bL = buyLinks[buyLinks.length - 1]; 
                console.log(`🛒 Погреб: Закупаем на все полки (Обычный фарм)`);
            }

            let buyUrl = this.getAbsoluteUrl(bL.href, currentUrl);
            db.saveTimer('kb_cel_buying', Date.now() + 15000);
            $ = await client.fetchHtml(buyUrl);
            if (!$) return false;

            allLinks = [];
            $('a').each((i, el) => { allLinks.push({ href: $(el).attr('href') || '', text: $(el).text().toLowerCase().trim() }); });
        }

        // 🐛 ИСПРАВЛЕНИЕ БАГА "КЛОНИРОВАНИЯ": Жестко разграничиваем 1 полку и "Всё"
        let startLink;
        if (target.mode === 'UPGRADE') {
            // Строго на 1 порцию. Исключаем putAllLink!
            startLink = allLinks.find(l => l.text === 'поставить' || (l.href.includes('putLink') && !l.href.includes('putAllLink')));
        } else {
            // Заготовить всё
            startLink = allLinks.find(l => l.text.includes('заготовить всё') || l.href.includes('putAllLink'));
            if (!startLink) {
                startLink = allLinks.find(l => l.text === 'поставить' || l.href.includes('putLink'));
            }
        }

        if (startLink) {
            let startUrl = this.getAbsoluteUrl(startLink.href, currentUrl);
            db.saveTimer('kb_cel_buying', 0); 
            await client.fetchHtml(startUrl);
            console.log(`🍯 Погреб: Банки успешно поставлены!`);
            return true;
        }
        return false;
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

            // 🔍 НОВЫЙ ПАРСЕР ЗАЛОЖЕННЫХ ПОЛОК: Ищем названия прямо в сыром тексте перед "(будет готово через"
            let cookingNow = [];
            let R_COOKING = /(.{1,40})\s*\(\s*будет готово через/gi;
            let cmatch;
            while ((cmatch = R_COOKING.exec(pageText)) !== null) {
                let name = cmatch[1].trim();
                if (name && !cookingNow.includes(name)) cookingNow.push(name);
            }

            let checkWork = () => {
                if (allLinks.some(l => l.text.includes('продать всё') || l.text.includes('продать все'))) return true;
                if (pageText.includes('пустая полка') && allLinks.some(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'))) return true;
                return false;
            };

            if (checkWork()) {
                let isSkillOn = db.getAccountSettings('culinary_skill') === 'true';

                if (db.getAccountSettings('use_workers') === 'true' && !isSkillOn) {
                    console.log(`👩‍🍳 Погреб: Нанимаем Дарью для работы...`);
                    db.saveTimer('kb_cel_timer', Date.now() + 60000);
                    await workers.process(7, 'worker', 'mycellar', 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                    return;
                } 
                else {
                    let harvested = await this.harvest(client, db, $, startUrl, allLinks, workers);
                    if (harvested) {
                        await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                        return;
                    }

                    if (pageText.includes('пустая полка')) {
                        let fillLink = allLinks.find(l => l.href.includes('putAllLink') || l.text.includes('заготовить всё') || l.text.includes('выбрать'));
                        
                        if (fillLink) {
                            let currentLevel = db.getProfile().level || 0;
                            let target = this.chooseTarget(db, currentLevel, cookingNow); 
                            
                            let actionUrl = (target.mode === 'UPGRADE' && target.url) ? target.url : this.getAbsoluteUrl(fillLink.href, startUrl);
                            
                            let recipe$ = await client.fetchHtml(actionUrl);
                            if (recipe$) {
                                let isCooked = await this.cook(client, db, recipe$, actionUrl, target, workers);
                                
                                await this.hidePanel(client, $, startUrl, 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink');
                                
                                if (isCooked) {
                                    db.saveTimer('kb_cel_timer', Date.now() + 3000); 
                                } else {
                                    db.saveTimer('kb_cel_timer', Date.now() + 1500); 
                                }
                                return;
                            }
                        }
                    }
                }
            }

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