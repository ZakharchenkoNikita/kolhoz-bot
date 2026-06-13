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
            
            // Название: <span><span>Вишня gen 2</span></span>
            result.currentPlant = investigatingBlock.find('.small > span > span').first().text().trim();
            
            // Процент: Собрано урожая: 5786050 (эфф. 86,132%)
            const effText = investigatingBlock.next('li.pb').text();
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