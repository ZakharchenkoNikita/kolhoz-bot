class Scheduler {
    constructor(db) {
        this.db = db;
        // При старте скрипта память чиста. Это заставит Планировщик 
        // сделать 1 контрольный сброс при запуске на случай, если мы проспали полночь.
        this.lastResetDate = null; 
        this.startMidnightReset();
    }

    startMidnightReset() {
        console.log('🕒 Планировщик запущен: следим за наступлением новых суток по МСК...');
        
        // Делаем немедленную проверку при старте скрипта
        this.checkDateAndReset();

        // Затем продолжаем проверять каждые 30 секунд в фоне
        setInterval(() => {
            this.checkDateAndReset();
        }, 30000);
    }

    checkDateAndReset() {
        // Получаем точное текущее время по Москве
        let mskNow = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
        let currentDateString = mskNow.toDateString(); 

        // Если дата сменилась (или скрипт только что запустили после перерыва)
        if (this.lastResetDate !== currentDateString) {
            this.lastResetDate = currentDateString; // Запоминаем текущий день сразу

            console.log(`🕒 [${currentDateString}] Наступила полночь по МСК! Ждем 60 секунд для синхронизации с сервером игры...`);

            // Ждем ровно 1 минуту перед сбросом лимитов
            setTimeout(() => {
                this.resetDailyTimers();
            }, 60000);
        }
    }

    resetDailyTimers() {
        console.log('\n🌙 Наступили новые сутки по МСК (или произведен перезапуск)! Сбрасываем дневные лимиты...');
        const accounts = this.db.getAccounts();
        let count = 0;
        
        accounts.forEach(acc => {
            if (acc.is_active) {
                // Ставим 0, чтобы боты прямо сейчас сходили на Арену/Завалинку и проверили свои лимиты
                this.db.saveTimer(acc.id, 'kb_zav_timer', 0); 
                this.db.saveTimer(acc.id, 'kb_arena_timer', 0);

                // this.db.saveTimer(acc.id, 'kb_rb_timer', 0);
                count++;
            }
        });
        
        console.log(`✅ Лимиты сброшены для ${count} активных аккаунтов. Бот возвращается к фарму Домика!\n`);
    }
}

module.exports = Scheduler;