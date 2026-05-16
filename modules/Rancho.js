const BaseModule = require('../core/BaseModule');
const { URL } = require('url');

class RanchoModule extends BaseModule {
    // Храним в памяти недоступный госзаказ, чтобы не уходить в цикл
    static ignoredGoszakaz = ''; 

    static getAbsoluteUrl(href, baseUrl) {
        if (!href) return null;
        try {
            let base = baseUrl.startsWith('http') ? baseUrl : `https://sadovnik.mobi${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
            let u = new URL(href, base);
            return u.pathname + u.search;
        } catch (e) {
            return href;
        }
    }

    // 🛠️ ДОБАВЛЕНО: Функция парсинга времени
    static extractTime(timeStr) {
        if (!timeStr) return null;
        let totalMs = 0;
        let hMatch = timeStr.match(/(\d+)\s*(?:ч|час)/i);
        let mMatch = timeStr.match(/(\d+)\s*(?:м|мин)/i);
        let sMatch = timeStr.match(/(\d+)\s*(?:с|сек)/i);
        if (hMatch) totalMs += parseInt(hMatch[1], 10) * 3600000;
        if (mMatch) totalMs += parseInt(mMatch[1], 10) * 60000;
        if (sMatch) totalMs += parseInt(sMatch[1], 10) * 1000;
        return totalMs > 0 ? totalMs : null;
    }

    static async execute(client, db) {
        // 🛡️ ДОБАВЛЕНО: Защита от вылетов
        try {
            console.log('🐎 Анализируем Ранчо...');

            const startUrl = '/rancho';
            const $ = await client.fetchHtml(startUrl);
            if (!$) return;

            // 1. ПАРСИНГ ДАННЫХ И УРОВНЯ
            let pageText = $('body').text();
            let lvlMatch = pageText.match(/(\d+)\s*ур/i);
            let currentLevel = lvlMatch ? parseInt(lvlMatch[1]) : 0;
            let savedLevel = db.getTimer('kb_r_level') || 0;

            let currentPlantLink = $('a').filter((i, el) => $(el).text().includes('Текущее растение')).first();
            if (currentPlantLink.length === 0) return;

            let currentPlantImg = currentPlantLink.parent().find('img').first();
            let currentPlantName = currentPlantImg.length > 0 ? (currentPlantImg.attr('title') || currentPlantImg.attr('alt') || '') : '';

            // Бронебойный парсинг Госзаказа (исправлен баг с 'o')
            let goszakazName = '';
            $('img').each((i, el) => {
                let src = $(el).attr('src') || '';
                let title = $(el).attr('title') || $(el).attr('alt') || '';
                // Защита: Растения лежат только в папке afarm или plants
                if (src.includes('afarm') || src.includes('plants')) {
                    if ($(el).parent().text().includes('Госзаказ')) {
                        goszakazName = title;
                    }
                }
            });

            // 2. СИСТЕМА ТРИГГЕРОВ
            let needsUpgrade = false;
            let targetPlant = null;

            if (currentPlantImg.length === 0) {
                needsUpgrade = true; // Триггер А: Пустые руки
            } else if (goszakazName && currentPlantName !== goszakazName && goszakazName !== this.ignoredGoszakaz) {
                needsUpgrade = true; // Триггер Б: Пришел новый Госзаказ, и мы его еще не занесли в ЧС
                targetPlant = goszakazName;
            } else if (currentLevel > savedLevel) {
                needsUpgrade = true; // Триггер В: Левелап (появились новые семена)
            }

            if (needsUpgrade) {
                await this.runAutoUpgrade(client, db, currentPlantLink, currentLevel, targetPlant, startUrl);
                return;
            }

            // 3. ДЕЙСТВИЯ С ЛУНКАМИ
            let dirtLinks = $('a.dirtLink');
            if (dirtLinks.length > 0) {
                for (let i = 0; i < dirtLinks.length; i++) {
                    let dirt = $(dirtLinks[i]);
                    let timeMs = this.extractTime(dirt.text());

                    // Если на грядке НЕТ таймера — значит ее можно вскопать или посадить
                    if (timeMs === null) {
                        let actionUrl = this.getAbsoluteUrl(dirt.attr('href'), startUrl);
                        if (actionUrl) {
                            console.log(`⚡ Ранчо: Взаимодействую с лункой!`);
                            let result$ = await client.fetchHtml(actionUrl);

                            // Перехватчик "Вы уверены?" 
                            if (result$) {
                                let confirmNode = result$('a').filter((idx, el) => (result$(el).attr('href') || '').includes('confirmLink')).first();
                                if (confirmNode.length > 0) {
                                    let confirmUrl = this.getAbsoluteUrl(confirmNode.attr('href'), actionUrl);
                                    console.log(`⚠️ Ранчо: Подтверждаем действие!`);
                                    await client.fetchHtml(confirmUrl);
                                }
                            }
                            db.saveTimer('kb_r_timer', Date.now() + 3000);
                            return;
                        }
                    }
                }
            }

            // Кнопка "Собрать всё" (если есть VIP)
            let harvestAll = $('a').filter((i, el) => {
                let href = $(el).attr('href') || '';
                let text = $(el).text().toLowerCase();
                return href.includes('harvestAll') || text.includes('собрать всё') || text.includes('собрать все');
            }).first();

            if (harvestAll.length > 0) {
                let actionUrl = this.getAbsoluteUrl(harvestAll.attr('href'), startUrl);
                console.log(`⚡ Ранчо: Собираем весь урожай!`);
                await client.fetchHtml(actionUrl);
                db.saveTimer('kb_r_timer', Date.now() + 3000);
                return;
            }

            // 4. ПАРСИНГ ТАЙМЕРОВ СОЗРЕВАНИЯ
            let minTimeMs = Infinity;
            dirtLinks.each((i, el) => {
                let timeMs = this.extractTime($(el).text());
                if (timeMs !== null && timeMs > 0 && timeMs < minTimeMs) {
                    minTimeMs = timeMs;
                }
            });

            if (minTimeMs === Infinity) minTimeMs = 300000;
            db.saveTimer('kb_r_timer', Date.now() + minTimeMs);
            console.log(`✅ На Ранчо всё сделано. Спим ${Math.floor(minTimeMs / 60000)} минут.`);

        } catch (e) {
            console.error("🚨 КРИТИЧЕСКАЯ ОШИБКА НА РАНЧО:", e);
            db.saveTimer('kb_r_timer', Date.now() + 60000); // Спим минуту, чтобы не спамить лог ошибками
        }
    }

    // Метод выбора семян
    static async runAutoUpgrade(client, db, linkElement, currentLevel, targetPlantName, currentUrl) {
        console.log(`🌱 Ранчо: Нужно выбрать новые семена. Госзаказ: ${targetPlantName || 'Нет'}`);

        let exactUrl = this.getAbsoluteUrl(linkElement.attr('href'), currentUrl);
        let $ = await client.fetchHtml(exactUrl);
        if (!$) {
            db.saveTimer('kb_r_timer', Date.now() + 10000);
            return;
        }

        let seedLinks = $('a').filter((i, el) => ($(el).attr('href') || '').includes('plantLink'));
        let selectedSeedUrl = null;

        if (targetPlantName) {
            let targetEl = seedLinks.filter((i, el) => {
                let img = $(el).find('img').first();
                let name = img.length > 0 ? (img.attr('title') || img.attr('alt') || '') : '';
                return name === targetPlantName;
            }).first();

            if (targetEl.length > 0) {
                selectedSeedUrl = targetEl.attr('href');
                console.log(`🎯 Ранчо: Взят Госзаказ (${targetPlantName})!`);
                this.ignoredGoszakaz = ''; // Успешно взяли, очищаем черный список
            } else {
                console.log(`⚠️ Ранчо: Госзаказ недоступен! Добавляем в черный список.`);
                this.ignoredGoszakaz = targetPlantName; // ⛔ ЗАНОСИМ В ЧЕРНЫЙ СПИСОК!
                if (seedLinks.length > 0) selectedSeedUrl = $(seedLinks[seedLinks.length - 1]).attr('href');
            }
        } else {
            if (seedLinks.length > 0) selectedSeedUrl = $(seedLinks[seedLinks.length - 1]).attr('href');
        }

        if (selectedSeedUrl) {
            let finalUrl = this.getAbsoluteUrl(selectedSeedUrl, exactUrl);
            await client.fetchHtml(finalUrl);
            console.log(`✅ Семена успешно выбраны!`);
        } else {
            console.log(`❌ Ошибка: Не найдено ссылок на семена!`);
        }

        db.saveTimer('kb_r_level', currentLevel);
        db.saveTimer('kb_r_timer', Date.now() + 3000);
    }
}

module.exports = RanchoModule;