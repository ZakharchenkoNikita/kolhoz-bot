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
        
        // 🔥 ИСПРАВЛЕНИЕ: В игре ссылка лабы пишется как ./lab, 
        // но реальный путь /collective/lab. Исправляем на лету!
        if (cleanHref.startsWith('lab?')) {
            return `/collective/${cleanHref}`;
        }
        
        return `/${cleanHref}`;
    }

    // ==========================================
    // 🚀 ГЛАВНЫЙ ОРКЕСТРАТОР (Шаблонный метод)
    // ==========================================

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
            const formattedSeedLink = this._formatUrl(seedLink);
            await this._applyLink('🌱', `Заряжаем семечко (GET ${formattedSeedLink})...`, formattedSeedLink);

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

    async _findBestFertilizer($, growTimeMin) {
        const fertilizers = [];
        
        // 🔥 ИСПРАВЛЕНИЕ: Убрали парсинг баланса монет. Берем вообще все удобрения за монеты!
        $('li').each((_, el) => {
            const html = $(el).html();
            if (!html || html.includes('ruby.png')) return; // Пропускаем донатные (за рубины)

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

        // По умолчанию ставим самое мощное/дорогое удобрение (Магнезит), если вдруг таймер слишком большой
        let bestLink = fertilizers[fertilizers.length - 1].buyLink; 

        // Идем от дешевых к дорогим и ищем то, которое покроет время
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