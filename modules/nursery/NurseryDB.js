/**
 * Память Питомника (Индивидуальная для каждого аккаунта).
 * Работает через DBWrapper, поэтому автоматически сохраняет данные 
 * только для текущего бота (account_id).
 */
class NurseryDB {
    constructor(db) {
        this.db = db; // Это DBWrapper из BotEngine
        this.TASKS_KEY = 'nursery_active_tasks';
        this.TIMER_KEY = 'kb_nur_timer';
    }

    /**
     * Сохраняет список активных (взятых в работу) заданий.
     * @param {Object} tasks - Объект вида { "Зебра": { req: 25, z: 3, pts: 360 } }
     */
    saveActiveTasks(tasks) {
        try {
            this.db.saveAccountSettings(this.TASKS_KEY, JSON.stringify(tasks));
        } catch (e) {
            console.error('❌ [NurseryDB] Ошибка при сохранении заданий:', e.message);
        }
    }

    /**
     * Получает список активных заданий из БД для сверки (выдачи иммунитета).
     * @returns {Object} Возвращает сохраненный объект или {} если пусто.
     */
    getActiveTasks() {
        try {
            let data = this.db.getAccountSettings(this.TASKS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    /**
     * Быстрая очистка памяти (когда Мозг приказал отменить вообще все квесты).
     */
    clearTasks() {
        this.saveActiveTasks({});
    }

    /**
     * Сохраняет время следующего захода в Питомник.
     * @param {number} timestamp - Время в миллисекундах (Date.now() + ms)
     */
    saveTimer(timestamp) {
        this.db.saveTimer(this.TIMER_KEY, timestamp);
    }
    
    /**
     * Получает текущий таймер.
     */
    getTimer() {
        return this.db.getTimer(this.TIMER_KEY) || 0;
    }
}

module.exports = NurseryDB;