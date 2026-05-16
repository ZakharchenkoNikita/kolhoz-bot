const fs = require('fs');
const path = require('path');
const util = require('util');

class Logger {
    static init() {
        const logDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

        const getLogFile = () => {
            const now = new Date();
            const dateStr = [String(now.getDate()).padStart(2, '0'), String(now.getMonth() + 1).padStart(2, '0'), now.getFullYear()].join('-');
            return path.join(logDir, `${dateStr}.txt`);
        };

        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const writeToFile = (level, args) => {
            const msg = util.format(...args);
            const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, '');
            const now = new Date();
            // Добавили миллисекунды, чтобы видеть точную хронологию перед крашем
            const ms = String(now.getMilliseconds()).padStart(3, '0');
            const time = `${now.toTimeString().split(' ')[0]}.${ms}`;
            const logLine = `[${time}] [${level}] ${cleanMsg}\n`;

            // 🛠️ ИСПРАВЛЕНО: Жесткая синхронная запись. Блокирует поток, но гарантирует сохранение!
            try {
                fs.appendFileSync(getLogFile(), logLine, 'utf8');
            } catch (e) {}
        };

        console.log = function(...args) { originalLog.apply(console, args); writeToFile('INFO', args); };
        console.error = function(...args) { originalError.apply(console, args); writeToFile('ERROR', args); };
        console.warn = function(...args) { originalWarn.apply(console, args); writeToFile('WARN', args); };

        console.log('📦 [Система] Черный ящик переведен в ЖЕСТКИЙ СИНХРОННЫЙ режим.');
    }
}

module.exports = Logger;