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

        // В лаборатории кнопка называется "Принять участие"
        const joinLink = $('a:contains("Принять участие")').attr('href');
        
        return joinLink || null;
    }
}

module.exports = LabPlanter;