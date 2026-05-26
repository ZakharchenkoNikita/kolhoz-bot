const BaseModule = require('../core/BaseModule');
const HouseScanner = require('../core/house/HouseScanner');

class ArenaModule extends BaseModule {
    // Счетчик проведенных боев для обновления профиля
    static actionCounters = {};

    static async execute(client, db, username = 'Unknown') {
        console.log(`🧱 [${username}] Проверяем Арену (Кирпичи)...`);

        // 1. Проверяем лимиты по нашей Золотой Формуле
        let profile = db.getProfile();
        let bricks = profile.materials?.brick;
        
        if (!bricks) {
            db.saveTimer('kb_arena_timer', Date.now() + 3600000);
            return;
        }

        if (!bricks.required) {
            console.log(`🧱 [${username}] Кирпичи не требуются. Отдыхаем.`);
            db.saveTimer('kb_arena_timer', -1); 
            return;
        }

        if (bricks.limit > 0 && bricks.today >= bricks.limit) {
            console.log(`🧱 [${username}] Дневной лимит кирпичей исчерпан (${bricks.today}/${bricks.limit}). Ждем до завтра.`);
            let mskNow = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
            let msToMidnight = new Date(mskNow.getFullYear(), mskNow.getMonth(), mskNow.getDate() + 1).getTime() - mskNow.getTime();
            db.saveTimer('kb_arena_timer', Date.now() + msToMidnight);
            return;
        }

        if (!profile.is_building && bricks.need > 0 && bricks.have >= bricks.need) {
            console.log(`🧱 [${username}] Кирпичей достаточно. Отдыхаем.`);
            db.saveTimer('kb_arena_timer', -1);
            return;
        }

        // 2. Идем на Арену
        let $ = await client.fetchHtml('/arena');
        if (!$) {
            db.saveTimer('kb_arena_timer', Date.now() + 60000);
            return;
        }

        let pageText = $('body').text().replace(/\s+/g, ' ').trim();

        if (pageText.includes('Пожалуйста дождитесь обработки')) {
            console.log(`⏳ [${username}] Слишком частые запросы к Арене. Пауза 5 сек.`);
            db.saveTimer('kb_arena_timer', Date.now() + 5000);
            return;
        }

        // Умный поиск и клик по ссылке
        const clickLink = async (targetText, delayMs) => {
            let targetHref = null;
            let searchTarget = targetText.toLowerCase();
            
            $('a').each((i, el) => {
                if ($(el).text().trim().toLowerCase() === searchTarget) {
                    targetHref = $(el).attr('href');
                }
            });

            if (targetHref) {
                console.log(`🧱 [${username}] Нажимаем: "${targetText}"`);
                let actionUrl = targetHref;
                if (actionUrl.startsWith('?')) {
                    actionUrl = '/arena' + actionUrl; 
                } else if (actionUrl.startsWith('./')) {
                    actionUrl = actionUrl.replace(/^\.\//, '/');
                } else if (!actionUrl.startsWith('/')) {
                    actionUrl = '/' + actionUrl;
                }
                
                await client.fetchHtml(actionUrl);
                db.saveTimer('kb_arena_timer', Date.now() + delayMs);
                return true;
            }
            return false;
        };

        // ================= СОСТОЯНИЯ АРЕНЫ =================

        // Состояние А: Бой окончен (Забираем кирпичи и идем в некст)
        if (pageText.includes('Бой окончен')) {
            console.log(`🧱 [${username}] Бой завершен! Ищем кнопку повтора...`);
            
            // Увеличиваем счетчик боев (ИСПРАВЛЕНО НА db.accountId)
            if (!ArenaModule.actionCounters[db.accountId]) {
                ArenaModule.actionCounters[db.accountId] = 0;
            }
            ArenaModule.actionCounters[db.accountId]++;

            // Каждые 3 боя обновляем инфу о кирпичах из Домика (ИСПРАВЛЕНО НА db.accountId)
            if (ArenaModule.actionCounters[db.accountId] >= 3) {
                console.log(`🏠 [${username}] Контрольная сверка кирпичей в Домике...`);
                let scanner = new HouseScanner(client, db, username);
                await scanner.scan();
                ArenaModule.actionCounters[db.accountId] = 0;
            }

            if (await clickLink("Играть еще", 3500)) return;
            if (await clickLink("Выход", 3500)) return; 
            
            db.saveTimer('kb_arena_timer', Date.now() + 30000);
            return; // Защита на случай, если кнопок нет
        }

        // Состояние Б: Главное меню Арены (Первый вход)
        if (pageText.includes('Бои без правил') && pageText.includes('Карточная арена')) {
            if (await clickLink("Бои без правил", 3500)) return;
        }

        // Состояние В: Мы в очереди или прямо сейчас идет активный бой
        // Просто уходим в тень на 15 секунд, чтобы не спамить запросами
        console.log(`⚔️ [${username}] Находимся в очереди или в активном бою. Ждем 15 секунд...`);
        db.saveTimer('kb_arena_timer', Date.now() + 15000);
    }
}

module.exports = ArenaModule;