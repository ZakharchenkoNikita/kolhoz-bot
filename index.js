const express = require('express');
const path = require('path');

require('./core/Logger').init();

const BotEngine = require('./core/BotEngine');
const DBManager = require('./core/Database');
const Scheduler = require('./core/Scheduler');
const { buildRecipeDashboardData } = require('./core/RecipeManager');

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК ОШИБОК ===
process.on('uncaughtException', (err) => {
    console.error('\n🚨 [КРИТИЧЕСКАЯ ОШИБКА] Бот предотвратил падение сервера!');
    console.error(err.stack || err); // Изменил вывод на err.stack, чтобы писать точную строку ошибки
    console.error('---');
});

// === ЛОВУШКА ДЛЯ ТИХИХ ПАДЕНИЙ ===
process.on('exit', (code) => {
    console.log(`\n💀 ФАТАЛЬНЫЙ ВЫХОД! Бот умер с кодом: ${code}`);
    if (code === 0) {
        console.log('Подсказка: Код 0 означает, что бот почему-то решил штатно завершить работу.');
    } else if (code === 3221225477 || code === 3221226356) {
        console.log('Подсказка: Это код Access Violation. На 99% это SQLite не выдержала параллельной записи.');
    } else {
        console.log('Подсказка: Это системная ошибка ОС или нехватка оперативной памяти.');
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n⚠️ [СЕТЕВАЯ/АСИНХРОННАЯ ОШИБКА] Промис был отклонен:');
    console.error(reason);
    console.error('---');
});
// ===================================

const db = new DBManager();
const scheduler = new Scheduler(db);
const engines = {}; 

function syncEngines() {
    const accounts = db.getAccounts();
    accounts.forEach(acc => {
        if (acc.is_active) {
            if (!engines[acc.id]) {
                console.log(`🚀 Поднимаем бота для аккаунта: ${acc.username}`);
                engines[acc.id] = new BotEngine(acc.id, acc.username, acc.password, db);
                engines[acc.id].start();
            }
        } else {
            if (engines[acc.id]) {
                engines[acc.id].stop();
                delete engines[acc.id];
            }
        }
    });

    Object.keys(engines).forEach(id => {
        if (!accounts.find(a => a.id == id && a.is_active)) {
            engines[id].stop();
            delete engines[id];
        }
    });
}

syncEngines();

app.get('/api/accounts', (req, res) => res.json(db.getAccounts()));

app.post('/api/accounts', (req, res) => {
    const success = db.addAccount(req.body.username, req.body.password);
    if (success) syncEngines();
    res.json({ success });
});

app.post('/api/accounts/toggle', (req, res) => {
    db.toggleAccount(req.body.id, req.body.is_active);
    syncEngines();
    res.json({ success: true });
});

app.post('/api/accounts/delete', (req, res) => {
    db.deleteAccount(req.body.id);
    syncEngines();
    res.json({ success: true });
});

// 🛠️ ДОБАВИЛИ КЛЮЧ ДЛЯ УЛУЧШАТЕЛЯ И ДЛЯ БИЛЕТОВ ЛОТЕРЕИ
const timerKeys = {
    farm: ['kb_f_timer'], rancho: ['kb_r_timer'], zagon: ['kb_z_timer'],
    nursery: ['kb_nur_timer'], ponds: ['kb_p_feed_timer', 'kb_p_grow_timer'],
    cellar: ['kb_cel_timer'], treasury: ['kb_c_timer'],
    heli: ['kb_heli_timer'], lottery: ['kb_lot_timer', 'kb_lot_ticket_timer'], zavalinka: ['kb_zav_timer'], // 🎟️ ИЗМЕНЕНО: Добавлен kb_lot_ticket_timer
    designer: ['kb_design_timer'], upgrader: ['kb_upgrade_timer']
};

app.get('/api/state', (req, res) => {
    const accId = req.query.accountId;
    if (!accId) return res.json({ error: 'No account' });

    let pStr = db.getAccountSettings(accId, 'priorities');
    let defaultPriorities = ["farm", "rancho", "zagon", "nursery", "ponds", "cellar", "treasury", "heli", "zavalinka", "upgrader", "designer", "lottery"];
    let priorities = pStr ? JSON.parse(pStr) : defaultPriorities;

    defaultPriorities.forEach(mod => {
        if (!priorities.includes(mod)) priorities.push(mod);
    });

    res.json({
        masterActive: db.getGlobal('master_off') !== '1',
        priorities: priorities,
        useWorkers: db.getAccountSettings(accId, 'use_workers') === 'true',
        lotPrio: db.getAccountSettings(accId, 'lot_prio') || 'price',
        lotBuyTickets: db.getAccountSettings(accId, 'lot_buy_tickets') !== 'false', // 🎟️ ДОБАВЛЕНО: статус тумблера билетов
        upgrade_info: db.getAccountSettings(accId, 'upgrade_info') || '', // 🛠️ Передаем текст улучшения
        heliTarget: db.getAccountSettings(accId, 'heli_target') || 'thunder_or_alt', // 🚁 ДОБАВЛЕНО: передаем стейт вертолета
        culinary_skill: db.getAccountSettings(accId, 'culinary_skill') || 'false', // 🧠 ДОБАВЛЕНО: статус умной прокачки кулинарки
        unlock_recipe: db.getAccountSettings(accId, 'unlock_recipe') === 'true',
        nursery_tasks: JSON.parse(db.getAccountSettings(accId, 'nursery_active_tasks') || '{}'),
        profile: db.getProfile(accId),
        timers: {
            farm: db.getTimer(accId, 'kb_f_timer') || 0,
            rancho: db.getTimer(accId, 'kb_r_timer') || 0,
            zagon: db.getTimer(accId, 'kb_z_timer') || 0,
            nursery: db.getTimer(accId, 'kb_nur_timer') || 0,
            pondsFeed: db.getTimer(accId, 'kb_p_feed_timer') || 0,
            pondsGrow: db.getTimer(accId, 'kb_p_grow_timer') || 0,
            cellar: db.getTimer(accId, 'kb_cel_timer') || 0,
            treasury: db.getTimer(accId, 'kb_c_timer') || 0,
            heli: db.getTimer(accId, 'kb_heli_timer') || 0,
            lottery: db.getTimer(accId, 'kb_lot_timer') || 0,
            lotteryTicket: db.getTimer(accId, 'kb_lot_ticket_timer') || 0, // 🎟️ ДОБАВЛЕНО: Отдельный таймер для билетов
            zavalinka: db.getTimer(accId, 'kb_zav_timer') || 0,
            designer: db.getTimer(accId, 'kb_design_timer') || 0,
            upgrader: db.getTimer(accId, 'kb_upgrade_timer') || 0 // 🛠️
        },
        modules: {
            farm: db.getTimer(accId, 'mod_farm') !== 0,
            rancho: db.getTimer(accId, 'mod_rancho') !== 0,
            zagon: db.getTimer(accId, 'mod_zagon') !== 0,
            nursery: db.getTimer(accId, 'mod_nursery') !== 0,
            ponds: db.getTimer(accId, 'mod_ponds') !== 0,
            cellar: db.getTimer(accId, 'mod_cellar') !== 0,
            treasury: db.getTimer(accId, 'mod_treasury') !== 0,
            heli: db.getTimer(accId, 'mod_heli') !== 0,
            lottery: db.getTimer(accId, 'mod_lottery') !== 0,
            zavalinka: db.getTimer(accId, 'mod_zavalinka') !== 0,
            designer: db.getTimer(accId, 'mod_designer') !== 0,
            upgrader: db.getTimer(accId, 'mod_upgrader') !== 0 // 🛠️
        }
    });
});

app.post('/api/toggle', (req, res) => {
    db.saveTimer(req.body.accountId, `mod_${req.body.moduleName}`, req.body.isEnabled ? 1 : 0);
    res.json({ success: true });
});

app.post('/api/master-toggle', (req, res) => {
    db.saveGlobal('master_off', req.body.isEnabled ? '0' : '1');
    if (!req.body.isEnabled) {
        db.getAccounts().forEach(acc => {
            Object.values(timerKeys).flat().forEach(key => db.saveTimer(acc.id, key, 0));
        });
    }
    res.json({ success: true });
});

app.post('/api/reset', (req, res) => {
    if (timerKeys[req.body.moduleName] && req.body.accountId) {
        timerKeys[req.body.moduleName].forEach(key => db.saveTimer(req.body.accountId, key, 0));
    }
    res.json({ success: true });
});

app.post('/api/priorities', (req, res) => {
    if (req.body.accountId) {
        db.saveAccountSettings(req.body.accountId, 'priorities', JSON.stringify(req.body.priorities));
    }
    res.json({ success: true });
});

app.post('/api/account-setting', (req, res) => {
    if (req.body.accountId && req.body.key) {
        db.saveAccountSettings(req.body.accountId, req.body.key, req.body.value);
    }
    res.json({ success: true });
});

// 📖 API для получения Дашборда Рецептов
app.get('/api/recipes', (req, res) => {
    const accountId = req.query.accountId;
    if (!accountId) {
        return res.status(400).json({ error: "No accountId provided" });
    }
    try {
        // Передаем твою глобальную переменную db в нашу функцию-сборщик
        const dashboardData = buildRecipeDashboardData(db, accountId);
        res.json(dashboardData); // Express сам превратит это в красивый JSON
    } catch (error) {
        console.error("❌ Ошибка API рецептов:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// === РУЧНОЕ СКАНИРОВАНИЕ КНИГИ РЕЦЕПТОВ ===
app.post('/api/scan-recipes', async (req, res) => {
    const accountId = req.body.accountId;
    
    // Ищем живого бота в словаре engines, который уже работает
    const bot = engines[accountId]; 
    if (!bot) {
        return res.status(400).json({ error: 'Бот не запущен' });
    }

    try {
        // Вызываем наш новый безопасный метод напрямую у бота!
        // Бот сам просканирует и сам сдвинет таймер на 12 часов.
        const result = await bot.forceRecipeScan();
        
        if (!result.success) {
            // Если мы нажали кнопку 2 раза, или бот УЖЕ сканирует в фоне
            return res.status(429).json({ error: 'Сканирование уже в процессе' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ Ошибка ручного сканирования рецептов [ID: ${accountId}]:`, error);
        res.status(500).json({ error: error.message });
    }
});

// === МОНИТОР ОПЕРАТИВНОЙ ПАМЯТИ ===
setInterval(() => {
    const memory = process.memoryUsage();
    const mb = Math.round(memory.rss / 1024 / 1024);
    if (mb > 300) { // Если бот сожрет больше 300 МБ - он начнет кричать в логи
        console.warn(`⚠️ [СИСТЕМА] Аномальное потребление памяти: ${mb} MB! Возможна утечка!`);
    }
}, 3000);

// === ФИЗИЧЕСКАЯ ЛОВУШКА ВЫХОДА ===
const fs = require('fs');
process.on('exit', (code) => {
    try {
        fs.appendFileSync(path.join(__dirname, 'logs', 'CRASH_REPORT.txt'), `\n[${new Date().toISOString()}] 💀 БОТ УБИТ С КОДОМ: ${code}\n`, 'utf8');
    } catch (e) {}
});

app.listen(PORT, () => console.log(`✅ Сервер запущен! http://localhost:${PORT}`));