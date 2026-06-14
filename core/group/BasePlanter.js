class BasePlanter {
    constructor(client, username) {
        this.client = client;
        this.username = username;
    }

    // ==========================================
    // 🔧 УТИЛИТЫ И ЛОГИРОВАНИЕ
    // ==========================================

    log(emoji, message) {
        console.log(`${emoji} [${this.username}] ${message}`);
    }

    _formatUrl(href) {
        if (!href) return null;
        return href.startsWith('./') ? href.slice(1) : href;
    }

    // ==========================================
    // 🚀 ГЛАВНЫЙ ОРКЕСТРАТОР (Шаблонный метод)
    // ==========================================

    /**
     * Запускает полный цикл подготовки грядок.
     * @param {string} targetName - Название растения (Вишня, Слива)
     * @param {number} growTimeMin - Базовое время созревания в минутах
     */
    async prepareFarm(targetName, growTimeMin) {
        try {
            this.log('🚜', `Штаб отдал приказ: сажаем [${targetName}]!`);

            // Шаг 1. Тотальная зачистка полигона
            await this._clearBeds();
            
            // Шаг 2. Добываем ссылку на семечко (через дочерний класс)
            const seedLink = await this._getSeedLink(targetName);
            if (!seedLink) {
                this.log('❌', `Не удалось найти ссылку на посадку ${targetName}.`);
                return false;
            }

            // Шаг 3. Заряжаем пушку семечком
            await this._applyLink('🌱', 'Заряжаем семечко...', seedLink);

            // Шаг 4. Умная калибровка и покупка удобрения
            if (growTimeMin > 0) {
                await this._applyFertilizer(growTimeMin);
            }

            this.log('✅', 'Пушка заряжена на 100%! Ожидаем запуск грядок.');
            return true;

        } catch (error) {
            this.log('❌', `Критическая ошибка подготовки: ${error.message}`);
            return false;
        }
    }

    // ==========================================
    // 📄 МЕТОД ДЛЯ НАСЛЕДНИКОВ
    // ==========================================

    async _getSeedLink(targetName) {
        throw new Error('Метод _getSeedLink должен быть реализован в дочернем классе!');
    }

    // ==========================================
    // 🛠️ РАБОЧИЕ МЕТОДЫ (Разбиты на логические блоки)
    // ==========================================

    /** Шаг 1: Снос старых посевов */
    async _clearBeds() {
        this.log('🧹', 'Проверяем грядки...');
        const $farm = await this.client.fetchHtml('/myfarm');
        if (!$farm) return;

        const cleanLink = this._formatUrl($farm('a[href*="cleanLink"]').attr('href'));
        if (!cleanLink) {
            this.log('✨', 'Грядки уже чистые!');
            return;
        }

        this.log('🗑️', 'Сносим старые посевы...');
        const $confirmPage = await this.client.fetchHtml(cleanLink);
        if (!$confirmPage) return;

        const confirmLink = this._formatUrl($confirmPage('a[href*="confirmLink"]').attr('href'));
        if (confirmLink) {
            await this.client.fetchHtml(confirmLink);
            this.log('🧹', 'Поле успешно зачищено.');
        }
    }

    /** Универсальный метод для клика по системным ссылкам */
    async _applyLink(emoji, text, link) {
        this.log(emoji, text);
        await this.client.fetchHtml(this._formatUrl(link));
    }

    /** Логика работы с магазином удобрений */
    async _applyFertilizer(growTimeMin) {
        this.log('🧪', `Подбираем удобрение для перекрытия ${growTimeMin} мин...`);
        const $shop = await this.client.fetchHtml('/shop/soils');
        if (!$shop) return;

        const bestFertilizerLink = await this._findBestFertilizer($shop, growTimeMin);
        if (bestFertilizerLink) {
            await this._applyLink('💉', 'Применяем высчитанное удобрение...', bestFertilizerLink);
        } else {
            this.log('⚠️', 'Подходящее удобрение за монеты не найдено.');
        }
    }

    /** Умный поиск идеального удобрения в магазине */
    async _findBestFertilizer($, growTimeMin) {
        const fertilizers = [];
        
        // 1. Парсим текущий баланс монет (защита от покупок в минус)
        let currentCoins = Infinity;
        const moneyMatch = $.html().match(/money\.png.*?<span[^>]*>([\d\s',]+)<\/span>/i);
        if (moneyMatch && moneyMatch[1]) {
            currentCoins = parseInt(moneyMatch[1].replace(/\D/g, ''), 10);
        }

        // 2. Собираем удобрения за монеты, на которые хватает денег
        $('li').each((_, el) => {
            const html = $(el).html();
            if (!html || html.includes('ruby.png')) return; // Пропускаем донатные

            const buyLink = $(el).find('a[href*="buyLink"]').first().attr('href');
            const helpLink = $(el).find('a[href*="helpLink"]').first().attr('href');
            const priceText = $(el).find('.nobr .title').text();
            
            if (buyLink && helpLink && priceText) {
                const price = parseInt(priceText.replace(/\D/g, ''), 10);
                if (currentCoins >= price) {
                    fertilizers.push({ 
                        buyLink: this._formatUrl(buyLink), 
                        helpLink: this._formatUrl(helpLink), 
                        price 
                    });
                }
            }
        });

        if (fertilizers.length === 0) return null;

        // 3. Вычисляем лучшее удобрение (перебираем от дешевых к дорогим)
        let bestLink = fertilizers[fertilizers.length - 1].buyLink; // Магнезит по умолчанию (резерв)

        for (let fert of fertilizers) {
            const $detail = await this.client.fetchHtml(fert.helpLink);
            if (!$detail) continue;

            const bonusMinutes = this._parseBonusMinutes($detail);
            if (bonusMinutes >= growTimeMin) {
                bestLink = fert.buyLink;
                this.log('💡', `Идеально подошло удобрение за ${fert.price} монет (с бонусами ускорит на ${bonusMinutes} мин).`);
                break;
            }
        }

        return bestLink;
    }

    /** Извлекает минуты из строки: "Вместе с Вашими бонусами ускоряет рост на: 7 часов 54 минуты" */
    _parseBonusMinutes($) {
        const textBlock = $('li:contains("Вместе с Вашими бонусами ускоряет рост на:")').find('.title').text().trim();
        if (!textBlock) return 0;
        
        let minutes = 0;
        const dMatch = textBlock.match(/(\d+)\s*дн/i);
        const hMatch = textBlock.match(/(\d+)\s*час/i);
        const mMatch = textBlock.match(/(\d+)\s*минут/i);

        if (dMatch) minutes += parseInt(dMatch[1], 10) * 1440;
        if (hMatch) minutes += parseInt(hMatch[1], 10) * 60;
        if (mMatch) minutes += parseInt(mMatch[1], 10);

        return minutes;
    }
}

module.exports = BasePlanter;