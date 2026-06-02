const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Подключаем наши внешние справочники
const seedData = require('./SeedData');
const seedItems = require('./house/SeedItems'); 

// Вынесли дефолтный профиль в константу для чистоты кода
const DEFAULT_PROFILE = {
    nickname: 'Неизвестно', level: 0, game_id: '?', xp_day: '-', 
    max_lottery: 0, coins: 0, rubies: 0, xp_total: 0, xp_today: 0, 
    xp_start_day: 0, last_xp_update: 0, materials: {}, interior: {}, 
    storeroom: {}, recipe_book: {}, is_building: 0
};

class DBManager {
    constructor() {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('📁 Создана директория для данных: /data');
        }

        this.db = new Database(path.join(dataDir, 'database.sqlite'));
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 10000');
        
        // Хранилище для предкомпилированных запросов
        this.stmts = {}; 
        
        this.init();
    }

    // ==========================================
    // 1. ИНИЦИАЛИЗАЦИЯ И СХЕМА БД
    // ==========================================
    init() {
        this.db.exec(`CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            is_active INTEGER DEFAULT 1
        )`);

        this.db.exec(`CREATE TABLE IF NOT EXISTS timers (
            account_id INTEGER,
            key TEXT,
            value INTEGER,
            PRIMARY KEY (account_id, key),
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`);

        this.db.exec(`CREATE TABLE IF NOT EXISTS global_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        this.db.exec(`CREATE TABLE IF NOT EXISTS account_settings (
            account_id INTEGER,
            key TEXT,
            value TEXT,
            PRIMARY KEY (account_id, key),
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`);

        // Создаем таблицу профилей
        this.db.exec(`CREATE TABLE IF NOT EXISTS profile (
            account_id INTEGER PRIMARY KEY,
            nickname TEXT,
            level INTEGER DEFAULT 0,
            game_id TEXT,
            xp_day TEXT,
            max_lottery INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 0,
            rubies INTEGER DEFAULT 0,
            xp_total INTEGER DEFAULT 0,
            xp_today INTEGER DEFAULT 0,
            xp_start_day INTEGER DEFAULT 0,
            last_xp_update INTEGER DEFAULT 0,
            materials TEXT,
            interior TEXT,
            storeroom TEXT, 
            recipe_book TEXT,
            is_building INTEGER DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )`);

        // Умные миграции колонок (без костыльных try/catch)
        this._ensureColumnExists('profile', 'interior', 'TEXT DEFAULT "{}"');
        this._ensureColumnExists('profile', 'storeroom', 'TEXT DEFAULT "{}"');
        this._ensureColumnExists('profile', 'recipe_book', 'TEXT DEFAULT "{}"');
        this._ensureColumnExists('profile', 'is_building', 'INTEGER DEFAULT 0');

        this.db.exec(`CREATE TABLE IF NOT EXISTS riddles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT UNIQUE,
            answer TEXT
        )`);

        this.db.exec(`CREATE TABLE IF NOT EXISTS skips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            img_name TEXT,
            trigger_text TEXT,
            action_text TEXT,
            UNIQUE(img_name, trigger_text)
        )`);

        this.db.exec(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            image TEXT,
            name TEXT,
            beauty INTEGER,
            convenience INTEGER,
            status INTEGER,
            can_improve INTEGER,
            lotteries TEXT
        )`);

        // Таблица для хранения Базы Знаний рецептов Погреба
        this.db.exec(`CREATE TABLE IF NOT EXISTS recipes_kb (
            id INTEGER PRIMARY KEY,
            name TEXT,
            req_level INTEGER DEFAULT 0,
            req_mastery INTEGER DEFAULT 0,
            is_author INTEGER DEFAULT 0,
            is_hard INTEGER DEFAULT 0,
            price INTEGER DEFAULT 0,
            ingredients TEXT,
            time_min INTEGER DEFAULT 0,
            hash TEXT,
            max_mastery INTEGER DEFAULT 0,
            unlock_conditions TEXT
        )`);

        // Передаем эстафету в пост-инициализацию
        this._postInitSetup();
    }

    // Хелпер для безопасного обновления таблиц "на лету"
    _ensureColumnExists(tableName, columnName, columnDef) {
        const columns = this.db.pragma(`table_info(${tableName})`);
        const exists = columns.some(col => col.name === columnName);
        if (!exists) {
            console.log(`🛠️ Миграция БД: добавляем колонку '${columnName}' в таблицу '${tableName}'...`);
            this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        }
    }

    // ==========================================
    // 2. ПОДГОТОВКА ДАННЫХ И КЭША
    // ==========================================
    _postInitSetup() {
        const changes = this.db.prepare(`DELETE FROM timers WHERE key IS NULL OR key = 'null'`).run().changes;
        if (changes > 0) {
            console.log(`🧹 База данных очищена: удалено ${changes} мусорных строк из таблицы таймеров!`);
        }

        this.seedZavalinka();
        this.seedInteriorItems();

        this._prepareStatements();
    }

    // Компилируем запросы один раз и держим их в памяти
    _prepareStatements() {
        this.stmts.saveTimer = this.db.prepare('INSERT OR REPLACE INTO timers (account_id, key, value) VALUES (?, ?, ?)');
        this.stmts.getTimer = this.db.prepare('SELECT value FROM timers WHERE account_id = ? AND key = ?');
        
        this.stmts.saveGlobal = this.db.prepare('INSERT OR REPLACE INTO global_settings (key, value) VALUES (?, ?)');
        this.stmts.getGlobal = this.db.prepare('SELECT value FROM global_settings WHERE key = ?');
        
        this.stmts.saveAccountSettings = this.db.prepare('INSERT OR REPLACE INTO account_settings (account_id, key, value) VALUES (?, ?, ?)');
        this.stmts.getAccountSettings = this.db.prepare('SELECT value FROM account_settings WHERE account_id = ? AND key = ?');
        
        this.stmts.getProfile = this.db.prepare('SELECT * FROM profile WHERE account_id = ?');
        this.stmts.saveProfile = this.db.prepare(`
            INSERT OR REPLACE INTO profile 
            (account_id, nickname, level, game_id, xp_day, max_lottery, coins, rubies, xp_total, xp_today, xp_start_day, last_xp_update, materials, interior, storeroom, recipe_book, is_building) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        this.stmts.getRiddles = this.db.prepare('SELECT question, answer FROM riddles');
        this.stmts.getSkips = this.db.prepare('SELECT img_name, trigger_text, action_text FROM skips');

        // Подготовленные запросы для рецептов
        this.stmts.saveRecipe = this.db.prepare(`
            INSERT OR REPLACE INTO recipes_kb 
            (id, name, req_level, req_mastery, is_author, is_hard, price, ingredients, time_min, hash, max_mastery, unlock_conditions) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        this.stmts.getRecipe = this.db.prepare('SELECT * FROM recipes_kb WHERE id = ?');
        this.stmts.getAllRecipes = this.db.prepare('SELECT * FROM recipes_kb');
    }

    seedZavalinka() {
        console.log('🌱 Синхронизируем базу загадок и скипов...');
        const insertRiddleStmt = this.db.prepare('INSERT OR IGNORE INTO riddles (question, answer) VALUES (?, ?)');
        const insertSkipStmt = this.db.prepare('INSERT OR IGNORE INTO skips (img_name, trigger_text, action_text) VALUES (?, ?, ?)');
        
        this.db.transaction(() => {
            for (let r of seedData.riddles) insertRiddleStmt.run(r.q, r.a);
            for (let img in seedData.skips) {
                for (let s of seedData.skips[img]) {
                    insertSkipStmt.run(img, s.t, s.a);
                }
            }
        })();
    }

    seedInteriorItems() {
        console.log('🛋️ Синхронизируем базу предметов интерьера...');
        const insertItemStmt = this.db.prepare(`
            INSERT OR IGNORE INTO items 
            (id, image, name, beauty, convenience, status, can_improve, lotteries) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.db.transaction(() => {
            for (let item of seedItems) {
                const lotteriesJson = JSON.stringify(item.lotteries);
                const canImproveInt = item.can_improve ? 1 : 0;
                
                insertItemStmt.run(
                    item.id, item.image, item.name, 
                    item.beauty, item.convenience, item.status, 
                    canImproveInt, lotteriesJson
                );
            }
        })();
    }

    // ==========================================
    // 3. УПРАВЛЕНИЕ АККАУНТАМИ
    // ==========================================
    addAccount(username, password) {
        try {
            const stmt = this.db.prepare('INSERT INTO accounts (username, password) VALUES (?, ?)');
            stmt.run(username, password);
            return true;
        } catch (e) { return false; }
    }

    getAccounts() {
        return this.db.prepare('SELECT id, username, password, is_active FROM accounts').all();
    }

    toggleAccount(id, isActive) {
        this.db.prepare('UPDATE accounts SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
    }

    deleteAccount(id) {
        this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
        this.db.prepare('DELETE FROM timers WHERE account_id = ?').run(id);
        this.db.prepare('DELETE FROM account_settings WHERE account_id = ?').run(id);
        this.db.prepare('DELETE FROM profile WHERE account_id = ?').run(id);
    }

    // ==========================================
    // 4. ТАЙМЕРЫ И НАСТРОЙКИ (KEY-VALUE)
    // ==========================================
    saveTimer(accountId, key, value) {
        this.stmts.saveTimer.run(accountId, key, value);
    }

    getTimer(accountId, key) {
        const row = this.stmts.getTimer.get(accountId, key);
        if (!row && key === 'mod_designer') return 1; 
        return row ? row.value : 0;
    }

    saveGlobal(key, value) {
        this.stmts.saveGlobal.run(key, String(value));
    }

    getGlobal(key) {
        const row = this.stmts.getGlobal.get(key);
        return row ? row.value : null;
    }

    saveAccountSettings(accountId, key, value) {
        this.stmts.saveAccountSettings.run(accountId, key, String(value));
    }

    getAccountSettings(accountId, key) {
        const row = this.stmts.getAccountSettings.get(accountId, key);
        return row ? row.value : null;
    }

    // ==========================================
    // 5. РАБОТА С ПРОФИЛЕМ (JSON)
    // ==========================================
    _parseJson(data) {
        if (typeof data === 'object' && data !== null) return data;
        try { return JSON.parse(data) || {}; } catch (e) { return {}; }
    }

    _stringifyJson(data) {
        if (typeof data === 'string') return data;
        try { return JSON.stringify(data || {}); } catch (e) { return '{}'; }
    }

    getProfile(accountId) {
        const row = this.stmts.getProfile.get(accountId);
        if (row) {
            row.materials = this._parseJson(row.materials);
            row.interior = this._parseJson(row.interior);
            row.storeroom = this._parseJson(row.storeroom);
            row.recipe_book = this._parseJson(row.recipe_book);
            return row;
        }
        return { ...DEFAULT_PROFILE }; 
    }

    saveProfile(accountId, data) {
        const current = this.getProfile(accountId);
        const merged = { ...current, ...data };
        
        let matStr = this._stringifyJson(merged.materials);
        let intStr = this._stringifyJson(merged.interior);
        let storeStr = this._stringifyJson(merged.storeroom);
        let recipeBookStr = this._stringifyJson(merged.recipe_book);
        
        this.stmts.saveProfile.run(
            accountId, merged.nickname, merged.level, merged.game_id, merged.xp_day, 
            merged.max_lottery, merged.coins, merged.rubies, merged.xp_total, merged.xp_today, 
            merged.xp_start_day, merged.last_xp_update, matStr, intStr, storeStr, recipeBookStr,
            merged.is_building ? 1 : 0 
        );
    }

    // ==========================================
    // 6. ПОИСКОВЫЕ МЕТОДЫ (ЗАГАДКИ И СКИПЫ)
    // ==========================================
    findRiddleAnswer(text) {
        const riddles = this.stmts.getRiddles.all();
        for (let r of riddles) {
            let cleanDbQuestion = r.question.replace(/^\d+\.\s*/, '').trim().substring(0, 20);
            if (text.includes(cleanDbQuestion) || cleanDbQuestion.includes(text.substring(0, 20))) {
                return r.answer;
            }
        }
        return null;
    }

    findSkipAction(imgName, text) {
        const skips = this.stmts.getSkips.all();
        for (let s of skips) {
            if (imgName.includes(s.img_name) && text.includes(s.trigger_text)) {
                return s.action_text;
            }
        }
        return null;
    }

    // ==========================================
    // 7. БАЗА ЗНАНИЙ РЕЦЕПТОВ (ПОГРЕБ)
    // ==========================================
    saveRecipe(recipe) {
        let ingStr = this._stringifyJson(recipe.ingredients);
        let unlockStr = this._stringifyJson(recipe.unlock_conditions);
        
        this.stmts.saveRecipe.run(
            recipe.id, 
            recipe.name, 
            recipe.req_level || 0, 
            recipe.req_mastery || 0,
            recipe.is_author ? 1 : 0, 
            recipe.is_hard ? 1 : 0, 
            recipe.price || 0,
            ingStr, 
            recipe.time_min || 0, 
            recipe.hash, 
            recipe.max_mastery || 0, 
            unlockStr
        );
    }

    getRecipe(id) {
        const row = this.stmts.getRecipe.get(id);
        if (row) {
            row.ingredients = this._parseJson(row.ingredients);
            row.unlock_conditions = this._parseJson(row.unlock_conditions);
            row.is_author = row.is_author === 1;
            row.is_hard = row.is_hard === 1;
        }
        return row;
    }

    getAllRecipes() {
        const rows = this.stmts.getAllRecipes.all();
        return rows.map(row => {
            row.ingredients = this._parseJson(row.ingredients);
            row.unlock_conditions = this._parseJson(row.unlock_conditions);
            row.is_author = row.is_author === 1;
            row.is_hard = row.is_hard === 1;
            return row;
        });
    }

    // 🌶️ ДОБАВЛЕНО: Точечное добавление открытого рецепта в базу
    addUnlockedRecipe(accountId, recipeName) {
        const profile = this.getProfile(accountId);
        if (!profile) return;
        
        // Инициализируем книгу, если она вдруг пуста
        if (!profile.recipe_book) profile.recipe_book = {};
        
        // Добавляем рецепт с мастерством 0
        profile.recipe_book[recipeName] = 0;
        
        // Сохраняем ТОЛЬКО это поле, чтобы не делать тяжелый апдейт всего профиля
        const stmt = this.db.prepare('UPDATE profile SET recipe_book = ? WHERE account_id = ?');
        stmt.run(JSON.stringify(profile.recipe_book), accountId);
    }

    getSpicesToUnlock(accountId) {
        const profile = this.getProfile(accountId);
        if (!profile || profile.level === 0) return {};

        const recipes = this.getAllRecipes();
        const spiceMap = {}; 

        // Черный список специй за рубины (строго именительный падеж)
        const RUBY_SPICES = [
            'Перец чёрный молотый',
            'Спирт для ликёров',
            'Корица',
            'Куркума',
            'Живая вода',
            'Мука'
        ];

        for (const recipe of recipes) {
            if (profile.level >= recipe.req_level && !profile.recipe_book[recipe.name]) {
                if (recipe.unlock_conditions && recipe.unlock_conditions.by_spice) {
                    
                    let spicesArray = Array.isArray(recipe.unlock_conditions.by_spice) 
                        ? recipe.unlock_conditions.by_spice 
                        : recipe.unlock_conditions.by_spice.split(/(?=[A-ZА-ЯЁ])/).map(s => s.trim()).filter(Boolean);
                    
                    spicesArray.forEach(spice => {
                        if (RUBY_SPICES.includes(spice)) return;
                        
                        if (!spiceMap[spice]) spiceMap[spice] = [];
                        spiceMap[spice].push(recipe.name);
                    });
                }
            }
        }

        return spiceMap; 
    }
}

module.exports = DBManager;