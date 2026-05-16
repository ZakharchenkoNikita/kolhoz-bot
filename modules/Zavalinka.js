const BaseModule = require('../core/BaseModule');
const HouseScanner = require('../core/house/HouseScanner'); // 🛠️ Импортируем сканер домика

class ZavalinkaModule extends BaseModule {
    // Хранилище счетчиков действий для каждого аккаунта
    static actionCounters = {};

    static async execute(client, db, username = 'Unknown') {
        console.log(`🪵 [${username}] Проверяем Завалинку...`);

        // 1. Проверяем Золотую Формулу Лимитов и Стройки
        let profile = db.getProfile();
        let nails = profile.materials?.nail;
        
        if (!nails) return;

        if (!nails.required) {
            console.log(`🪵 [${username}] Гвозди не требуются. Отдыхаем.`);
            db.saveTimer('kb_zav_timer', -1); 
            return;
        }

        if (nails.limit > 0 && nails.today >= nails.limit) {
            console.log(`🪵 [${username}] Дневной лимит гвоздей исчерпан (${nails.today}/${nails.limit}). Ждем до завтра.`);
            let mskNow = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
            let msToMidnight = new Date(mskNow.getFullYear(), mskNow.getMonth(), mskNow.getDate() + 1).getTime() - mskNow.getTime();
            db.saveTimer('kb_zav_timer', Date.now() + msToMidnight);
            return;
        }

        if (!profile.is_building && nails.need > 0 && nails.have >= nails.need) {
            console.log(`🪵 [${username}] Гвоздей достаточно. Отдыхаем.`);
            db.saveTimer('kb_zav_timer', -1);
            return;
        }

        // 2. Идем на Завалинку
        let $ = await client.fetchHtml('/quest');
        if (!$) return;

        let pageText = $('body').text() || '';

        if (pageText.includes('Пожалуйста дождитесь обработки Вашего предыдущего запроса')) {
            console.log(`⏳ [${username}] Слишком частые запросы. Пауза 5 сек.`);
            db.saveTimer('kb_zav_timer', Date.now() + 5000);
            return;
        }

        // 3. Обработка ожиданий (таймеры отдыха)
        let refreshLink = $('a').filter((i, el) => $(el).text().trim() === 'Обновить').first().attr('href');
        if (refreshLink && pageText.includes('Вы снова отдыхаете на завалинке')) {
            let waitTimeMs = 4000;
            let spanMatch = $.html().match(/Осталось <span>(\d+)\s*секунд/i);
            if (spanMatch && spanMatch[1]) {
                waitTimeMs = (parseInt(spanMatch[1], 10) * 1000) + 1000; 
            }
            console.log(`⏳ [${username}] Отдыхаем на завалинке. Бот вернется через ${waitTimeMs/1000} сек.`);
            db.saveTimer('kb_zav_timer', Date.now() + waitTimeMs);
            return;
        }

        // 4. Сбор кнопок
        let availableButtons = [];
        $('ul.pt li a').each((i, el) => {
            availableButtons.push({
                text: $(el).text().replace(/\s+/g, ' ').trim(),
                href: $(el).attr('href')
            });
        });

        if (availableButtons.length === 0) {
            console.log(`🪵 [${username}] Нет доступных действий. Ждем 10 сек...`);
            db.saveTimer('kb_zav_timer', Date.now() + 10000);
            return;
        }

        // 🛠️ 5. Функция клика со счетчиком действий
        const clickLink = async (href, actionName, delayMs) => {
            console.log(`🪵 [${username}] Нажимаем: "${actionName}" (уходим в тень на ${delayMs/1000} сек)`);
            let actionUrl = href;
            if (actionUrl.startsWith('?')) {
                actionUrl = '/quest' + actionUrl; 
            } else if (actionUrl.startsWith('./')) {
                actionUrl = actionUrl.replace(/^\.\//, '/');
            } else if (!actionUrl.startsWith('/')) {
                actionUrl = '/' + actionUrl;
            }
            
            // Выполняем действие
            await client.fetchHtml(actionUrl);
            db.saveTimer('kb_zav_timer', Date.now() + delayMs);

            // 🌟 МАГИЯ СВЕРКИ: Инкремент счетчика и вызов сканера (ИСПРАВЛЕНО НА db.accountId)
            if (!ZavalinkaModule.actionCounters[db.accountId]) {
                ZavalinkaModule.actionCounters[db.accountId] = 0;
            }
            ZavalinkaModule.actionCounters[db.accountId]++;

            // Каждые 4 действия делаем контрольную проверку в Домике (ИСПРАВЛЕНО НА db.accountId)
            if (ZavalinkaModule.actionCounters[db.accountId] >= 4) {
                console.log(`🏠 [${username}] Делаем контрольную сверку лимитов в Домике...`);
                let scanner = new HouseScanner(client, db, username);
                await scanner.scan(); // Бот сам сходит в /house и обновит базу!
                ZavalinkaModule.actionCounters[db.accountId] = 0; // Сбрасываем счетчик
            }
        };

        // 6. Определение сцены (Скип или Загадка)
        let portraitImg = $('img.portrait').attr('src') || '';
        let textNode = $('.portrait').next('div').text().replace(/\s+/g, ' ').trim() || '';

        if (portraitImg && textNode) {
            let skipAction = db.findSkipAction(portraitImg, textNode);
            if (skipAction) {
                let targetBtn = availableButtons.find(b => b.text.toLowerCase().includes(skipAction.toLowerCase()));
                if (targetBtn) {
                    console.log(`⏩ [${username}] Скип мини-игры найден!`);
                    await clickLink(targetBtn.href, targetBtn.text, 5000);
                    return;
                }
            }

            let riddleAnswer = db.findRiddleAnswer(textNode);
            if (riddleAnswer) {
                let targetBtn = availableButtons.find(b => b.text.toLowerCase().includes(riddleAnswer.toLowerCase()));
                if (targetBtn) {
                    console.log(`🧠 [${username}] Ответ найден! Имитируем раздумья человека...`);
                    await clickLink(targetBtn.href, targetBtn.text, 10000);
                    return;
                }
            }
        }

        // 7. Безопасные дефолтные кнопки
        const safeButtons = [
            "Ну давай свою загадку, дедушка!", 
            "Ну давай свою загадку", 
            "Взять", 
            "Слушать дальше", 
            "Вернуться на Завалинку", 
            "Проводить дедушку"
        ];

        for (let safeText of safeButtons) {
            let targetBtn = availableButtons.find(b => b.text.toLowerCase().includes(safeText.toLowerCase()));
            if (targetBtn) {
                await clickLink(targetBtn.href, targetBtn.text, 3500);
                return;
            }
        }

        // 8. Если застряли (Неизвестная сцена)
        console.log(`🚨 [${username}] ВНИМАНИЕ! Неизвестная сцена или загадка!`);
        console.log(`Текст: "${textNode.substring(0, 80)}..."`);
        console.log(`Доступные кнопки: ${availableButtons.map(b => b.text).join(' | ')}`);
        console.log(`[${username}] Останавливаем Завалинку на 15 минут. Добавьте ответ в БД!`);
        db.saveTimer('kb_zav_timer', Date.now() + 900000); 
    }
}

module.exports = ZavalinkaModule;