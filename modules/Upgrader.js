const BaseModule = require('../core/BaseModule');

class UpgraderModule extends BaseModule {
    static async execute(client, db, username = 'Unknown') {
        console.log(`🛠️ [${username}] Проверяем улучшения...`);

        let $h = await client.fetchHtml('/house');
        if (!$h) return;

        // 1. Проверка активного улучшения (Ищем по умной регулярке)
        let timerMatch = $h.html().match(/Улучшение\s*<span>(.*?)<\/span>.*?осталось\s*<span>(.*?)<\/span>/i);
        if (timerMatch) {
            let rawName = timerMatch[1];
            let timeStr = timerMatch[2];
            
            // Нормализуем название (исправляем падеж от игры)
            let niceName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            if (rawName.toLowerCase().includes('кофемаш')) niceName = 'Кофемашина';
            if (rawName.toLowerCase().includes('компьют')) niceName = 'Компьютер';
            
            // 🛠️ ПАРСИНГ ДНЕЙ, ЧАСОВ, МИНУТ И СЕКУНД
            let days = 0, hours = 0, mins = 0, secs = 0;
            let dMatch = timeStr.match(/(\d+)\s*(?:дн|день)/);
            let hMatch = timeStr.match(/(\d+)\s*час/);
            let mMatch = timeStr.match(/(\d+)\s*минут/);
            let sMatch = timeStr.match(/(\d+)\s*секунд/);
            
            if (dMatch) days = parseInt(dMatch[1]);
            if (hMatch) hours = parseInt(hMatch[1]);
            if (mMatch) mins = parseInt(mMatch[1]);
            if (sMatch) secs = parseInt(sMatch[1]);
            
            let ms = (days * 86400 + hours * 3600 + mins * 60 + secs) * 1000 + 2000; // +2 секунды запаса
            
            // Красивый вывод в логи
            let timeLog = [];
            if (days > 0) timeLog.push(`${days}д`);
            if (hours > 0) timeLog.push(`${hours}ч`);
            if (mins > 0) timeLog.push(`${mins}м`);
            if (secs > 0 || timeLog.length === 0) timeLog.push(`${secs}с`);
            
            console.log(`🛠️ [${username}] Идет улучшение: ${niceName}. Осталось: ${timeLog.join(' ')}`);
            
            // Ищем предмет со звездочкой, чтобы узнать текущий уровень!
            let upgradingLevel = null;
            $h('span.level').each((i, el) => {
                let txt = $h(el).text();
                if (txt.includes('*')) {
                    upgradingLevel = parseInt(txt.replace(/\D/g, ''));
                }
            });

            if (upgradingLevel !== null) {
                // Нашли звездочку - делаем красиво
                db.saveAccountSettings('upgrade_info', `${niceName} (ур. ${upgradingLevel} ➔ ${upgradingLevel + 1})`);
            } else {
                // Страховка: если звездочку вдруг не найдет, берем старое значение или пишем базовое
                let currentInfo = db.getAccountSettings('upgrade_info') || '';
                if (!currentInfo.includes('➔')) {
                    db.saveAccountSettings('upgrade_info', `Улучшается: ${niceName}`);
                }
            }
            
            db.saveTimer('kb_upgrade_timer', Date.now() + ms);
            return;
        }

        // 2. Сканирование комнат на предметы 33 (кофе) и 15 (комп)
        let candidates = [];
        $h('div.ptm').each((i, roomEl) => {
            $h(roomEl).find('span[style="position:relative;"]').each((j, slotEl) => {
                let $slot = $h(slotEl);
                let $img = $slot.find('img').first();
                let src = $img.attr('src') || '';
                
                let idMatch = src.match(/\/interior\/(\d+)\.png/);
                if (idMatch) {
                    let id = parseInt(idMatch[1]);
                    if (id === 33 || id === 15) {
                        let lvlSpan = $slot.find('span.level');
                        // Если предмет сейчас не улучшается, берем обычную цифру
                        let level = 1;
                        if (lvlSpan.length > 0) {
                            level = parseInt(lvlSpan.text().replace(/\D/g, '')) || 1;
                        }
                        
                        let actionLink = $slot.find('a').attr('href');
                        
                        // Отбрасываем вещи 20 уровня
                        if (level < 20 && actionLink) {
                            candidates.push({
                                id: id,
                                name: id === 33 ? 'Кофемашина' : 'Компьютер',
                                level: level,
                                link: actionLink.replace(/^\.\//, '/')
                            });
                        }
                    }
                }
            });
        });

        if (candidates.length === 0) {
            console.log(`🛠️ [${username}] Нет предметов для улучшения (или все 20 уровня). Спим 2 часа.`);
            db.saveAccountSettings('upgrade_info', 'Все предметы макс. уровня');
            db.saveTimer('kb_upgrade_timer', Date.now() + 7200000);
            return;
        }

        // 3. Сортировка: Кофемашины в приоритете, затем берем наименьший уровень
        candidates.sort((a, b) => {
            if (a.id === 33 && b.id !== 33) return -1;
            if (a.id !== 33 && b.id === 33) return 1;
            return a.level - b.level;
        });

        let target = candidates[0];
        console.log(`🛠️ [${username}] Выбрана цель: ${target.name} (ур. ${target.level})`);

        // 4. Переход к окну выбора
        let $actionPage = await client.fetchHtml(target.link);
        if (!$actionPage) return;

        let upgradeLink = $actionPage('a:contains("Улучшить")').attr('href');
        if (!upgradeLink) {
            console.log(`⚠️ [${username}] Нет кнопки Улучшить. Нажимаем Отмена.`);
            let cancelLink = $actionPage('a:contains("Отмена")').attr('href');
            if (cancelLink) await client.fetchHtml(cancelLink.replace(/^\.\//, '/'));
            db.saveTimer('kb_upgrade_timer', Date.now() + 60000); // Проверим позже
            return;
        }

        // 5. Окно подтверждения и проверка рубинов
        let $confirmPage = await client.fetchHtml(upgradeLink.replace(/^\.\//, '/'));
        if (!$confirmPage) return;

        let priceText = $confirmPage('.title span.title').text() || '10';
        let price = parseInt(priceText.replace(/\D/g, '')) || 10;

        let profile = db.getProfile();
        let rubies = profile.rubies || 0;

        if (rubies < price) {
            console.log(`💎 [${username}] Не хватает рубинов на ${target.name}! Нужно: ${price}, есть: ${rubies}. Спим 60 минут.`);
            db.saveAccountSettings('upgrade_info', `Ожидание рубинов (${rubies}/${price})`);
            
            let declineLink = $confirmPage('a:contains("Нет, отказываюсь")').attr('href');
            if (declineLink) await client.fetchHtml(declineLink.replace(/^\.\//, '/'));
            
            db.saveTimer('kb_upgrade_timer', Date.now() + 3600000); // Сон 60 минут
            return;
        }

        // 6. Подтверждаем улучшение
        console.log(`🛠️ [${username}] Рубинов хватает (${rubies}/${price}). Запускаем улучшение!`);
        let acceptLink = $confirmPage('a:contains("Да, подтверждаю")').attr('href');
        if (acceptLink) {
            await client.fetchHtml(acceptLink.replace(/^\.\//, '/'));
            
            db.saveAccountSettings('upgrade_info', `${target.name} (ур. ${target.level} ➔ ${target.level + 1})`);
            
            let $finalHouse = await client.fetchHtml('/house');
            let finalTimerMatch = $finalHouse ? $finalHouse.html().match(/Улучшение.*?осталось\s*<span>(.*?)<\/span>/i) : null;
            
            let ms = 1800000; // Дефолт 30 минут
            if (finalTimerMatch) {
                let timeStr = finalTimerMatch[1];
                let days = 0, hours = 0, mins = 0, secs = 0;
                let dMatch = timeStr.match(/(\d+)\s*(?:дн|день)/);
                let hMatch = timeStr.match(/(\d+)\s*час/);
                let mMatch = timeStr.match(/(\d+)\s*минут/);
                let sMatch = timeStr.match(/(\d+)\s*секунд/);
                
                if (dMatch) days = parseInt(dMatch[1]);
                if (hMatch) hours = parseInt(hMatch[1]);
                if (mMatch) mins = parseInt(mMatch[1]);
                if (sMatch) secs = parseInt(sMatch[1]);
                ms = (days * 86400 + hours * 3600 + mins * 60 + secs) * 1000 + 2000;
            }
            
            db.saveTimer('kb_upgrade_timer', Date.now() + ms);
            console.log(`✅ [${username}] Улучшение запущено.`);
        }
    }
}

module.exports = UpgraderModule;