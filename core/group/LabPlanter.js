const BasePlanter = require('./BasePlanter');

class LabPlanter extends BasePlanter {
    constructor(client, username) {
        super(client, username);
    }

    /**
     * @override
     * Идет в Лабораторию и возвращает ссылку Принять участие
     */
    async _getSeedLink(targetName) {
        this.log('🧪', `Запрашиваем семена [${targetName}] из Лаборатории...`);
        const $ = await this.client.fetchHtml('/collective/lab');
        if (!$) return null;

        // Ищем любую ссылку, которая содержит системный идентификатор joinLink
        // Это надежнее, чем искать текст "Принять участие"
        const joinLink = $('a[href*="joinLink"]').attr('href');
        
        return joinLink || null;
    }
}

module.exports = LabPlanter;