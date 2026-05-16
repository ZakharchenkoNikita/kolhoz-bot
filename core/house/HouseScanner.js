class HouseScanner {
    constructor(client, db, username) {
        this.client = client;
        this.db = db;
        this.username = username;
    }

    async scan() {
        try {
            let $house = await this.client.fetchHtml('/house');
            if (!$house) return;

            let profileData = this.db.getProfile();
            let bodyText = $house('body').text() || '';
            
            // Если панель дома свернута, открываем её
            if (!bodyText.includes('Для строительства дома') && !bodyText.includes('Идет строительство')) {
                let descLink = $house('a').filter((i, el) => ($house(el).attr('href') || '').includes('descLink')).first().attr('href');
                if (descLink) {
                    $house = await this.client.fetchHtml(descLink.replace(/^\.\//, '/'));
                    bodyText = $house('body').text() || '';
                }
            }

            if ($house) {
                // 1. ПАРСИНГ СТРОЙМАТЕРИАЛОВ
                let materials = {};
                const matKeys = ['nail', 'board', 'brick', 'voilok', 'paint', 'marble', 'glass'];
                
                let isBuilding = bodyText.includes('Идет строительство');
                profileData.is_building = isBuilding;
                
                matKeys.forEach(k => materials[k] = { have: 0, need: 0, today: 0, limit: 0, required: false });

                $house('img').each((i, img) => {
                    let src = $house(img).attr('src') || '';
                    let key = matKeys.find(k => src.includes(`${k}.png`));
                    if (!key) return;

                    let parentText = ($house(img).parent().text() || '').replace(/\s+/g, ' ');
                    
                    // 🛠️ СНЯТЫ "else if" - ТЕПЕРЬ ПРОВЕРЯЮТСЯ ВСЕ УСЛОВИЯ!
                    if (parentText.includes('из')) {
                        let match = parentText.match(/(\d+)\s*из\s*(\d+)/i);
                        if (match) {
                            materials[key].today = parseInt(match[1]);
                            materials[key].limit = parseInt(match[2]);
                        }
                    } 
                    
                    if (parentText.includes('у вас есть')) {
                        materials[key].required = true;
                        let match = parentText.match(/(\d+).*?у вас есть.*?(\d+)/i);
                        if (match) {
                            materials[key].need = parseInt(match[1]);
                            materials[key].have = parseInt(match[2]);
                        }
                    }
                    
                    if (isBuilding) {
                        let blockText = $house(img).closest('.ptm').text() || '';
                        if (blockText.includes('У вас есть:')) {
                            materials[key].required = true;
                            materials[key].need = 999999; 
                            let match = parentText.match(/(\d+)/);
                            if (match) materials[key].have = parseInt(match[1]);
                        }
                    }
                });
                
                profileData.materials = materials;

                // 2. ПАРСИНГ ИНТЕРЬЕРА
                let interior = {};
                
                $house('div.ptm').each((i, el) => {
                    let roomImg = $house(el).find('img.portrait');
                    if (roomImg.length > 0) {
                        let roomName = roomImg.attr('alt') || 'Неизвестная комната';
                        let slots = [];
                        
                        $house(el).find('img').each((j, img) => {
                            let src = $house(img).attr('src') || '';
                            
                            if (src.includes('door.png')) {
                                slots.push(null); 
                            } else if (src.includes('/interior/')) {
                                let idMatch = src.match(/\/interior\/(\d+)\.png/);
                                let lvlSpan = $house(img).closest('span').find('span.level');
                                let level = lvlSpan.length > 0 ? parseInt(lvlSpan.text().replace(/\D/g, '')) : 1;
                                
                                if (idMatch) {
                                    slots.push({ id: parseInt(idMatch[1]), level: level });
                                }
                            }
                        });
                        
                        if (slots.length === 6) {
                            interior[roomName] = slots;
                        } else if (slots.length > 0) {
                            interior[roomName] = slots;
                        }
                    }
                });
                
                let openRoomsCount = Object.keys(interior).length;

                // 🛡️ ЖЕЛЕЗОБЕТОННАЯ ЗАЩИТА ОТ ПУСТОЙ БАЗЫ
                if (openRoomsCount > 0) {
                    profileData.interior = interior;
                } else {
                    console.log(`⚠️ [${this.username}] Игра не выдала комнаты. Защита от стирания Домика в базе!`);
                    return; 
                }

                // 3. МЕХАНИЗМ БУДИЛЬНИКА ДЛЯ ЗАВАЛИНКИ И АРЕНЫ
                let nails = materials['nail'];
                if (nails && nails.required && (profileData.is_building || nails.have < nails.need)) {
                    let currentTimer = this.db.getTimer('kb_zav_timer');
                    if (currentTimer === -1) {
                        console.log(`⏰ [${this.username}] Сканер разбудил Завалинку (нужны гвозди)!`);
                        this.db.saveTimer('kb_zav_timer', 0);
                    }
                }

                let bricks = materials['brick'];
                if (bricks && bricks.required && (profileData.is_building || bricks.have < bricks.need)) {
                    let currentTimer = this.db.getTimer('kb_arena_timer');
                    if (currentTimer === -1) {
                        console.log(`⏰ [${this.username}] Сканер разбудил Арену (нужны кирпичи)!`);
                        this.db.saveTimer('kb_arena_timer', 0);
                    }
                }

                this.db.saveProfile(profileData);
                console.log(`🏠 [${this.username}] Домик просканирован! Открыто комнат: ${openRoomsCount}.`);
            }
        } catch (e) {
            console.error(`❌ Ошибка сканирования домика для ${this.username}:`, e);
        }
    }
}

module.exports = HouseScanner;