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

        // 1. Парсим дедлайн через сырой HTML, чтобы не цеплять "30 штук" в конце блока
        const htmlText = $.html();
        const dateMatch = htmlText.match(/Итоги будут подведены:\s*<span>(.*?)<\/span>/i);
        if (dateMatch && dateMatch[1]) {
            result.deadline = dateMatch[1].trim();
        }

        // 2. Парсим карточки растений (блоки с классом .pt)
        $('.pt').each((_, el) => {
            const plantBlock = $(el);
            const plantName = plantBlock.find('.small > span > span').first().text().trim();
            
            if (!plantName) return;

            // Получаем ссылку на картинку
            const imgUrl = plantBlock.find('img.portrait').attr('src') || '';

        // 3. Вытаскиваем ограничение по уровню (доступно с 37 уровня)
            let minLevel = 1;
            const levelText = plantBlock.find('.small').text();
            const levelMatch = levelText.match(/доступно с\s*(\d+)\s*уровня/i);
            
            if (levelMatch && levelMatch[1]) {
                minLevel = parseInt(levelMatch[1], 10);
            }

            // 4. Безопасно вытаскиваем время созревания и удобрения через HTML
            let growTime = '';
            let fertTime = '';
            const minorHtml = plantBlock.find('.small.minor').html() || '';
            
            const growMatch = minorHtml.match(/Время созревания:.*?<span[^>]*>([^<]+)<\/span>/i);
            if (growMatch && growMatch[1]) growTime = growMatch[1].trim();
            
            const fertMatch = minorHtml.match(/Время до удобрения:.*?<span[^>]*>([^<]+)<\/span>/i);
            if (fertMatch && fertMatch[1]) fertTime = fertMatch[1].trim();

            result.targets.push({
                name: plantName,
                minLevel: minLevel,
                image: imgUrl,
                growTime: growTime,
                fertTime: fertTime
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