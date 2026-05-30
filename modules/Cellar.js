const BaseModule        = require('../core/BaseModule');
const { URL }           = require('url');
const RecipeBookScanner = require('../core/RecipeBookScanner');

// ─── Константы ────────────────────────────────────────────────────────────────

const BASE_HOST   = 'https://sadovnik.mobi';
const WORKER_LINK = 'mycellar?-1.ILinkListener-cellarBonusPanel-fireWorkerLink';

const COOLDOWN = {
    HARVEST:    3_000,
    WORKER:    60_000,
    TICK:      15_000,
    PAUSE:  7_200_000,  // 2 часа — пауза при нехватке монет
    DEFAULT:  300_000,  // 5 минут — дефолтный сон
};

// ─── Модуль ───────────────────────────────────────────────────────────────────

class CellarModule extends BaseModule {

    // ==========================================
    // 🔧 УТИЛИТЫ
    // ==========================================

    static getAbsoluteUrl(href, baseUrl) {
        if (!href) return null;
        try {
            const cleanHref = href.replace(/&amp;/g, '&');
            const base = baseUrl.startsWith('http')
                ? baseUrl
                : `${BASE_HOST}${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
            const u = new URL(cleanHref, base);
            return u.pathname + u.search;
        } catch {
            return href;
        }
    }

    static extractTime(timeStr) {
        if (!timeStr) return null;
        let totalMs = 0;
        const hMatch = timeStr.match(/(\d+)\s*(?:ч|час)/i);
        const mMatch = timeStr.match(/(\d+)\s*(?:м|мин)/i);
        const sMatch = timeStr.match(/(\d+)\s*(?:с|сек)/i);
        if (hMatch) totalMs += parseInt(hMatch[1], 10) * 3_600_000;
        if (mMatch) totalMs += parseInt(mMatch[1], 10) *    60_000;
        if (sMatch) totalMs += parseInt(sMatch[1], 10) *     1_000;
        return totalMs > 0 ? totalMs : null;
    }

    static cleanName(name) {
        return name.toLowerCase().split('(')[0].trim();
    }

    /** Собирает все ссылки страницы в единый массив { href, text }. */
    static _collectLinks($) {
        const links = [];
        $('a').each((_, el) => links.push({
            href: $(el).attr('href') || '',
            text: $(el).text().toLowerCase().trim(),
        }));
        return links;
    }

    // ==========================================
    // 👁️ УПРАВЛЕНИЕ ПАНЕЛЬЮ
    // ==========================================

    static async openPanel(client, $, currentUrl) {
        if (!$) return null;
        const href = $('a')
            .filter((_, el) => ($(el).attr('href') || '').includes('BonusPanel-openLink'))
            .first().attr('href');
        if (href) {
            const page = await client.fetchHtml(this.getAbsoluteUrl(href, currentUrl));
            return page ?? $;
        }
        return $;
    }

    static async hidePanel(client, $, currentUrl, fireUrlPattern = null) {
        if (!$) return null;
        const hideHref = $('a')
            .filter((_, el) => ($(el).attr('href') || '').includes('BonusPanel-hideLink'))
            .first().attr('href');

        let finalUrl = hideHref ? this.getAbsoluteUrl(hideHref, currentUrl) : null;

        if (!finalUrl && fireUrlPattern) {
            const vMatch = $.html().match(/\?(\d+)-/);
            if (vMatch) {
                const fire = fireUrlPattern
                    .replace('?-1', `?${vMatch[1]}`)
                    .replace('fireWorkerLink', 'hideLink');
                finalUrl = this.getAbsoluteUrl(`/${fire}`, currentUrl);
            }
        }

        if (finalUrl) {
            const page = await client.fetchHtml(finalUrl);
            return page ?? $;
        }
        return $;
    }

    // ==========================================
    // 💾 РАБОТА С БАЗОЙ ДАННЫХ
    // ==========================================

    /**
     * Читает свежую Книгу Рецептов, обходя кэш.
     * Цепочка: метод модели → прямой SQL по таблицам accounts/users.
     */
    static _readFreshRecipeBook(db, username) {
        if (typeof db.db.getAccount === 'function') {
            const acc = db.db.getAccount(username);
            if (acc?.profile) {
                const p = typeof acc.profile === 'string' ? JSON.parse(acc.profile) : acc.profile;
                if (p.recipe_book) return p.recipe_book;
            }
        }

        for (const table of ['accounts', 'users']) {
            try {
                const row = db.db.db
                    .prepare(`SELECT profile FROM ${table} WHERE username = ?`)
                    .get(username);
                if (row?.profile) {
                    const p = typeof row.profile === 'string' ? JSON.parse(row.profile) : row.profile;
                    if (p.recipe_book) {
                        console.log(`📂 Погреб: Книга рецептов из SQLite (${table})`);
                        return p.recipe_book;
                    }
                }
            } catch { /* таблица не найдена — пробуем следующую */ }
        }
        return null;
    }

    /**
     * Возвращает активные (не просроченные) записи о готовке.
     * Побочный эффект: очищает устаревшие записи из настроек.
     */
    static _getActiveCooking(db) {
        try {
            const saved = db.getAccountSettings('kb_cel_cooking');
            if (!saved) return [];
            const all    = JSON.parse(saved);
            const active = all.filter(item => item.finishTime > Date.now());
            if (active.length < all.length) {
                db.saveAccountSettings('kb_cel_cooking', JSON.stringify(active));
                console.log(`🧹 Погреб: Просроченные записи о готовке очищены.`);
            }
            return active;
        } catch {
            return [];
        }
    }

    /** Сохраняет запись о поставленном рецепте. */
    static _rememberCooking(db, target) {
        if (!target.name) return;
        try {
            const cookingNow  = this._getActiveCooking(db);
            const cleanRName  = this.cleanName(target.name);
            if (cookingNow.some(item => item.name === cleanRName)) return;

            const timeMin = target.time_min || 60;
            cookingNow.push({
                name:       cleanRName,
                finishTime: Date.now() + timeMin * 60_000 + 15_000,
            });
            db.saveAccountSettings('kb_cel_cooking', JSON.stringify(cookingNow));
            console.log(`📝 Погреб: Запомнили -> ${target.name} (${timeMin} мин)`);
        } catch (e) {
            console.error('🚨 Ошибка сохранения kb_cel_cooking:', e);
        }
    }

    // ==========================================
    // 🧠 ВЫБОР ЦЕЛИ
    // ==========================================

    static chooseTarget(db, currentLevel, cookingNow = [], freshRecipeBook = null) {
        if (db.getAccountSettings('culinary_skill') !== 'true') return { mode: 'FARM' };

        const profile    = db.getProfile();
        let   recipeBook = freshRecipeBook ?? profile.recipe_book ?? {};

        if (typeof recipeBook === 'string') {
            try { recipeBook = JSON.parse(recipeBook); }
            catch (e) {
                console.error('🚨 Ошибка распаковки Книги Рецептов:', e);
                recipeBook = {};
            }
        }

        const whitelist  = this._buildWhiteList(recipeBook);
        const candidates = this._filterCandidates(db, whitelist, currentLevel, cookingNow);

        if (candidates.length === 0) {
            console.log('⏳ Погреб: Все доступные рецепты прокачаны или заняты!');
            return { mode: 'WAIT' };
        }

        // Сортировка: высокоуровневые → простые
        candidates.sort((a, b) => b.req_level - a.req_level);
        const target = candidates[0];

        const ings = Array.isArray(target.ingredients)
            ? target.ingredients.join('/')
            : target.ingredients;
        const url = `/recipe/${target.id}/${ings}/${target.time_min}/${target.hash}`;

        console.log(`🎯 Погреб: Цель -> ${target.name} (Мастерство: ${target.current_mastery}/${target.max_mastery})`);
        return { mode: 'UPGRADE', url, name: target.name, time_min: target.time_min };
    }

    /** Нормализует Книгу Рецептов в единый формат [{ name, mastery }]. */
    static _buildWhiteList(recipeBook) {
        const checkValue = (val) => {
            if (val === 'MAX' || (typeof val === 'string' && /Идеальный/i.test(val))) return 'MAX';
            const parsed = parseInt(val, 10);
            return Number.isNaN(parsed) ? 0 : parsed;
        };

        if (Array.isArray(recipeBook)) {
            return recipeBook.flatMap(item => {
                if (!item) return [];
                if (item.name) {
                    const val = item.mastery ?? item.value ?? item.progress;
                    return [{ name: this.cleanName(item.name), mastery: checkValue(val) }];
                }
                if (Array.isArray(item) && item.length >= 2) {
                    return [{ name: this.cleanName(item[0]), mastery: checkValue(item[1]) }];
                }
                if (typeof item === 'object') {
                    return Object.entries(item).map(([k, v]) => ({
                        name:    this.cleanName(k),
                        mastery: checkValue(v),
                    }));
                }
                return [];
            });
        }

        if (typeof recipeBook === 'object' && recipeBook !== null) {
            return Object.entries(recipeBook).map(([k, v]) => ({
                name:    this.cleanName(k),
                mastery: checkValue(v),
            }));
        }

        return [];
    }

    /** Фильтрует кандидатов по уровню персонажа, мастерству и дублям на полках. */
    static _filterCandidates(db, whitelist, currentLevel, cookingNow) {
        const allRecipes = db.db.getAllRecipes();

        return whitelist.reduce((acc, myRecipe) => {
            if (myRecipe.mastery === 'MAX') return acc;
            if (cookingNow.some(cn => cn.name === myRecipe.name)) return acc;

            const globalData = allRecipes.find(r => this.cleanName(r.name) === myRecipe.name);
            if (!globalData)                                 return acc;
            if (globalData.req_level > currentLevel)         return acc;
            if (myRecipe.mastery >= globalData.max_mastery)  return acc;

            acc.push({ ...globalData, current_mastery: myRecipe.mastery });
            return acc;
        }, []);
    }

    // ==========================================
    // 🔍 АНАЛИЗ СТАТУСА
    // ==========================================

    static analyzeStatus($, pageText, allLinks) {
        const canHarvest = allLinks.some(l =>
            l.text.includes('продать всё') || l.text.includes('продать все')
        );

        let emptyShelves = 0;
        if ($) {
            $('span.title').each((_, el) => {
                if ($(el).text().toLowerCase().includes('пустая полка')) emptyShelves++;
            });
        }
        // Фолбэк через regex, если span.title не отработал
        if (emptyShelves === 0 && pageText.includes('пустая полка')) {
            emptyShelves = (pageText.match(/пустая полка/gi) || []).length;
        }

        return { canHarvest, emptyShelves };
    }

    // ==========================================
    // 🍯 ДЕЙСТВИЯ
    // ==========================================

    /** Продаёт готовый урожай. */
    static async handleHarvest(client, db, currentUrl, allLinks) {
        const sellLink = allLinks.find(l =>
            l.text.includes('продать всё') || l.text.includes('продать все')
        );
        if (!sellLink) return false;

        await client.fetchHtml(this.getAbsoluteUrl(sellLink.href, currentUrl));
        console.log(`🆙 Погреб: Урожай собран!`);
        db.saveTimer('kb_cel_timer', Date.now() + COOLDOWN.HARVEST);
        return true;
    }

    /** Конвейер посадки: сканирует книгу, заполняет пустые полки. */
    static async handlePlanting(client, db, startUrl, emptyShelvesCount, currentLevel, workers) {
        console.log(`🔍 Погреб: ${emptyShelvesCount} пустых полок. Сканируем Книгу Рецептов...`);
        await new RecipeBookScanner(client, db.db, workers.username).scan();

        const freshRecipeBook = this._readFreshRecipeBook(db, workers.username);

        let $ = await client.fetchHtml(startUrl);
        if (!$) return null;

        for (let i = 0; i < emptyShelvesCount; i++) {
            $ = await this.openPanel(client, $, startUrl);

            const allLinks = this._collectLinks($);
            const fillLink = allLinks.find(l =>
                l.href.includes('putAllLink') ||
                l.text.includes('заготовить всё') ||
                l.text.includes('выбрать')
            );
            if (!fillLink) break;

            const cookingNow = this._getActiveCooking(db);
            const target     = this.chooseTarget(db, currentLevel, cookingNow, freshRecipeBook);
            if (target.mode === 'WAIT') break;

            const actionUrl = (target.mode === 'UPGRADE' && target.url)
                ? target.url
                : this.getAbsoluteUrl(fillLink.href, startUrl);

            const recipe$ = await client.fetchHtml(actionUrl);
            if (recipe$) await this.cook(client, db, recipe$, actionUrl, target);

            $ = await client.fetchHtml(startUrl);
            if (!$) break;
        }

        return this.hidePanel(client, $, startUrl, WORKER_LINK);
    }

    /** Физически ставит банки на полку. */
    static async cook(client, db, $, currentUrl, target) {
        let allLinks = this._collectLinks($);

        // Закупка ингредиентов (если нужна)
        const buyLinks = allLinks.filter(l => l.text.includes('докупить состав на'));
        if (buyLinks.length > 0) {
            const buyingTimer = db.getTimer('kb_cel_buying') || 0;
            if (Date.now() < buyingTimer) {
                console.log(`❌ Погреб: Не хватает монет! Пауза на 2 часа.`);
                db.saveTimer('kb_cel_pause',  Date.now() + COOLDOWN.PAUSE);
                db.saveTimer('kb_cel_buying', 0);
                return;
            }

            const bL = target.mode === 'UPGRADE' ? buyLinks[0] : buyLinks[buyLinks.length - 1];
            console.log(target.mode === 'UPGRADE'
                ? `🛒 Погреб: Закупаем 1 порцию (Прокачка)`
                : `🛒 Погреб: Закупаем все полки (Фарм)`);

            db.saveTimer('kb_cel_buying', Date.now() + COOLDOWN.TICK);
            $ = await client.fetchHtml(this.getAbsoluteUrl(bL.href, currentUrl));
            if (!$) return;
            allLinks = this._collectLinks($);
        }

        // Выбор кнопки посадки
        const startLink = target.mode === 'UPGRADE'
            ? allLinks.find(l => l.text === 'поставить' || (l.href.includes('putLink') && !l.href.includes('putAllLink')))
            : (allLinks.find(l => l.text.includes('заготовить всё') || l.href.includes('putAllLink'))
               ?? allLinks.find(l => l.text === 'поставить' || l.href.includes('putLink')));

        if (!startLink) return;

        db.saveTimer('kb_cel_buying', 0);
        const result$ = await client.fetchHtml(this.getAbsoluteUrl(startLink.href, currentUrl));
        if (!result$) return;

        const pageText = result$('body').text().toLowerCase();
        if (pageText.includes('будет готово через') || pageText.includes('осталось')) {
            console.log(`🍯 Погреб: Банки успешно поставлены!`);
            this._rememberCooking(db, target);
        } else {
            console.log(`❌ Погреб: Сбой при посадке! (Банка не появилась)`);
        }
    }

    // ==========================================
    // ⏱️ ТАЙМЕР
    // ==========================================

    static updateSleepTimer(db, pageText) {
        const regex = /(?:через|осталось)\s+(.{0,30})/gi;
        let minTimeMs = Infinity;
        let match;
        while ((match = regex.exec(pageText)) !== null) {
            const ms = this.extractTime(match[1]);
            if (ms !== null && ms > 0 && ms < minTimeMs) minTimeMs = ms;
        }
        db.saveTimer('kb_cel_timer', Date.now() + (isFinite(minTimeMs) ? minTimeMs : COOLDOWN.DEFAULT));
    }

    // ==========================================
    // ⚙️ ДИСПЕТЧЕР
    // ==========================================

    static async execute(client, db, workers) {
        try {
            if (!this.isInitialScanDone) {
                console.log('🔍 Погреб: Первый запуск! Синхронизируем Книгу Рецептов...');
                await new RecipeBookScanner(client, db.db, workers.username).scan();
                this.isInitialScanDone = true;
            }

            console.log('🥫 Анализируем Погреб...');

            const pauseUntil = db.getTimer('kb_cel_pause') || 0;
            if (Date.now() < pauseUntil) {
                db.saveTimer('kb_cel_timer', Date.now() + COOLDOWN.DEFAULT);
                return;
            }

            const currentLevel = db.getProfile().level || 0;
            const startUrl     = '/mycellar';
            let   $ = await client.fetchHtml(startUrl);
            if (!$) return;

            $ = await this.openPanel(client, $, startUrl);

            const allLinks  = this._collectLinks($);
            const pageText  = $('body').text().toLowerCase();
            const isSkillOn = db.getAccountSettings('culinary_skill') === 'true';
            const status    = this.analyzeStatus($, pageText, allLinks);

            // Очистка просроченных записей о готовке (побочный эффект)
            this._getActiveCooking(db);

            // Режим работника Дарьи (только при выключенном навыке прокачки)
            if (db.getAccountSettings('use_workers') === 'true' &&
                !isSkillOn &&
                (status.canHarvest || status.emptyShelves > 0)) {
                console.log(`👩‍🍳 Погреб: Нанимаем Дарью...`);
                db.saveTimer('kb_cel_timer', Date.now() + COOLDOWN.WORKER);
                await workers.process(7, 'worker', 'mycellar', WORKER_LINK);
                return;
            }

            if (status.canHarvest) {
                const harvested = await this.handleHarvest(client, db, startUrl, allLinks);
                if (harvested) {
                    await this.hidePanel(client, $, startUrl, WORKER_LINK);
                    return;
                }
            }

            if (status.emptyShelves > 0) {
                $ = await this.handlePlanting(client, db, startUrl, status.emptyShelves, currentLevel, workers);
            } else {
                $ = await this.hidePanel(client, $, startUrl, WORKER_LINK);
            }

            if ($) {
                this.updateSleepTimer(db, $('body').text().toLowerCase());
            }

        } catch (e) {
            console.error('🚨 КРИТИЧЕСКАЯ ОШИБКА В ПОГРЕБЕ:', e);
            db.saveTimer('kb_cel_timer', Date.now() + COOLDOWN.DEFAULT);
        }
    }
}

module.exports = CellarModule;