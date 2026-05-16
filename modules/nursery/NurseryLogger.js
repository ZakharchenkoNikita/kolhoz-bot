const fs = require('fs');
const path = require('path');

class NurseryLogger {
    constructor(username) {
        this.username = username;
        
        // Создаем директорию logs в корне проекта (рядом с папкой data)
        this.logDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // У каждого аккаунта будет свой независимый файл логов
        this.logFile = path.join(this.logDir, `nursery_${username}.txt`);
    }

    /**
     * Записать действие в лог
     * @param {string} action - Категория действия (например: 'ОТМЕНА', 'ПОСАДКА', 'ЧИСТКА')
     * @param {string} message - Подробное сообщение
     */
    log(action, message) {
        const now = new Date();
        
        // Получаем локальное время сервера/компьютера
        const pad = (n) => n.toString().padStart(2, '0');
        const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        
        const logLine = `[${timeStr}] [${action}] ${message}\n`;
        
        // Пишем в файл
        try {
            fs.appendFileSync(this.logFile, logLine);
        } catch (e) {
            console.error(`❌ [${this.username}] Ошибка записи лога Питомника: ${e.message}`);
        }
        
        // Также дублируем в консоль для удобства, чтобы видеть процесс в реальном времени
        console.log(`🐾 [${this.username}] [${action}] ${message}`);
    }
}

module.exports = NurseryLogger;