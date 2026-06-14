const BasePlanter = require('./BasePlanter');

class GoszakazPlanter extends BasePlanter {
    constructor(client, username) {
        super(client, username);
    }

    /**
     * @override
     * Идет в Госзаказ и возвращает ссылку joinLink для конкретного растения
     */
    async _getSeedLink(targetName) {
        this.log('📜', `Ищем [${targetName}] на странице Госзаказа...`);
        const $ = await this.client.fetchHtml('/goszakaz');
        if (!$) return null;

        let seedLink = null;

        $('.pt').each((_, el) => {
            const plantName = $(el).find('.small > span > span').first().text().trim();
            if (plantName === targetName) {
                // Нашли нужную карточку, забираем ссылку "Посадить"
                seedLink = $(el).find('a[href*="joinLink"]').attr('href');
            }
        });

        return seedLink;
    }
}

module.exports = GoszakazPlanter;