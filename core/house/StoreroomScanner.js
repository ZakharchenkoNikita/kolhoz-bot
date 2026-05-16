class StoreroomScanner {
    constructor(client, db, username) {
        this.client = client;
        this.db = db;
        this.username = username;
    }

    async scan() {
        try {
            let $store = await this.client.fetchHtml('/storeroom');
            if (!$store) return;

            let profileData = this.db.getProfile();
            let storeroomData = {
                used: 0,
                max: 0,
                items: []
            };

            // 1. Парсим вместимость (Например: 1 / 10)
            let headerText = $store('h3:contains("Чулан")').text() || '';
            let capMatch = headerText.match(/(\d+)\s*\/\s*(\d+)/);
            if (capMatch) {
                storeroomData.used = parseInt(capMatch[1]);
                storeroomData.max = parseInt(capMatch[2]);
            }

            // 2. Парсим сами предметы в чулане
            $store('div.ptm').nextAll('div').each((i, el) => {
                let img = $store(el).find('img.portrait').attr('src');
                if (!img) return; // Пропускаем системные блоки (кнопки "в дом", "выкинуть")

                let idMatch = img.match(/\/interior\/(\d+)\.png/);
                if (idMatch) {
                    let itemId = parseInt(idMatch[1]);
                    
                    // Парсим количество в стаке (если есть)
                    let countText = $store(el).find('span.nobr.title span').text() || '1';
                    let count = parseInt(countText.replace(/\D/g, '')) || 1;

                    // Парсим уровень (если предмет улучшен)
                    let levelText = $store(el).find('span.level').text();
                    let level = levelText ? parseInt(levelText) : 1;

                    storeroomData.items.push({ 
                        id: itemId, 
                        count: count, 
                        level: level 
                    });
                }
            });

            profileData.storeroom = storeroomData;
            this.db.saveProfile(profileData);
            
            console.log(`📦 [${this.username}] Чулан просканирован! Занято: ${storeroomData.used}/${storeroomData.max} слотов.`);
        } catch (e) {
            console.error(`❌ Ошибка сканирования Чулана для ${this.username}:`, e);
        }
    }
}

module.exports = StoreroomScanner;