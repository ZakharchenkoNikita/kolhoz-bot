/**
 * Базовый класс для автоматической посадки (ООП Родитель).
 * Берет на себя грязную работу: очистку грядок, расчет времени и применение удобрений.
 */
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
        
        // Убираем ./ в начале, если есть
        let cleanHref = href.startsWith('./') ? href.slice(2) : href;
        if (cleanHref.startsWith('/')) cleanHref = cleanHref.slice(1);
        
        // Исправление для Лаборатории
        if (cleanHref.startsWith('lab?')) {
            return `/collective/${cleanHref}`;
        }
        
        return `/${cleanHref}`;
    }

    // ==========================================
    // 🚀 ГЛАВНЫЙ ОРКЕСТРАТОР
    // ==========================================

    async prepareFarm(targetName, growTimeMin) {
        try {
            this.log('🚜', `Штаб отдал приказ: сажаем [${targetName}]!`);

            // Шаг 1. Зачистка грядок
            await this._clearBeds();
            
            // Шаг 2. Ищем ссылку на посадку
            const seedLink = await this._getSeedLink(targetName);
            if (!seedLink) {
                this.log('❌', `Не удалось найти ссылку на посадку ${targetName}.`);
                return false;
            }

            // Шаг 3. Заряжаем пушку семечком
            const formattedSeedLink = this._formatUrl(seedLink);
            await this._applyLink('🌱', `Заряжаем семечко...`, formattedSeedLink);

            // Шаг 4. Умная калибровка и покупка удобрения (только если нужно)
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
    // 🛠️ РАБОЧИЕ МЕТОДЫ
    // ==========================================

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

    async _applyLink(emoji, text, link) {
        this.log(emoji, text);
        await this.client.fetchHtml(link);
    }

    // 🔥 ИСПРАВЛЕННЫЙ МЕТОД: Заходим в магазин ПРАВИЛЬНО
    async _applyFertilizer(growTimeMin) {
        this.log('🧪', `Идем на грядки, чтобы открыть витрину удобрений...`);
        
        // 1. Возвращаемся на ферму, чтобы найти ссылку "Сменить удобрение"
        const $farm = await this.client.fetchHtml('/myfarm');
        if (!$farm) return;

        const changeSoilHref = $farm('a[href*="changeLastSoilLink"]').attr('href');
        if (!changeSoilHref) {
            this.log('⚠️', 'Не могу найти ссылку "Сменить удобрение" на грядках!');
            return;
        }

        const changeSoilLink = this._formatUrl(changeSoilHref);
        
        // 2. Кликаем по ней — и вот теперь игра отдаст нам правильный список удобрений!
        this.log('🛒', `Открываем магазин...`);
        const $shop = await this.client.fetchHtml(changeSoilLink);
        if (!$shop) return;

        // 3. Считаем математику и выбираем
        const bestFertilizerLink = await this._findBestFertilizer($shop, growTimeMin);
        if (bestFertilizerLink) {
            await this._applyLink('💉', 'Применяем высчитанное удобрение...', bestFertilizerLink);
        } else {
            this.log('⚠️', 'Подходящее удобрение за монеты не найдено.');
        }
    }

    async _findBestFertilizer($, growTimeMin) {
        const fertilizers = [];
        
        $('li').each((_, el) => {
            const html = $(el).html();
            if (!html || html.includes('ruby.png')) return; // Пропускаем донатные

            const buyLink = $(el).find('a[href*="buyLink"]').first().attr('href');
            const helpLink = $(el).find('a[href*="helpLink"]').first().attr('href');
            const priceText = $(el).find('.nobr .title').text();
            
            if (buyLink && helpLink && priceText) {
                const price = parseInt(priceText.replace(/\D/g, ''), 10);
                fertilizers.push({ 
                    buyLink: this._formatUrl(buyLink), 
                    helpLink: this._formatUrl(helpLink), 
                    price 
                });
            }
        });

        if (fertilizers.length === 0) {
            this.log('⚠️', 'Парсер вообще не нашел удобрений на странице магазина!');
            return null;
        }

        let bestLink = fertilizers[fertilizers.length - 1].buyLink; 

        for (let fert of fertilizers) {
            const $detail = await this.client.fetchHtml(fert.helpLink);
            if (!$detail) continue;

            const bonusMinutes = this._parseBonusMinutes($detail);
            if (bonusMinutes >= growTimeMin) {
                bestLink = fert.buyLink;
                this.log('💡', `Идеально подошло удобрение за ${fert.price} монет (ускорит на ${bonusMinutes} мин).`);
                break;
            }
        }

        return bestLink;
    }

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