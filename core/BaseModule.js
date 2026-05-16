class BaseModule {
    // Общие регулярные выражения для поиска времени
    static R_DAYS = /(\d+)\s*(?:дней|дня|день|дн|д(?![а-яёА-ЯЁ]))/i;
    static R_HRS = /(\d+)\s*(?:часов|часа|час|ч(?![а-яёА-ЯЁ]))/i;
    static R_MINS = /(\d+)\s*(?:минут|минуты|минуту|мин|м(?![а-яёА-ЯЁ]))/i;
    static R_SECS = /(\d+)\s*(?:секунд|секунды|секунду|сек|с(?![а-яёА-ЯЁ]))/i;

    // Универсальная функция парсинга строки "2 часа 15 минут" в миллисекунды
    static extractTime(text) {
        if (!text) return null;
        let ms = 0, found = false;
        
        let d = text.match(this.R_DAYS); 
        if (d) { ms += parseInt(d[1]) * 86400000; found = true; }
        
        let h = text.match(this.R_HRS); 
        if (h) { ms += parseInt(h[1]) * 3600000; found = true; }
        
        let m = text.match(this.R_MINS); 
        if (m) { ms += parseInt(m[1]) * 60000; found = true; }
        
        let s = text.match(this.R_SECS); 
        if (s) { ms += parseInt(s[1]) * 1000; found = true; }
        
        return found ? ms : null;
    }

    // Заглушка, чтобы случайно не забыть прописать логику в новых модулях
    static async execute(client, db) {
        throw new Error("Метод execute() должен быть переопределен в дочернем классе!");
    }
}

module.exports = BaseModule;