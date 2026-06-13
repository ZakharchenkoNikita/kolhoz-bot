const BaseParser = require('../BaseParser');

const URL_LAB = '/collective/lab';

class LabParser extends BaseParser {
    constructor(client, db, username) {
        super(client, db, username);
    }

    _parsePage($) {
        const result = {
            currentPlant: null,
            efficiencyPercent: 0,
            isSelecting: false
        };

        // 1. Ищем блок "На исследовании"
        const investigatingBlock = $('span:contains("На исследовании")').closest('li');
        
        if (investigatingBlock.length > 0) {
            result.isSelecting = true;
            
            // Название и картинка
            result.currentPlant = investigatingBlock.find('.small > span > span').first().text().trim();
            result.image = investigatingBlock.find('img.portrait').attr('src') || '';
            
            // Парсим таймеры (созревание и удобрение)
            const timeSpans = investigatingBlock.find('.small.minor span.title');
            if (timeSpans.length >= 2) {
                result.timeClock = $(timeSpans[0]).text().trim();
                result.timeSoil = $(timeSpans[1]).text().trim();
            } else {
                result.timeClock = '';
                result.timeSoil = '';
            }

            // Процент и количество урожая
            const effText = investigatingBlock.next('li.pb').text();
            
            const harvestMatch = effText.match(/Собрано урожая:\s*([\d\s]+)/i);
            if (harvestMatch && harvestMatch[1]) {
                result.harvestCount = harvestMatch[1].replace(/\s+/g, '').trim();
            } else {
                result.harvestCount = '0';
            }

            const effMatch = effText.match(/эфф\.\s*([\d,]+)%/i);
            if (effMatch && effMatch[1]) {
                result.efficiencyPercent = parseFloat(effMatch[1].replace(',', '.'));
            }
        }

        return result;
    }

    async scan() {
        this.log('🧪', 'Сканируем Лабораторию кооператива...');
        
        const $ = await this.fetchPage(URL_LAB);
        if (!$) return null;

        const data = this._parsePage($);
        
        const statusMsg = data.isSelecting 
            ? `${data.currentPlant} (${data.efficiencyPercent}%)` 
            : 'Простаивает';
            
        this.log('✅', `Лаборатория отсканирована. Статус: ${statusMsg}`);
        
        return data;
    }
}

module.exports = LabParser;