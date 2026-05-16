const BaseModule = require('../../core/BaseModule');
const LotteryStats = require('./LotteryStats'); 

class LotteryModule extends BaseModule {
    
    // ==========================================
    // 0. НАВИГАТОР ПО СПИСКУ ЛОТЕРЕЙ
    // ==========================================
    static selectLottery(parsedPage, db) {
        const targetName = db.getAccountSettings('target_lottery') || 'Радость фермера';
        let targetHref = null;
        let actualName = null;
        let lastHref = null;
        let lastName = null;

        parsedPage('div.block a').each((i, el) => {
            let href = parsedPage(el).attr('href');
            let name = parsedPage(el).text().trim();
            
            if (href && href.includes('lottery?')) {
                lastHref = href;
                lastName = name;
                
                if (name.toLowerCase() === targetName.toLowerCase()) {
                    targetHref = href;
                    actualName = name;
                }
            }
        });

        if (targetHref) {
            return { href: targetHref.replace(/^\.\//, '/'), name: actualName };
        } else if (lastHref) {
            return { href: lastHref.replace(/^\.\//, '/'), name: lastName };
        }
        return { href: '/lottery', name: 'Лотерея' };
    }

    // ==========================================
    // 1. УМНЫЙ ПАРСИНГ ВЫИГРЫША 
    // ==========================================
    static parseWinnings(parsedPage, username, lotteryName) {
        let winHeader = parsedPage('li.title.pt').filter((i, el) => parsedPage(el).text().includes('Ваш выигрыш:')).first();
        if (winHeader.length > 0) {
            let winContainer = winHeader.next('li');
            let winningsObj = { exp: 0, money: 0, rubies: 0, kolkhozRubies: 0, items: [] };
            let rawLog = []; 
            
            winContainer.find('img').each((i, img) => {
                let src = parsedPage(img).attr('src') || '';
                let parent = parsedPage(img).parent();
                
                let fullText = parent.text().toLowerCase();
                
                let titleSpan = parent.find('.title').first();
                let valText = titleSpan.length > 0 ? titleSpan.text().trim() : parent.text().replace(/\s+/g, ' ').trim();
                
                let numVal = LotteryStats.parseValueToNumber(valText);

                if (src.includes('experience')) {
                    winningsObj.exp += numVal;
                    rawLog.push(`${valText} опыта`);
                } else if (src.includes('money')) {
                    winningsObj.money += numVal;
                    rawLog.push(`${valText} монет`);
                } else if (src.includes('ruby')) {
                    if (fullText.includes('колхоз')) {
                        winningsObj.kolkhozRubies += numVal;
                        rawLog.push(`${valText} рубинов (в колхоз 🏛️)`);
                    } else {
                        winningsObj.rubies += numVal;
                        rawLog.push(`${valText} рубинов`);
                    }
                } else {
                    let imgWidth = parsedPage(img).attr('width');
                    
                    if (imgWidth !== '16') {
                        let titleAttr = parsedPage(img).attr('title');
                        let itemName = titleAttr ? titleAttr.trim() : valText.replace(/\(.*?\)/g, '').trim(); 
                        if (itemName.length > 0) {
                            winningsObj.items.push(itemName);
                            rawLog.push(`предмет "${itemName}"`);
                        }
                    }
                }
            });
            
            if (rawLog.length > 0) {
                console.log(`🎁 [${username}] [${lotteryName}] Выигрыш билета: ${rawLog.join(', ')}`);
                return winningsObj; 
            }
        }
        return null; 
    }

    // ==========================================
    // 2. ПАРСИНГ БАЛАНСА ИГРОКА
    // ==========================================
    static parseBalance(parsedPage) {
        let block = parsedPage('div.framed div.block.small').last();
        if (block.length > 0) {
            let moneyImg = block.find('img[src*="money.png"]');
            if (moneyImg.length > 0) {
                let moneyText = moneyImg.parent().find('.title').text();
                if (!moneyText) moneyText = moneyImg.parent().text(); 
                let cleanMoney = parseInt(moneyText.replace(/\D/g, ''));
                if (!isNaN(cleanMoney)) return cleanMoney;
            }
        }
        return 0; 
    }

    // ==========================================
    // 3. УЛУЧШЕНИЕ ПАРАМЕТРОВ
    // ==========================================
    static async checkAndUpgrade(client, db, parsedPage, username, lotteryName) {
        const userPrio = db.getAccountSettings('lot_prio') || 'price'; 
        const upgradeHrefs = { 'price': 'discountLink', 'exp': 'extraExpLink', 'limit': 'limitLink' };

        let searchQueue = [userPrio];
        for (let key in upgradeHrefs) {
            if (key !== userPrio) searchQueue.push(key);
        }

        for (let currentPrio of searchQueue) {
            const targetKw = upgradeHrefs[currentPrio];
            let upgLink = parsedPage('a').filter((i, el) => {
                let href = parsedPage(el).attr('href') || '';
                return href.includes(targetKw);
            }).first();

            let href = upgLink.attr('href');
            if (href) {
                let actionUrl = href.replace(/^\.\//, '/');
                if (currentPrio === userPrio) {
                    console.log(`⚡ [${username}] [${lotteryName}] Улучшаем приоритет: ${currentPrio}`);
                } else {
                    console.log(`⚡ [${username}] [${lotteryName}] Улучшаем запасную цель: ${currentPrio}`);
                }
                
                await client.fetchHtml(actionUrl);
                db.saveTimer('kb_lot_timer', Date.now() + 5000); 
                return true;
            }
        }
        return false;
    }

    static extractPrice(linkEl) {
        let parent = linkEl.parent(); 
        let priceImg = parent.find('img[src*="money.png"]');
        if (priceImg.length > 0) {
            let priceText = priceImg.parent().find('.title').text();
            return parseInt(priceText.replace(/\D/g, '')) || 0;
        }
        return 0;
    }

    // ==========================================
    // 4. УМНАЯ ПОКУПКА БИЛЕТОВ
    // ==========================================
    static async buySingleTicket(client, parsedPage, balance, username, lotteryName) {
        let ticketHref = null;
        let ticketPrice = 0;
        let ticketName = "";

        let prizeLink = parsedPage('a').filter((i, el) => {
            let href = parsedPage(el).attr('href') || '';
            return href.includes('playLink') && !href.includes('10x');
        }).first();

        if (prizeLink.length > 0) {
            let textStr = prizeLink.text() + parsedPage(prizeLink).find('span').text();
            let remMatch = textStr.match(/осталось[^:]*:\s*(\d+)/i);
            let rem = remMatch ? parseInt(remMatch[1]) : 1; 
            
            if (rem > 0) {
                ticketHref = prizeLink.attr('href');
                ticketName = "Призовой билет";
                ticketPrice = this.extractPrice(prizeLink);
            }
        }

        if (!ticketHref) {
            let newsLink = parsedPage('a').filter((i, el) => {
                let href = parsedPage(el).attr('href') || '';
                return href.includes('playNewsstandLink') && !href.includes('10x');
            }).first();

            if (newsLink.length > 0) {
                let textStr = newsLink.text() + parsedPage(newsLink).find('span').text();
                let remMatch = textStr.match(/осталось[^:]*:\s*(\d+)/i);
                let rem = remMatch ? parseInt(remMatch[1]) : 1;
                
                if (rem > 0) {
                    ticketHref = newsLink.attr('href');
                    ticketName = "Билет из киоска";
                    ticketPrice = this.extractPrice(newsLink);
                }
            }
        }

        if (ticketHref && ticketPrice > 0) {
            if (balance >= ticketPrice) {
                console.log(`🎟️ [${username}] [${lotteryName}] Покупаем '${ticketName}' за ${ticketPrice.toLocaleString('ru-RU')} монет...`);
                let resultPage = await client.fetchHtml(ticketHref.replace(/^\.\//, '/'));
                return { success: true, spent: ticketPrice, resultPage: resultPage }; 
            } else {
                console.log(`🛑 [${username}] [${lotteryName}] Недостаточно монет! Цена: ${ticketPrice.toLocaleString('ru-RU')}, Баланс: ${balance.toLocaleString('ru-RU')}`);
                return { success: false, spent: 0 };
            }
        }
        return { success: false, spent: 0 };
    }

    // ==========================================
    // 5. ГЛАВНЫЙ МЕТОД ЗАПУСКА
    // ==========================================
    static async execute(client, db, workers) {
        const username = (workers && workers.username) ? workers.username : 'Бот';
        
        let listPage = await client.fetchHtml('/lotteryList');
        if (!listPage) return;

        let selected = this.selectLottery(listPage, db);
        console.log(`🧭 [${username}] Навигатор: выбрана лотерея "${selected.name}"`);

        let parsedPage = await client.fetchHtml(selected.href);
        if (!parsedPage) return;

        let pastWinnings = this.parseWinnings(parsedPage, username, selected.name);
        if (pastWinnings) {
            LotteryStats.updateDailyStats(db, username, 0, pastWinnings);
        }

        let upgraded = await this.checkAndUpgrade(client, db, parsedPage, username, selected.name);
        if (upgraded) return;

        let balance = this.parseBalance(parsedPage);

        let bought = await this.buySingleTicket(client, parsedPage, balance, username, selected.name);
        
        if (bought.success) {
            let newWinnings = null;
            if (bought.resultPage) {
                newWinnings = this.parseWinnings(bought.resultPage, username, selected.name);
            }
            
            LotteryStats.updateDailyStats(db, username, bought.spent, newWinnings);
            
            let delayMs = Math.floor(Math.random() * 2000) + 1000;
            db.saveTimer('kb_lot_ticket_timer', Date.now() + delayMs);
            return;
        }

        let waitTicketsMs = Math.floor(Math.random() * 3600000) + 3600000; 
        db.saveTimer('kb_lot_ticket_timer', Date.now() + waitTicketsMs);
        console.log(`🎫 [${username}] [${selected.name}] Доступных билетов пока нет. Зайдем за ними через ${Math.floor(waitTicketsMs / 60000)} минут.`);

        // 🛠️ ИЗМЕНЕНО: Запускаем умную проверку статуса прокачки
        let isMaxed = this.updateMaxLotteryStatus(parsedPage, db, username, selected.name);
        if (isMaxed) {
            db.saveTimer('kb_lot_timer', -1);
            console.log(`🏆 [${username}] [${selected.name}] Прокачка полностью завершена! Таймер стройки отключен навсегда (-1).`);
        }
    }

    // ==========================================
    // 6. ИНВЕНТАРИЗАЦИЯ ПРОКАЧКИ (STATE MACHINE)
    // ==========================================
    static updateMaxLotteryStatus(parsedPage, db, username, lotteryName) {
        // 1. Ищем любые кнопки улучшений
        let hasUpgradeLinks = false;
        parsedPage('a').each((i, el) => {
            let href = parsedPage(el).attr('href') || '';
            if (href.includes('discountLink') || href.includes('extraExpLink') || href.includes('limitLink')) {
                hasUpgradeLinks = true;
            }
        });

        // 2. Ищем активные таймеры стройки
        let minTimeMs = Infinity;
        parsedPage('li').each((i, el) => {
            let textLower = parsedPage(el).text().toLowerCase();
            if (textLower.includes('уменьшить цен') ||
                textLower.includes('увеличить мин') ||
                textLower.includes('ежедневный лимит') ||
                textLower.includes('увеличить лимит')) {

                let ms = this.extractTime(textLower);
                if (ms !== null && ms > 0 && ms < minTimeMs) {
                    minTimeMs = ms;
                }
            }
        });

        let profile = db.getProfile();

        // 3. Проверяем условие полного завершения (нет кнопок и нет активной стройки)
        if (!hasUpgradeLinks && minTimeMs === Infinity) {
            if (profile.max_lottery !== 1) {
                profile.max_lottery = 1;
                db.saveProfile(profile);
            }
            return true; // Сигнал для полного отключения таймера
        }

        // 4. Если мы здесь, значит прокачка еще возможна (самозалечивание базы)
        if (profile.max_lottery === 1) {
            profile.max_lottery = 0;
            db.saveProfile(profile);
            console.log(`🔄 [${username}] [${lotteryName}] Обнаружены новые уровни прокачки! Флаг max_lottery сброшен.`);
        }

        // 5. Разбираемся с текущим временем ожидания для стройки
        if (minTimeMs !== Infinity) {
            db.saveTimer('kb_lot_timer', Date.now() + minTimeMs);
            console.log(`✅ [${username}] [${lotteryName}] Ждем ${Math.floor(minTimeMs / 60000)} минут до следующего улучшения.`);
        } else {
            // Кнопки есть, но стройки нет (возможно, не хватило монет на этот тик)
            db.saveTimer('kb_lot_timer', Date.now() + 86400000); 
            console.log(`💰 [${username}] [${lotteryName}] Доступны новые улучшения, но пока не активированы. Проверим стройку через 24 часа.`);
        }

        return false; // Сигнал, что таймер отключать не нужно
    }
}

module.exports = LotteryModule;