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
        let cleanHref = href.startsWith('./') ? href.slice(2) : href;
        if (cleanHref.startsWith('/')) cleanHref = cleanHref.slice(1);
        
        // 🔥 ИСПРАВЛЕНИЯ ПУТЕЙ WICKET:
        if (cleanHref.startsWith('lab?')) return `/collective/${cleanHref}`;
        if (cleanHref.startsWith('soils?')) return `/shop/${cleanHref}`; 
        
        return `/${cleanHref}`;
    }

    // ==========================================
    // 🚀 ГЛАВНЫЙ ОРКЕСТРАТОР
    // ==========================================

    async prepareFarm(targetName, growTimeMin) {
        try {
            this.log('🚜', `Штаб отдал приказ: сажаем [${targetName}]!`);

            // Шаг 1. Тотальная зачистка
            await this._clearBeds();
            
            // Шаг 1.5. Проверка пушки (А вдруг семечко уже заряжено?)
            let isAlreadyCharged = false;
            const $farm = await this.client.fetchHtml('/myfarm');
            if ($farm) {
                // Вытаскиваем название текущего растения из слота
                const currentSeed = $farm('a[href*="changeLastSeedLink"]').next('span').text().trim();
                if (currentSeed === targetName) {
                    this.log('🌱', `Семечко [${targetName}] уже заряжено в пушку! Пропускаем поиск.`);
                    isAlreadyCharged = true;
                }
            }

            // Шаг 2 и 3. Ищем и заряжаем семечко (Только если пушка пуста или там другое растение)
            if (!isAlreadyCharged) {
                const seedLink = await this._getSeedLink(targetName);
                if (!seedLink) {
                    this.log('❌', `Не удалось найти ссылку на посадку ${targetName}. (Возможно, недоступно по уровню)`);
                    return false;
                }

                const formattedSeedLink = this._formatUrl(seedLink);
                await this._applyLink('🌱', `Заряжаем семечко...`, formattedSeedLink);
            }

            // Шаг 4. Умная калибровка удобрений (с учетом изменения Стейтов Wicket)
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
        this.log('🧪', `Идем на грядки, чтобы открыть витрину удобрений...`);
        
        const $farm = await this.client.fetchHtml('/myfarm');
        if (!$farm) return;

        const changeSoilHref = $farm('a[href*="changeLastSoilLink"]').attr('href');
        if (!changeSoilHref) {
            this.log('⚠️', 'Не могу найти ссылку "Сменить удобрение" на грядках!');
            return;
        }

        const changeSoilLink = this._formatUrl(changeSoilHref);
        this.log('🛒', `Открываем магазин...`);
        const $shop = await this.client.fetchHtml(changeSoilLink);
        if (!$shop) return;

        const bestFertilizerLink = await this._findBestFertilizer($shop, growTimeMin);
        if (bestFertilizerLink) {
            await this._applyLink('💉', 'Применяем высчитанное удобрение...', bestFertilizerLink);
        } else {
            this.log('⚠️', 'Подходящее удобрение не найдено. Сажаем без него.');
        }
    }

    async _findBestFertilizer(initialDoc, growTimeMin) {
        let currentDoc = initialDoc;
        let bestBuyLink = null;
        let lastBuyLink = null;
        let lastFertName = '';

        let itemsCount = 0;
        currentDoc('.block > ul > li').each((_, el) => {
            if (!currentDoc(el).html().includes('ruby.png')) itemsCount++;
        });

        if (itemsCount === 0) {
            this.log('⚠️', 'Парсер вообще не нашел недонатных удобрений!');
            return null;
        }

        for (let i = 0; i < itemsCount; i++) {
            let targetLi = null;
            let currentIndex = 0;
            currentDoc('.block > ul > li').each((_, el) => {
                if (currentDoc(el).html().includes('ruby.png')) return;
                if (currentIndex === i) targetLi = currentDoc(el);
                currentIndex++;
            });

            if (!targetLi) continue;

            const name = targetLi.find('div > a span').first().text().trim() || 'Удобрение';
            const helpHref = targetLi.find('a[href*="helpLink"]').attr('href');
            
            if (!helpHref) continue;

            // Заходим в "подробнее"
            const detailDoc = await this.client.fetchHtml(this._formatUrl(helpHref));
            if (!detailDoc) continue;
            
            currentDoc = detailDoc; 

            let updatedTargetLi = null;
            let updIndex = 0;
            currentDoc('.block > ul > li').each((_, el) => {
                if (currentDoc(el).html().includes('ruby.png')) return;
                if (updIndex === i) updatedTargetLi = currentDoc(el);
                updIndex++;
            });

            if (!updatedTargetLi) continue;

            let bonusText = currentDoc('li:contains("Вместе с Вашими бонусами")').find('.title').text().trim();
            if (!bonusText) {
                const baseTextMatch = updatedTargetLi.find('.minor.small').text().match(/Ускоряет рост на\s*([^,]+)/i);
                if (baseTextMatch) bonusText = baseTextMatch[1].trim();
            }
            const bonusMinutes = this._parseBonusMinutes(bonusText);
            
            const buyHref = updatedTargetLi.find('a[href*="buyLink"]').attr('href');
            lastBuyLink = this._formatUrl(buyHref);
            lastFertName = name;
            
            const price = updatedTargetLi.find('.nobr .title').text().replace(/\D/g, '');

            if (bonusMinutes >= growTimeMin) {
                bestBuyLink = lastBuyLink;
                this.log('💡', `Идеально подошло: ${name} за ${price} монет (ускорит на ${bonusMinutes} мин).`);
                break;
            } else {
                this.log('🔍', `[${name}] дает только ${bonusMinutes} мин. Ищем мощнее...`);
            }
        }

        if (!bestBuyLink && lastBuyLink) {
            this.log('⚠️', `Ни одно не перекрывает ${growTimeMin} мин. Берем самое мощное: ${lastFertName}.`);
            bestBuyLink = lastBuyLink;
        }

        return bestBuyLink;
    }

    _parseBonusMinutes(textBlock) {
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