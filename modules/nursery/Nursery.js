const BaseModule = require('../../core/BaseModule');
const { URL } = require('url');

const NurseryBrain = require('./NurseryBrain');
const SeedAnimals = require('./SeedAnimals');
const NurseryDB = require('./NurseryDB');
const NurseryLogger = require('./NurseryLogger');

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

    static escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static async execute(client, db, usernameArg) {
        const botName = (usernameArg && usernameArg.username) ? usernameArg.username : (typeof usernameArg === 'string' ? usernameArg : (client.username || 'bot'));
        
        console.log(`🐾 [${botName}] Анализируем Питомник...`);
        
        const nurseryDb = new NurseryDB(db);
        const logger = new NurseryLogger(botName);

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

            // 0. ПРОВЕРКА ПОДТВЕРЖДЕНИЙ
            let confirmLink = $('a').filter((i, el) => $(el).text().toLowerCase().includes('да, подтверждаю')).first();
            if (confirmLink.length > 0) {
                let isSafe = pageTextLower.includes('отменить задание') || pageTextLower.includes('отказаться от') || pageTextLower.includes('сдать заказчику') || pageTextLower.includes('переместить');
                let isDangerous = pageTextLower.includes('очистить') || pageTextLower.includes('удалить') || pageTextLower.includes('купить') || pageTextLower.includes('освободить');
                
                if (!isSafe || isDangerous) {
                    let cancelLink = $('a').filter((i, el) => $(el).text().toLowerCase().includes('нет, отказываюсь')).first();
                    if (cancelLink.length > 0) {
                        console.log(`🛡️ [${botName}] Защита Питомника: Заблокировано опасное окно!`);
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
                if (!href.includes('buyCellLink') && !href.includes('clearCellLink') && !text.includes('очистить')) {
                    allLinks.push({ href, text, el: $(el) });
                }
            });

            // 1. СДАТЬ ГОТОВОЕ
            let submitLink = allLinks.find(l => l.text.includes('сдать заказчику') || l.href.includes('completeTaskLink'));
            if (submitLink) {
                logger.log('СДАЧА', 'Сдаем выполненный заказ заказчику!');
                await client.fetchHtml(this.getAbsoluteUrl(submitLink.href, '/mynursery'));
                hasWork = true; continue;
            }

            // 2. УСКОРИТЬ (за 1 рубин)
            let speedLinks = allLinks.filter(l => l.href.includes('finishProducingLink'));
            let spedUp = false;
            for (let l of speedLinks) {
                let parentText = l.el.parent().text(); 
                let priceMatch = parentText.match(/(?:за|💎)\s*(\d+)/i);
                let price = priceMatch ? parseInt(priceMatch[1]) : 0;
                
                if (price === 1) {
                    logger.log('УСКОРЕНИЕ', 'Тратим 1 рубин для моментального завершения роста.');
                    await client.fetchHtml(this.getAbsoluteUrl(l.href, '/mynursery'));
                    spedUp = true; break;
                }
            }
            if (spedUp) { hasWork = true; continue; }

            // 3. ЗАБРАТЬ ИЗ КЛЕТОК В ВОЛЬЕР
            let takeLink = allLinks.find(l => l.href.includes('putToEnclosure'));
            if (takeLink) {
                await client.fetchHtml(this.getAbsoluteUrl(takeLink.href, '/mynursery'));
                hasWork = true; continue;
            }

            // ==========================================
            // 👁️ СБОР ИНФОРМАЦИИ ДЛЯ МОЗГА
            // ==========================================
            let vMatch = pageText.match(this.R_VOLIER);
            let vMax = vMatch ? parseInt(vMatch[2]) : 10;
            let vCur = vMatch ? parseInt(vMatch[1]) : 0;

            let pointsMatch = pageText.match(/Всего очков питомника:\s*(\d+)/i);
            let currentPoints = pointsMatch ? parseInt(pointsMatch[1]) : 0;

            // 📦 Парсим Склад (Вольер)
            let inventory = {};
            let inventoryLinks = {};
            $('a[href*="cleanLink"]').each((i, el) => {
                let parent = $(el).parent();
                let img = parent.find('img').first();
                if (img.length > 0) {
                    let name = SeedAnimals.getNameByImage(img.attr('src').split('/').pop());
                    if (name) {
                        let countStr = $(el).text().replace(/\D/g, '');
                        let count = countStr ? parseInt(countStr) : 1;
                        inventory[name] = (inventory[name] || 0) + count;
                        inventoryLinks[name] = $(el).attr('href');
                    }
                }
            });

            // 🏠 Парсим Клетки
            let cells = [];
            $('a[href*="clearCellLink"]').each((i, el) => {
                let li = $(el).closest('li'); 
                let img = li.find('img').first();
                if (img.length > 0) {
                    let name = SeedAnimals.getNameByImage(img.attr('src').split('/').pop());
                    if (name) {
                        let timeLeftMs = 0;
                        this.R_GROW.lastIndex = 0;
                        let match = this.R_GROW.exec(li.text());
                        if (match) timeLeftMs = this.extractTime(match[1]);

                        cells.push({ name, timeLeftMs, clearLink: $(el).attr('href'), index: i });
                    }
                }
            });

            // Считаем пустые клетки
            let emptyCells = allLinks.filter(l => l.href.includes('nursery-select')).length;

            // 📜 Парсим Задания
            let tasks = [];
            let cancelLinksMap = {};
            let tasksHeader = $('h3').filter((i, el) => $(el).text().includes('Задания'));
            if (tasksHeader.length > 0) {
                let tasksList = tasksHeader.next('ul').find('li');
                tasksList.each((i, el) => {
                    let text = $(el).text();
                    this.R_TASKS.lastIndex = 0;
                    let tm = this.R_TASKS.exec(text);
                    if (tm) {
                        let n = tm[1].trim(), z = parseInt(tm[3]), w = parseInt(tm[4]);
                        let ptsMatch = tm[2] ? tm[2].match(/(\d+)/) : null;
                        let pts = ptsMatch ? parseInt(ptsMatch[1]) : 0;

                        if (!['Вольер', 'Опыт', 'Задание', 'Вырастить'].includes(n)) {
                            let cancelLink = $(el).find('a[href*="cancelTaskLink"]').attr('href');
                            if (cancelLink) cancelLinksMap[n] = cancelLink;
                            tasks.push({ name: n, w: w, z: z, pts: pts });
                        }
                    }
                });
            }

            let activeTasksDict = {};
            tasks.forEach(t => activeTasksDict[t.name] = t);
            nurseryDb.saveActiveTasks(activeTasksDict);
            let activeTaskNames = tasks.map(t => t.name);

            // ==========================================
            // 🧠 ЗАПРОСЫ К МОЗГУ
            // ==========================================

            // 4. Умная отмена мусора
            let tasksToCancel = NurseryBrain.getTasksToCancel(tasks, currentPoints, vMax);
            let canceled = false;
            for (let tObj of tasksToCancel) {
                let tName = tObj.name;
                let href = cancelLinksMap[tName];
                if (href) {
                    if (tObj.reason === 'impossible') {
                        logger.log('НЕВЫПОЛНИМЫЙ', `Удаляем квест: ${tName} (Ваш Вольер: ${tObj.volierMax}, а нужно: ${tObj.required})`);
                    } else if (tObj.reason === 'unprofitable') {
                        logger.log('НЕВЫГОДНЫЙ', `Удаляем квест: ${tName} (КПД: ${tObj.kpd})`);
                    } else {
                        logger.log('ОТМЕНА', `Удаляем квест: ${tName}`);
                    }
                    
                    let $confirm = await client.fetchHtml(this.getAbsoluteUrl(href, '/mynursery'));
                    if ($confirm) {
                        let cLink = $confirm('a').filter((i, el) => $confirm(el).text().toLowerCase().includes('да, подтверждаю')).first();
                        if (cLink.length > 0) await client.fetchHtml(this.getAbsoluteUrl(cLink.attr('href'), '/mynursery'));
                    }
                    canceled = true; break;
                }
            }
            if (canceled) { hasWork = true; continue; }

            // 5. Анализ и Выполнение
            let execution = NurseryBrain.analyzeExecution(tasks, vCur, vMax, inventory, cells);

            if (execution.action === 'plant') {
                let targetAnimal = execution.task.name;
                
                if (emptyCells > 0) {
                    let selectLink = allLinks.find(l => l.href.includes('nursery-select'));
                    if (selectLink) {
                        let select$ = await client.fetchHtml(this.getAbsoluteUrl(selectLink.href, '/mynursery'));
                        if (select$) {
                            let planted = false;
                            let pageLoops = 0;
                            let showedAll = false;

                            while (!planted && pageLoops < 10) {
                                pageLoops++;
                                
                                if (!showedAll) {
                                    let showAllLink = select$('a').filter((i, el) => $(el).text().toLowerCase().includes('показать всех')).first().attr('href');
                                    if (showAllLink) {
                                        logger.log('НАВИГАЦИЯ', `Открываем полный список животных...`);
                                        select$ = await client.fetchHtml(this.getAbsoluteUrl(showAllLink, '/mynursery'));
                                        showedAll = true;
                                        if (!select$) break;
                                    } else {
                                        showedAll = true;
                                    }
                                }

                                let sLink = select$('a').filter((i, el) => {
                                    let href = ($(el).attr('href') || '');
                                    if (!href.includes('putToCell')) return false;
                                    
                                    let text = $(el).text().trim(); 
                                    return text === targetAnimal;
                                }).first().attr('href');

                                if (sLink) {
                                    logger.log('ПОСАДКА', `Сажаем квестовое животное: ${targetAnimal}`);
                                    await client.fetchHtml(this.getAbsoluteUrl(sLink, '/mynursery'));
                                    planted = true;
                                    hasWork = true; 
                                    break;
                                } else {
                                    let nextLink = select$('a').filter((i, el) => {
                                        let t = $(el).text();
                                        return t.includes('>') || t.includes('&gt;') || t.includes('Вперед') || t.includes('Далее');
                                    }).first().attr('href');
                                    
                                    if (nextLink) {
                                        logger.log('НАВИГАЦИЯ', `Ищем ${targetAnimal} на следующей странице...`);
                                        select$ = await client.fetchHtml(this.getAbsoluteUrl(nextLink, '/mynursery'));
                                        if (!select$) break;
                                    } else {
                                        logger.log('ОШИБКА', `Животное ${targetAnimal} не найдено на страницах посадки!`);
                                        break; 
                                    }
                                }
                            }
                            if (planted) continue;
                        }
                    }
                } else {
                    let victim = NurseryBrain.getCellToClear(cells, activeTaskNames);
                    if (victim && victim.clearLink) {
                        logger.log('КЛЕТКИ', `Освобождаем клетку по правилу 50%. Убиваем фоновое животное: ${victim.name}`);
                        let $confirm = await client.fetchHtml(this.getAbsoluteUrl(victim.clearLink, '/mynursery'));
                        if ($confirm) {
                            let cLink = $confirm('a').filter((i, el) => $confirm(el).text().toLowerCase().includes('да, подтверждаю')).first();
                            if (cLink.length > 0) await client.fetchHtml(this.getAbsoluteUrl(cLink.attr('href'), '/mynursery'));
                        }
                        hasWork = true; continue;
                    }
                }
            } 
            else if (execution.action === 'clean') {
                let targetCleanAnimal = execution.candidates[0].name;
                let cleanLink = inventoryLinks[targetCleanAnimal];
                if (cleanLink) {
                    logger.log('СКЛАД', `Критическая нехватка места для квеста '${execution.forTask}'. Продаем фоновое животное: ${targetCleanAnimal}`);
                    let $confirm = await client.fetchHtml(this.getAbsoluteUrl(cleanLink, '/mynursery'));
                    if ($confirm) {
                        let cLink = $confirm('a').filter((i, el) => $confirm(el).text().toLowerCase().includes('да, подтверждаю')).first();
                        if (cLink.length > 0) await client.fetchHtml(this.getAbsoluteUrl(cLink.attr('href'), '/mynursery'));
                    }
                    hasWork = true; continue;
                }
            }
            else if (execution.action === 'cancel_impossible') {
                let href = cancelLinksMap[execution.task.name];
                if (href) {
                    logger.log('ОТМЕНА', `Отменяем безнадежный квест '${execution.task.name}' (не влезет даже при полной зачистке фона).`);
                    let $confirm = await client.fetchHtml(this.getAbsoluteUrl(href, '/mynursery'));
                    if ($confirm) {
                        let cLink = $confirm('a').filter((i, el) => $confirm(el).text().toLowerCase().includes('да, подтверждаю')).first();
                        if (cLink.length > 0) await client.fetchHtml(this.getAbsoluteUrl(cLink.attr('href'), '/mynursery'));
                    }
                    hasWork = true; continue;
                }
            }
            else if (execution.action === 'wait') {
                let bgAnimal = NurseryBrain.getBackgroundAnimal(currentPoints, vMax, inventory, cells, activeTaskNames);
                if (bgAnimal && emptyCells > 0) {
                    let selectLink = allLinks.find(l => l.href.includes('nursery-select'));
                    if (selectLink) {
                        let select$ = await client.fetchHtml(this.getAbsoluteUrl(selectLink.href, '/mynursery'));
                        if (select$) {
                            let planted = false;
                            let pageLoops = 0;
                            let showedAll = false; 

                            while (!planted && pageLoops < 10) {
                                pageLoops++;
                                
                                if (!showedAll) {
                                    let showAllLink = select$('a').filter((i, el) => $(el).text().toLowerCase().includes('показать всех')).first().attr('href');
                                    if (showAllLink) {
                                        logger.log('НАВИГАЦИЯ', `Открываем полный список животных...`);
                                        select$ = await client.fetchHtml(this.getAbsoluteUrl(showAllLink, '/mynursery'));
                                        showedAll = true;
                                        if (!select$) break;
                                    } else {
                                        showedAll = true;
                                    }
                                }

                                let sLink = select$('a').filter((i, el) => {
                                    let href = ($(el).attr('href') || '');
                                    if (!href.includes('putToCell')) return false;
                                    
                                    let text = $(el).text().trim();
                                    return text === bgAnimal;
                                }).first().attr('href');

                                if (sLink) {
                                    logger.log('КОВЧЕГ', `Заполняем буфер склада. Сажаем: ${bgAnimal}`);
                                    await client.fetchHtml(this.getAbsoluteUrl(sLink, '/mynursery'));
                                    planted = true;
                                    hasWork = true; 
                                    break;
                                } else {
                                    let nextLink = select$('a').filter((i, el) => {
                                        let t = $(el).text();
                                        return t.includes('>') || t.includes('&gt;') || t.includes('Вперед') || t.includes('Далее');
                                    }).first().attr('href');
                                    
                                    if (nextLink) {
                                        logger.log('НАВИГАЦИЯ', `Ищем ${bgAnimal} на следующей странице...`);
                                        select$ = await client.fetchHtml(this.getAbsoluteUrl(nextLink, '/mynursery'));
                                        if (!select$) break;
                                    } else {
                                        logger.log('ОШИБКА', `Фоновое животное ${bgAnimal} не найдено на страницах посадки!`);
                                        break; 
                                    }
                                }
                            }
                            if (planted) continue;
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
            
            if (minTimeMs === Infinity) minTimeMs = 300000;
            else if (minTimeMs > 600000) minTimeMs = minTimeMs - 600000 + 2000;
            
            nurseryDb.saveTimer(Date.now() + minTimeMs);
            console.log(`⏳ [${botName}] Питомник: Следующая проверка через ${Math.floor(minTimeMs / 60000)} мин.`);
        }
    }
}

module.exports = NurseryModule;