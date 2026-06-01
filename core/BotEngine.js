const GameClient = require('./GameClient');
const WorkerManager = require('./WorkerManager');
const ProfileScanner = require('./ProfileScanner'); 

const HouseScanner = require('./house/HouseScanner');
const StoreroomScanner = require('./house/StoreroomScanner');
const RecipeBookScanner = require('./RecipeBookScanner'); // 📖 ДОБАВЛЕНО: Импорт сканера рецептов

const FarmModule = require('../modules/Farm');
const LotteryModule = require('../modules/lottery/Lottery');
const TreasuryModule = require('../modules/Treasury');
const HeliModule = require('../modules/Heli');
const PondsModule = require('../modules/Ponds');
const RanchoModule = require('../modules/Rancho');
const ZagonModule = require('../modules/Zagon');
const CellarModule = require('../modules/Cellar');
const NurseryModule = require('../modules/nursery/Nursery');
const ZavalinkaModule = require('../modules/Zavalinka'); 
const ArenaModule = require('../modules/Arena'); 
const DesignerModule = require('../modules/Designer'); 
const UpgraderModule = require('../modules/Upgrader'); 
const TasksModule = require('../modules/TasksModule'); // 📋 ДОБАВЛЕНО: Импорт модуля заданий

class DBWrapper {
    constructor(globalDb, accountId) {
        this.db = globalDb;
        this.accountId = accountId;
    }
    getTimer(key) { return this.db.getTimer(this.accountId, key); }
    saveTimer(key, value) { this.db.saveTimer(this.accountId, key, value); }
    getGlobal(key) { return this.db.getGlobal(key); }
    getAccountSettings(key) { return this.db.getAccountSettings(this.accountId, key); }
    saveAccountSettings(key, value) { this.db.saveAccountSettings(this.accountId, key, value); }
    getProfile() { return this.db.getProfile(this.accountId); }
    saveProfile(data) { this.db.saveProfile(this.accountId, data); }
    
    findRiddleAnswer(text) { return this.db.findRiddleAnswer(text); }
    findSkipAction(imgName, text) { return this.db.findSkipAction(imgName, text); }
}

class BotEngine {
    constructor(accountId, username, password, globalDb) {
        this.client = new GameClient();
        this.accountId = accountId;
        this.username = username;
        this.password = password;
        this.db = new DBWrapper(globalDb, accountId);
        this.workers = new WorkerManager(this.client, this.db, this.username); 
        this.scanner = new ProfileScanner(this.client, this.db, this.username); 
        
        this.houseScanner = new HouseScanner(this.client, this.db, this.username); 
        this.storeScanner = new StoreroomScanner(this.client, this.db, this.username); 

        // 📖 ДОБАВЛЕНО: Инициализация сканера книги рецептов
        // 📖 ДОБАВЛЕНО: Инициализация сканера книги рецептов
        this.recipeScanner = new RecipeBookScanner(this.client, globalDb, this.username); 
        this.isScanningRecipes = false; // 🔒 Мьютекс (защита от двойного сканирования)

        this.isRunning = false;
    }

    // 🔒 Безопасный метод сканирования (чтобы ручной и автоматический запуск не пересеклись)
    async forceRecipeScan() {
        if (this.isScanningRecipes) return { success: false, message: 'Уже сканируется' };
        this.isScanningRecipes = true;
        try {
            await this.recipeScanner.scan();
            this.db.saveTimer('kb_rb_timer', Date.now() + 43200000); // Сдвигаем таймер на 12 часов
            return { success: true };
        } finally {
            this.isScanningRecipes = false; // Снимаем блокировку
        }
    }

    async start() {
        const isLogged = await this.client.login(this.username, this.password);
        if (!isLogged) {
            console.log(`❌ [${this.username}] Ошибка авторизации. Проверьте пароль.`);
            return;
        }

        this.isRunning = true;
        console.log(`🤖 [${this.username}] Сердце бота запущено.`);
        
        // 🐾 ВЫПОЛНЯЕМ АВАРИЙНУЮ ЗАЧИСТКУ РАБОТНИКОВ ПЕРЕД СТАРТОМ
        await this.workers.emergencyCleanup();
        
        await this.scanner.scan();
        await this.houseScanner.scan();
        await this.storeScanner.scan();

        // 📖 ДОБАВЛЕНО: Холодный старт Книги Рецептов
        let profile = this.db.getProfile();
        
        // 🛠️ ВРЕМЕННЫЙ ХАК: убрали проверку (!profile.recipe_book), чтобы принудительно просканировать книгу при запуске!
        if (profile.level >= 10 && (!profile.recipe_book || Object.keys(profile.recipe_book).length === 0)) {
            await this.forceRecipeScan(); // 🔒 Используем безопасный метод
        }

        setInterval(() => {
            if(this.isRunning) {
                this.scanner.scan();
                this.houseScanner.scan();
                this.storeScanner.scan();
            }
        }, 3600000);

        this.tick();
    }

    stop() {
        this.isRunning = false;
        console.log(`🛑 [${this.username}] Бот остановлен.`);
    }

    async tick() {
        if (!this.isRunning) return; 

        let now = Date.now();

        let isMasterOff = this.db.getGlobal('master_off') === '1';
        if (isMasterOff) {
            setTimeout(() => this.tick(), 5000);
            return;
        }

        let pStr = this.db.getAccountSettings('priorities');
        // 📋 ДОБАВЛЕНО: "tasks" в конец списка
        let defaultPriorities = ["farm", "rancho", "zagon", "nursery", "ponds", "cellar", "treasury", "heli", "zavalinka", "arena", "upgrader", "designer", "lottery", "tasks"];
        let priorities = pStr ? JSON.parse(pStr) : defaultPriorities;
        
        defaultPriorities.forEach(mod => {
            if (!priorities.includes(mod)) priorities.push(mod);
        });

        let farmTimer = this.db.getTimer('kb_f_timer') ?? 0;
        let ranchoTimer = this.db.getTimer('kb_r_timer') ?? 0;
        let zagonTimer = this.db.getTimer('kb_z_timer') ?? 0;
        let nurTimer = this.db.getTimer('kb_nur_timer') ?? 0;
        let pondFeedTimer = this.db.getTimer('kb_p_feed_timer') ?? 0;
        let pondGrowTimer = this.db.getTimer('kb_p_grow_timer') ?? 0;
        let cellarTimer = this.db.getTimer('kb_cel_timer') ?? 0;
        let convTimer = this.db.getTimer('kb_c_timer') ?? 0;
        let heliTimer = this.db.getTimer('kb_heli_timer') ?? 0;
        let lotTimer = this.db.getTimer('kb_lot_timer') ?? 0;
        let lotTicketTimer = this.db.getTimer('kb_lot_ticket_timer') ?? 0; // 🎟️ ДОБАВЛЕНО: Чтение таймера билетов
        let zavTimer = this.db.getTimer('kb_zav_timer') ?? 0; 
        let arenaTimer = this.db.getTimer('kb_arena_timer') ?? 0; 
        let designerTimer = this.db.getTimer('kb_design_timer') ?? 0; 
        let upgradeTimer = this.db.getTimer('kb_upgrade_timer') ?? 0; 
        let tasksTimer = this.db.getTimer('kb_tasks_timer') ?? 0; // 📋 ДОБАВЛЕНО: Чтение таймера заданий
        let rbTimer = this.db.getTimer('kb_rb_timer') ?? 0; // 📖 ДОБАВЛЕНО: Чтение таймера Книги Рецептов

        let isFarmOn = this.db.getTimer('mod_farm') !== 0;
        let isRanchoOn = this.db.getTimer('mod_rancho') !== 0;
        let isZagonOn = this.db.getTimer('mod_zagon') !== 0;
        let isNurOn = this.db.getTimer('mod_nursery') !== 0;
        let isPondsOn = this.db.getTimer('mod_ponds') !== 0;
        let isCellarOn = this.db.getTimer('mod_cellar') !== 0;
        let isConvOn = this.db.getTimer('mod_treasury') !== 0;
        let isHeliOn = this.db.getTimer('mod_heli') !== 0;
        let isLotOn = this.db.getTimer('mod_lottery') !== 0;
        let isDesignerOn = this.db.getTimer('mod_designer') !== 0; 
        let isUpgraderOn = this.db.getTimer('mod_upgrader') !== 0; 
        
        let isZavOn = true; 
        let isArenaOn = true; 
        let isTasksOn = true; // 📋 ДОБАВЛЕНО: Безусловное включение заданий

        // 🔒 ВАЖНО: Текущий уровень игрока и словарь ограничений
        let currentLevel = this.db.getProfile().level || 0;
        const unlockLevels = {
            farm: 0, rancho: 0, treasury: 0, cellar: 10, zagon: 10, heli: 10,
            arena: 20, ponds: 30, nursery: 30, lottery: 35, 
            house: 45, upgrader: 45, designer: 45, zavalinka: 45, tasks: 0
        };

        // 📖 ДОБАВЛЕНО: Резервное фоновое сканирование Книги Рецептов (1 раз в 12 часов)
        if (currentLevel >= 10 && rbTimer !== -1 && now >= rbTimer) {
            await this.forceRecipeScan(); // 🔒 Используем безопасный метод
        }

        let executeMap = {
            'farm': async () => { if (isFarmOn && farmTimer !== -1 && now >= farmTimer) await FarmModule.execute(this.client, this.db, this.workers); },
            'rancho': async () => { if (isRanchoOn && ranchoTimer !== -1 && now >= ranchoTimer) await RanchoModule.execute(this.client, this.db, this.workers); },
            'zagon': async () => { if (isZagonOn && zagonTimer !== -1 && now >= zagonTimer) await ZagonModule.execute(this.client, this.db, this.workers); },
            'nursery': async () => { if (isNurOn && nurTimer !== -1 && now >= nurTimer) await NurseryModule.execute(this.client, this.db, this.workers); },
            'ponds': async () => { if (isPondsOn && (now >= pondFeedTimer || now >= pondGrowTimer)) await PondsModule.execute(this.client, this.db, this.workers); },
            'cellar': async () => { if (isCellarOn && cellarTimer !== -1 && now >= cellarTimer) await CellarModule.execute(this.client, this.db, this.workers); },
            'treasury': async () => { if (isConvOn && convTimer !== -1 && now >= convTimer) await TreasuryModule.execute(this.client, this.db, this.workers); },
            'heli': async () => { if (isHeliOn && heliTimer !== -1 && now >= heliTimer) await HeliModule.execute(this.client, this.db, this.workers); },
            
            'zavalinka': async () => { if (isZavOn && zavTimer !== -1 && now >= zavTimer) await ZavalinkaModule.execute(this.client, this.db, this.username); },
            'arena': async () => { if (isArenaOn && arenaTimer !== -1 && now >= arenaTimer) await ArenaModule.execute(this.client, this.db, this.username); },
            
            'upgrader': async () => { if (isUpgraderOn && upgradeTimer !== -1 && now >= upgradeTimer) await UpgraderModule.execute(this.client, this.db, this.username); },
            'designer': async () => { 
                if (isDesignerOn && designerTimer !== -1 && now >= designerTimer) {
                    await DesignerModule.execute(this.client, this.db, this.username); 
                    this.db.saveTimer('kb_design_timer', Date.now() + 7200000);
                }
            },
            // 🎟️ ИЗМЕНЕНО: Лотерея запускается, если сработал таймер прокачки ИЛИ таймер билетов
            'lottery': async () => { 
                if (isLotOn && ((lotTimer !== -1 && now >= lotTimer) || (lotTicketTimer !== -1 && now >= lotTicketTimer))) {
                    await LotteryModule.execute(this.client, this.db, this.workers); 
                }
            },
            // 📋 ДОБАВЛЕНО: Инструкция запуска для заданий
            'tasks': async () => { if (isTasksOn && tasksTimer !== -1 && now >= tasksTimer) await TasksModule.execute(this.client, this.db, this.workers); }
        };

        for (let mod of priorities) {
            let reqLevel = unlockLevels[mod] || 0;

            // 🤫 Тихая блокировка: если профиль загрузился и уровень не дотягивает - переходим к следующему модулю
            if (currentLevel > 0 && currentLevel < reqLevel) continue;

            if (executeMap[mod]) {
                try {
                    await executeMap[mod]();
                } catch (e) {
                    if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
                        console.log(`⚠️ [${this.username}] Сервер игры долго не отвечал модулю [${mod}].`);
                    } else {
                        console.error(`❌ [${this.username}] Ошибка в модуле [${mod}]:`, e.message);
                    }
                }
            }
        }

        setTimeout(() => this.tick(), 5000);
    }
}

module.exports = BotEngine;