const BaseParser = require('../BaseParser');

const URL_GOSZAKAZ = '/goszakaz';

class GoszakazParser extends BaseParser {
    constructor(client, db, username) {
        super(client, db, username);
    }

    _parsePage($) {
        const result = {
            deadline: null,
            targets: []
        };

        // 1. Парсим дедлайн (Итоги будут подведены: <span>15 июн. 12:00</span>)
        const deadlineSpan = $('div:contains("Итоги будут подведены:")').find('span').last();
        if (deadlineSpan.length > 0) {
            result.deadline = deadlineSpan.text().trim();
        }

        // 2. Парсим карточки растений (блоки с классом .pt)
        $('.pt').each((_, el) => {
            const plantBlock = $(el);
            const plantName = plantBlock.find('.small > span > span').first().text().trim();
            
            if (!plantName) return;

            // 3. Вытаскиваем ограничение по уровню (доступно с 37 уровня)
            let minLevel = 1;
            const levelText = plantBlock.find('.small').text();
            const levelMatch = levelText.match(/доступно с\s*(\d+)\s*уровня/i);
            
            if (levelMatch && levelMatch[1]) {
                minLevel = parseInt(levelMatch[1], 10);
            }

            result.targets.push({
                name: plantName,
                minLevel: minLevel
            });
        });

        return result;
    }

    async scan() {
        this.log('📜', 'Сканируем Госзаказ...');
        
        const $ = await this.fetchPage(URL_GOSZAKAZ);
        if (!$) return null;

        const data = this._parsePage($);
        const targetNames = data.targets.map(t => t.name).join(' и ');
        
        this.log('✅', `Госзаказ отсканирован. Цели: ${targetNames || 'Нет'}`);
        
        return data;
    }
}

module.exports = GoszakazParser;