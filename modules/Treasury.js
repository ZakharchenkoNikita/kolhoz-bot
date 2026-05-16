const BaseModule = require('../core/BaseModule');

class TreasuryModule extends BaseModule {
    static async execute(client, db) {
        console.log('💎 Проверяем Казну и Салон...');

        let collectedNow = 0;

        // --- 1. ОБМЕН В КОНВЕРТЕРЕ ---
        let convHtml = await client.fetchHtml('/converter');
        if (convHtml) {
            // Ищем текст "доступно к обмену: 15"
            let match = convHtml.text().match(/доступно к обмену:\s*(\d+)/i);
            if (match && parseInt(match[1]) > 0) {
                collectedNow += parseInt(match[1]);
            }

            // Ищем ссылку на обмен
            let cLink = convHtml('a').filter((i, el) => {
                return (convHtml(el).attr('href') || '').includes('convertAllRubyLink');
            }).first();

            if (cLink.length > 0) {
                let actionUrl = cLink.attr('href').replace(/^\.\//, '/');
                console.log(`⚡ Конвертер: Обмениваем рубины!`);
                await client.fetchHtml(actionUrl);
            }
        }

        // --- 2. СБОР БОНУСА В САЛОНЕ ---
        let salHtml = await client.fetchHtml('/saloon');
        if (salHtml) {
            let sLink = salHtml('a').filter((i, el) => {
                return (salHtml(el).attr('href') || '').includes('getRubiesRewardLink');
            }).first();

            if (sLink.length > 0) {
                // Пытаемся вытащить цифру из соседнего span
                let spanText = sLink.parent().find('span').text();
                let match = spanText.match(/(\d+)/);
                if (match) {
                    collectedNow += parseInt(match[1]);
                }

                let actionUrl = sLink.attr('href').replace(/^\.\//, '/');
                console.log(`⚡ Салон: Забираем бонус!`);
                await client.fetchHtml(actionUrl);
            }
        }

        // --- 3. СТАТИСТИКА И ТАЙМЕР ---
        if (collectedNow > 0) {
            // Достаем старое значение из базы (или 0), прибавляем новое и сохраняем
            let savedTotal = db.getTimer('stat_rubies') || 0;
            db.saveTimer('stat_rubies', savedTotal + collectedNow);
            console.log(`💎 Добыто рубинов: ${collectedNow} (Всего нафармлено: ${savedTotal + collectedNow})`);
        }

        // Казна и Салон откатываются ровно 1 час (3600000 мс)
        db.saveTimer('kb_c_timer', Date.now() + 3600000);
        console.log(`✅ Казна проверена. Засыпаем на 1 час.`);
    }
}

module.exports = TreasuryModule;