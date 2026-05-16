const SeedItems = require('../core/house/SeedItems');
const HouseScanner = require('../core/house/HouseScanner');
const StoreroomScanner = require('../core/house/StoreroomScanner');
const fs = require('fs');
const path = require('path');

class Designer {
    static async execute(client, db, username) {
        let debugLog = [];
        const log = (msg) => {
            debugLog.push(msg);
            console.log(msg); 
        };

        debugLog.push(`=== ОТЧЕТ ДИЗАЙНЕРА ДЛЯ: ${username} ===`);
        debugLog.push(`Время: ${new Date().toLocaleString()}`);

        try {
            let profile = db.getProfile();
            let interior = profile.interior || {};
            let storeroom = profile.storeroom || {};

            let openRooms = Object.keys(interior);
            debugLog.push(`Открыто комнат: ${openRooms.length}.`);
            
            if (openRooms.length === 0) {
                log(`[${username}] У аккаунта нет открытых комнат. Завершаю работу.`);
                return;
            }

            let maxStoreroom = storeroom.max || 10;
            debugLog.push(`Мест в чулане: ${maxStoreroom}`);
            const getItemData = (id) => SeedItems.find(i => i.id === id) || { name: 'Неизвестно', beauty: 0, convenience: 0, status: 0, can_improve: false };

            // === ЭТАП 1: ИНВЕНТАРИЗАЦИЯ ===
            let pool = [];
            let virtualStoreroom = []; 
            
            if (storeroom.items) {
                for (let item of storeroom.items) {
                    for (let i = 0; i < item.count; i++) {
                        let obj = { id: item.id, level: item.level || 1, source: 'Чулан' };
                        pool.push(obj);
                        virtualStoreroom.push(obj); 
                    }
                }
            }
            
            for (let room of Object.values(interior)) {
                for (let item of room) {
                    if (item !== null) pool.push({ id: item.id, level: item.level || 1, source: 'Дом' });
                }
            }

            if (pool.length === 0) {
                log(`[${username}] В доме и чулане абсолютно пусто. Расставлять нечего.`);
                return; 
            }

            // === ЭТАП 2: СОРТИРОВКА И ОТБОР (БЕЗ ОБРЕЗКИ ДО 36) ===
            let scoredPool = pool.map(item => {
                let data = getItemData(item.id);
                let c = data.convenience || 0;
                let s = data.status || 0;
                let baseScore = (c * 10) + s;
                
                let score = 0;
                if (data.name === 'Компьютер') {
                    score = 1000000 + (item.level * 1000) + baseScore;
                } else if (data.can_improve) {
                    score = 500000 + (item.level * 1000) + baseScore;
                } else {
                    score = baseScore;
                }
                
                return { ...item, data, score };
            });

            scoredPool.sort((a, b) => b.score - a.score);

            debugLog.push(`\n--- ВЕСЬ ДОСТУПНЫЙ ПУЛ ВЕЩЕЙ (ОТСОРТИРОВАН ПО ОЧКАМ) ---`);
            scoredPool.forEach((item, idx) => {
                debugLog.push(`[${idx + 1}] ID:${item.id} | Лвл:${item.level} | Очки:${item.score} | ${item.data.name} (У:${item.data.convenience} С:${item.data.status}) | Откуда: ${item.source}`);
            });

            let globalUpgradableLimit = openRooms.length * 2;
            let currentUpgradables = 0;
            let coffeeCount = 0;
            let validPool = []; // Сюда попадут все вещи, прошедшие лимиты

            for (let item of scoredPool) {
                if (item.data.name === 'Компьютер') {
                    validPool.push(item);
                } else if (item.data.name === 'Кофемашина') {
                    if (coffeeCount < 2) {
                        coffeeCount++;
                        currentUpgradables++; 
                        validPool.push(item);
                    }
                } else if (item.data.can_improve) {
                    if (currentUpgradables < globalUpgradableLimit) {
                        currentUpgradables++;
                        validPool.push(item);
                    }
                } else {
                    validPool.push(item);
                }
            }

            // === ЭТАП 3: УМНАЯ РАССТАНОВКА (ИСПРАВЛЕНО НА БЕСКОНЕЧНЫЙ ЦИКЛ ПО ПУЛУ) ===
            let idealInterior = {};
            for (let r of openRooms) idealInterior[r] = [];
            
            let totalPlaced = 0;
            let maxSlots = openRooms.length * 6;

            let computers = validPool.filter(i => i.data.name === 'Компьютер');
            let others = validPool.filter(i => i.data.name !== 'Компьютер');

            // 1. Ставим Компьютеры (стакаются в одну комнату)
            for (let item of computers) {
                if (totalPlaced >= maxSlots) break;
                for (let r of openRooms) {
                    if (idealInterior[r].length < 6) {
                        idealInterior[r].push(item);
                        totalPlaced++;
                        break;
                    }
                }
            }

            // 2. Ставим все остальные вещи по убыванию крутости
            for (let item of others) {
                if (totalPlaced >= maxSlots) break; // Если дом забит до отказа - останавливаемся
                
                let bestRoom = null;
                let minItems = 999;
                
                for (let r of openRooms) {
                    if (idealInterior[r].length >= 6) continue; // Комната уже полная
                    
                    // 🛠️ Жесткий запрет дубликатов в одной комнате
                    if (idealInterior[r].some(i => i.id === item.id)) continue; 
                    
                    // Контроль улучшаемых (максимум 2 на комнату)
                    if (item.data.can_improve) {
                        let upgCount = idealInterior[r].filter(i => i.data.can_improve && i.data.name !== 'Компьютер').length;
                        if (upgCount >= 2) continue;
                    }
                    
                    // Ищем самую пустую комнату, чтобы распределять равномерно
                    if (idealInterior[r].length < minItems) {
                        minItems = idealInterior[r].length;
                        bestRoom = r;
                    }
                }
                
                if (bestRoom) {
                    idealInterior[bestRoom].push(item);
                    totalPlaced++;
                }
            }

            // Забиваем оставшиеся дыры null (на случай, если у игрока физически не хватает вещей на весь дом)
            for (let r of openRooms) {
                while (idealInterior[r].length < 6) {
                    idealInterior[r].push(null);
                }
            }

            debugLog.push(`\n--- ИДЕАЛЬНАЯ РАССТАНОВКА (БЕЗ ДУБЛИКАТОВ И ПУСТЫХ ДЫР) ---`);
            for (let r of openRooms) {
                let roomSummary = idealInterior[r].map(i => i ? `${i.data.name}(Лвл:${i.level})` : 'ПУСТО').join(' | ');
                debugLog.push(`Комната ${r}: ${roomSummary}`);
            }

            // === ЭТАП 4: АГНОСТИЧНАЯ ЛОГИСТИКА "ПЯТНАШКИ 2.0" ===
            let roomTargets = {};
            for (let r of openRooms) {
                roomTargets[r] = [...idealInterior[r]];
            }

            let virtualState = {};
            for (let r of openRooms) {
                virtualState[r] = [];
                let targets = roomTargets[r];
                
                for (let i = 0; i < 6; i++) {
                    let curr = interior[r][i] || null;
                    if (curr) {
                        let matchIdx = targets.findIndex(t => t.id === curr.id && t.level === curr.level);
                        if (matchIdx !== -1) {
                            virtualState[r].push({ slot: i, item: curr, keep: true });
                            targets.splice(matchIdx, 1);
                        } else {
                            virtualState[r].push({ slot: i, item: curr, keep: false });
                        }
                    } else {
                        virtualState[r].push({ slot: i, item: null, keep: false });
                    }
                }
                roomTargets[r] = targets;
            }

            const getUsedSpace = (itemsArr) => {
                let space = 0;
                let counts = {};
                for(let item of itemsArr) {
                    let data = getItemData(item.id);
                    if (data.can_improve || data.name === 'Компьютер') space += 1; 
                    else counts[item.id] = (counts[item.id] || 0) + 1; 
                }
                for (let id in counts) space += Math.ceil(counts[id] / 20);
                return space;
            };

            let sequence = []; 
            let safetyCounter = 0;

            while (true) {
                safetyCounter++;
                if (safetyCounter > 200) {
                    debugLog.push(`\n🚨 ВНИМАНИЕ: АЛГОРИТМ ПРЕРВАН ИЗ-ЗА ЗАЦИКЛИВАНИЯ (>200 шагов)!`);
                    break; 
                }
                
                let actionTaken = false;

                for (let r of openRooms) {
                    if (roomTargets[r].length > 0) {
                        let emptySlotIdx = virtualState[r].findIndex(s => s.item === null);
                        if (emptySlotIdx !== -1) {
                            for (let t = 0; t < roomTargets[r].length; t++) {
                                let targetItem = roomTargets[r][t];
                                let sIdx = virtualStoreroom.findIndex(x => x.id === targetItem.id && x.level === targetItem.level);
                                if (sIdx !== -1) {
                                    sequence.push({ type: 'ADD', room: r, slot: emptySlotIdx, item: targetItem });
                                    virtualStoreroom.splice(sIdx, 1);
                                    virtualState[r][emptySlotIdx] = { slot: emptySlotIdx, item: targetItem, keep: true };
                                    roomTargets[r].splice(t, 1);
                                    actionTaken = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (actionTaken) break;
                }

                if (actionTaken) continue;

                for (let r of openRooms) {
                    let removeSlot = virtualState[r].find(s => s.item !== null && !s.keep);
                    if (removeSlot) {
                        let testStoreroom = [...virtualStoreroom, removeSlot.item];
                        if (getUsedSpace(testStoreroom) <= maxStoreroom) {
                            sequence.push({ type: 'REMOVE', room: r, slot: removeSlot.slot, item: removeSlot.item });
                            virtualStoreroom.push(removeSlot.item);
                            virtualState[r][removeSlot.slot] = { slot: removeSlot.slot, item: null, keep: false };
                            actionTaken = true;
                            break;
                        }
                    }
                }

                if (!actionTaken) break; 
            }

            debugLog.push(`\n--- ПЛАН ДЕЙСТВИЙ ---`);
            if (sequence.length === 0) {
                debugLog.push(`Дом собран идеально. Перестановка не требуется.`);
                log(`🛋️ [${username}] Дизайнер: Дом собран идеально по новым правилам.`);
            } else {
                sequence.forEach((move, idx) => {
                    let data = getItemData(move.item.id);
                    let act = move.type === 'ADD' ? 'УСТАНОВИТЬ' : 'УБРАТЬ';
                    debugLog.push(`[Шаг ${idx + 1}] ${act} | Комната: ${move.room} | Слот: ${move.slot} | Предмет: ${data.name} (ID:${move.item.id}, Лвл:${move.item.level})`);
                });
                log(`🛋️ [${username}] Дизайнер: Заполняю пустые слоты предметами из Чулана. Шагов: ${sequence.length}.`);
            }

            // === ЭТАП 5: ФИЗИЧЕСКОЕ ВЫПОЛНЕНИЕ ===
            for (let move of sequence) {
                let $h = await client.fetchHtml('/house');
                if (!$h) continue;
                
                let $room = $h(`img.portrait[alt="${move.room}"]`).closest('div.ptm');
                if (!$room.length) continue;
                
                let $slot = $room.find('span[style="position:relative;"]').eq(move.slot);
                let link = $slot.find('a').attr('href');

                if (!link) continue;

                if (move.type === 'REMOVE') {
                    if (!link.includes('door.png')) { 
                        let $confirm = await client.fetchHtml(link.replace(/^\.\//, '/'));
                        if ($confirm) {
                            let removeLink = $confirm('a:contains("Убрать")').attr('href');
                            if (removeLink) {
                                await client.fetchHtml(removeLink.replace(/^\.\//, '/'));
                                await new Promise(r => setTimeout(r, 800)); 
                            }
                        }
                    }
                } 
                else if (move.type === 'ADD') {
                    if ($slot.find('img').attr('src')?.includes('door.png')) { 
                        let $store = await client.fetchHtml(link.replace(/^\.\//, '/'));
                        if ($store) {
                            let placedLink = null;
                            $store('div.ptm').nextAll('div').each((i, el) => {
                                if (placedLink) return;
                                let imgSrc = $store(el).find('img.portrait').attr('src') || '';
                                if (imgSrc.includes(`/interior/${move.item.id}.png`)) {
                                    let lvl = parseInt($store(el).find('span.level').text()) || 1;
                                    if (lvl === move.item.level) {
                                        let roomPrefix = move.room.substring(0, 4).toLowerCase();
                                        placedLink = $store(el).find('a').filter((_, a) => $store(a).text().toLowerCase().includes(roomPrefix)).attr('href');
                                    }
                                }
                            });

                            if (placedLink) {
                                await client.fetchHtml(placedLink.replace(/^\.\//, '/')); 
                                await new Promise(r => setTimeout(r, 800)); 
                            }
                        }
                    }
                }
            }

            // === ЭТАП 6: ОБНОВЛЕНИЕ БАЗЫ ===
            await new HouseScanner(client, db, username).scan();
            await new StoreroomScanner(client, db, username).scan();

        } catch (err) {
            debugLog.push(`\n❌ КРИТИЧЕСКАЯ ОШИБКА ДИЗАЙНЕРА: ${err.message}`);
            debugLog.push(err.stack);
            console.error(`❌ [${username}] Ошибка в Дизайнере:`, err);
        } finally {
            try {
                let safeName = username.replace(/[^a-z0-9а-яё]/gi, '_');
                let logPath = path.join(__dirname, '..', `designer_debug_${safeName}.txt`);
                fs.writeFileSync(logPath, debugLog.join('\n'), 'utf8');
            } catch (fsErr) {
                console.error(`❌ [${username}] Не удалось сохранить лог:`, fsErr.message);
            }
        }
    }
}

module.exports = Designer;