const BaseModule = require('../core/BaseModule');
const { URL } = require('url');

class NurseryModule extends BaseModule {
    static R_VOLIER = /Вольер\s*(\d+)\s*\/\s*(\d+)/i;
    static R_TASKS = /([А-Яа-яЁё]{3,})\s*(\(\d+\s*очк.*?\))?\s*(?:—|-|:)?\s*(\d+)\s*\/\s*(\d+)/gi;
    static R_GROW = /(?:вырастет|созреет|доступно)\s+(?:через|осталось)\s+(.{0,30})/gi;

    static getAbsoluteUrl(href, baseUrl) {
        if (!href) return null;
        try {
            let cleanHref = href.replace(/&amp;/g, '&');
            let base = baseUrl.startsWith('http') ? baseUrl : `https://sadovnik.mobi${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
            let u = new URL(cleanHref, base);
            return u.pathname + u.search;
        } catch (e) {
            return href;
        }
    }

    // Вспомогательная функция для регулярки из твоего старого бота
    static escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static async execute(client, db) {
        console.log('🐾 Анализируем Питомник...');
        
        let hasWork = true;
        let loops = 0;
        let $; 

        while(hasWork && loops < 15) {
            loops++;
            hasWork = false;
            
            $ = await client.fetchHtml('/mynursery');
            if (!$) break;

            let pageText = $('body').text();
            let pageTextLower = pageText.toLowerCase();

            // 0. ПРОВЕРКА ПОДТВЕРЖДЕНИЙ (Оригинальная защита)
            let confirmLink = $('a').filter((i, el) => $(el).text().toLowerCase().includes('да, подтверждаю')).first();
            if (confirmLink.length > 0) {
                let isSafe = pageTextLower.includes('отменить задание') || pageTextLower.includes('отказаться от') || pageTextLower.includes('сдать заказчику') || pageTextLower.includes('переместить');
                let isDangerous = pageTextLower.includes('очистить') || pageTextLower.includes('удалить') || pageTextLower.includes('купить') || pageTextLower.includes('освободить');
                
                if (!isSafe || isDangerous) {
                    let cancelLink = $('a').filter((i, el) => $(el).text().toLowerCase().includes('нет, отказываюсь')).first();
                    if (cancelLink.length > 0) {
                        console.log('🛡️ Защита Питомника: Заблокировано опасное окно!');
                        await client.fetchHtml(this.getAbsoluteUrl(cancelLink.attr('href'), '/mynursery'));
                    }
                } else {
                    await client.fetchHtml(this.getAbsoluteUrl(confirmLink.attr('href'), '/mynursery'));
                }
                hasWork = true; continue;
            }

            let allLinks = [];
            $('a').each((i, el) => {
                let href = $(el).attr('href') || '';
                let text = $(el).text().toLowerCase().trim();
                // Фильтр защиты от удаления вольеров
                if (!href.includes('buyCellLink') && !href.includes('clearCellLink') && !text.includes('очистить')) {
                    allLinks.push({ href, text, el: $(el) });
                }
            });

            // 1. СДАТЬ ГОТОВОЕ
            let submitLink = allLinks.find(l => l.text.includes('сдать заказчику') || l.href.includes('completeTaskLink'));
            if (submitLink) {
                console.log('📦 Питомник: Сдаем выполненный заказ!');
                await client.fetchHtml(this.getAbsoluteUrl(submitLink.href, '/mynursery'));
                hasWork = true; continue;
            }

            // 2. УСКОРИТЬ (Улучшенный парсер цифры "1")
            let speedLinks = allLinks.filter(l => l.href.includes('finishProducingLink'));
            let spedUp = false;
            for (let l of speedLinks) {
                // Достаем текст вокруг ссылки (например: "Ускорить за 💎 1")
                let parentText = l.el.parent().text(); 
                // Вырезаем все буквы и значки, оставляем только цифры
                let priceMatch = parentText.match(/(?:за|💎)\s*(\d+)/i);
                let price = priceMatch ? parseInt(priceMatch[1]) : 0;
                
                if (price === 1) {
                    console.log('💎 Питомник: Ускоряем рост за 1 рубин!');
                    await client.fetchHtml(this.getAbsoluteUrl(l.href, '/mynursery'));
                    spedUp = true; break;
                }
            }
            if (spedUp) { hasWork = true; continue; }

            // 3. ЗАБРАТЬ ИЗ КЛЕТОК
            let takeLink = allLinks.find(l => l.href.includes('putToEnclosure'));
            if (takeLink) {
                console.log('🐾 Питомник: Забираем выросшее животное!');
                await client.fetchHtml(this.getAbsoluteUrl(takeLink.href, '/mynursery'));
                hasWork = true; continue;
            }

            // 4. ОТМЕНА ПЛОХИХ КОНТРАКТОВ
            let vMatch = pageText.match(this.R_VOLIER);
            let vMax = vMatch ? parseInt(vMatch[2]) : 10;
            let vCur = vMatch ? parseInt(vMatch[1]) : 0;

            let cancelLinks = allLinks.filter(l => l.href.includes('cancelTaskLink'));
            let canceled = false;
            for (let l of cancelLinks) {
                let parentText = l.el.parent().text();
                let m = parentText.match(/(\d+)\s*\/\s*(\d+)/);
                if (m && parseInt(m[2]) > vMax) {
                    console.log('🗑️ Питомник: Отменяем невыполнимый контракт!');
                    
                    // 🛠️ ИСПРАВЛЕНО: Инлайн-перехват окна подтверждения
                    let $confirm = await client.fetchHtml(this.getAbsoluteUrl(l.href, '/mynursery'));
                    if ($confirm) {
                        let confirmLink = $confirm('a').filter((i, el) => $confirm(el).text().toLowerCase().includes('да, подтверждаю')).first();
                        if (confirmLink.length > 0) {
                            await client.fetchHtml(this.getAbsoluteUrl(confirmLink.attr('href'), '/mynursery'));
                            console.log('✅ Питомник: Контракт успешно отменен!');
                        }
                    }
                    canceled = true; break;
                }
            }
            if (canceled) { hasWork = true; continue; }

            // 5. АНАЛИЗ ЗАДАНИЙ И ПОСАДКА
            if (vCur < vMax) {
                let tasks = {};
                this.R_TASKS.lastIndex = 0;
                let tm;
                
                while ((tm = this.R_TASKS.exec(pageText)) !== null) {
                    let n = tm[1].trim(), z = parseInt(tm[3]), w = parseInt(tm[4]);
                    
                    let ptsMatch = tm[2] ? tm[2].match(/(\d+)/) : null;
                    let pts = ptsMatch ? parseInt(ptsMatch[1]) : 0;

                    if (w <= vMax && !['Вольер', 'Опыт', 'Задание', 'Вырастить'].includes(n)) {
                        // Точный подсчет растущих из твоего user.js
                        let regexGrowing = new RegExp(this.escapeRegExp(n) + "\\s*\\((?:вырастет|созреет|доступно)", "gi");
                        let growingMatch = pageText.match(regexGrowing);
                        let growingNow = growingMatch ? growingMatch.length : 0;
                        
                        tasks[n] = { 
                            req: Math.max(0, w - z - growingNow), 
                            z: z, 
                            pts: pts
                        };
                    }
                }

                if (Object.keys(tasks).length > 0 && Object.values(tasks).some(t => t.req > 0)) {
                    let selectLink = allLinks.find(l => l.text.includes('выращивать животное') && l.href.includes('nursery-select'));
                    if (selectLink) {
                        let select$ = await client.fetchHtml(this.getAbsoluteUrl(selectLink.href, '/mynursery'));
                        if (select$) {
                            let sLinks = [];
                            select$('a').filter((i, el) => ($(el).attr('href') || '').includes('putToCell')).each((i, el) => {
                                let name = $(el).text().trim();
                                if (tasks[name] && tasks[name].req > 0) {
                                    sLinks.push({ n: name, href: $(el).attr('href'), z: tasks[name].z, pts: tasks[name].pts });
                                }
                            });

                            if (sLinks.length > 0) {
                                // 🏆 ОРИГИНАЛЬНАЯ И ИСПРАВЛЕННАЯ СОРТИРОВКА
                                sLinks.sort((a, b) => {
                                    // 1. Приоритет начатым (если мы уже сдали хоть 1 штуку)
                                    let aStarted = a.z > 0 ? 1 : 0;
                                    let bStarted = b.z > 0 ? 1 : 0;
                                    if (aStarted !== bStarted) return bStarted - aStarted; 
                                    
                                    // 2. Если оба новые (или оба начатые), берем самые жирные по очкам
                                    if (b.pts !== a.pts) return b.pts - a.pts; 
                                    
                                    // 3. Защитный фоллбэк
                                    return b.z - a.z; 
                                }); 
                                
                                console.log(`🎯 Питомник: Сажаем животное - ${sLinks[0].n} (${sLinks[0].pts} очков, сдано ${sLinks[0].z})`);
                                await client.fetchHtml(this.getAbsoluteUrl(sLinks[0].href, '/mynursery'));
                                hasWork = true; continue;
                            }
                        }
                    }
                }
            }
        }

        // 6. ПАРСИНГ ТАЙМЕРОВ
        if ($) {
            let minTimeMs = Infinity;
            let finalText = $('body').text();
            this.R_GROW.lastIndex = 0;
            let matchGrow;
            while ((matchGrow = this.R_GROW.exec(finalText)) !== null) {
                let ms = this.extractTime(matchGrow[1]);
                if (ms !== null && ms > 0 && ms < minTimeMs) minTimeMs = ms;
            }
            
            // Оригинальная защита из твоего бота
            if (minTimeMs === Infinity) minTimeMs = 300000;
            else if (minTimeMs > 600000) minTimeMs = minTimeMs - 600000 + 2000;
            
            db.saveTimer('kb_nur_timer', Date.now() + minTimeMs);
            console.log(`✅ Питомник: Следующая проверка через ${Math.floor(minTimeMs / 60000)} мин.`);
        }
    }
}

module.exports = NurseryModule;