class ProfileScanner {
    constructor(client, db, username) {
        this.client = client;
        this.db = db;
        this.username = username;
    }

    async scan() {
        try {
            let $me = await this.client.fetchHtml('/me');
            if (!$me) return;
            
            let profileData = this.db.getProfile(); 
            let pageText = $me.text() || '';
            let htmlText = $me.html() || '';
            
            // 🛠️ ИСПРАВЛЕНО: Бронебойный парсинг ника через регулярку
            let nickMatch = htmlText.match(/Вы вошли как\s*<span>(.*?)<\/span>/i);
            if (nickMatch && nickMatch[1]) {
                profileData.nickname = nickMatch[1].trim();
            } else {
                profileData.nickname = this.username; // Страховка
            }
            
            let coinsText = $me('img[src*="money.png"]').last().parent().text() || '';
            let parsedCoins = parseInt(coinsText.replace(/\D/g, ''));
            if (!isNaN(parsedCoins)) profileData.coins = parsedCoins;

            let rubiesText = $me('img[src*="ruby.png"]').last().parent().text() || '';
            let parsedRubies = parseInt(rubiesText.replace(/\D/g, ''));
            if (!isNaN(parsedRubies)) profileData.rubies = parsedRubies;
            
            let lvlText = $me('img[src*="avatars"]').last().parent().text() || '';
            let parsedLvl = parseInt(lvlText.replace(/\D/g, ''));
            if (!isNaN(parsedLvl)) profileData.level = parsedLvl;
            
            let idMatch = pageText.match(/id:\s*(\d+)/i);
            if (idMatch) profileData.game_id = idMatch[1];
            
            let xpDayMatch = pageText.match(/Двойной\s*опыт:\s*([А-Яа-яЁё]+)/i);
            if (xpDayMatch) profileData.xp_day = xpDayMatch[1].charAt(0).toUpperCase() + xpDayMatch[1].slice(1);
            
            let xpMatch = pageText.match(/Опыт личный:[\s\S]*?\(\s*(\d+)\s*\)/i);
            if (xpMatch) {
                let parsedXpTotal = parseInt(xpMatch[1]);
                let mskNow = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
                let lastUpdate = new Date(profileData.last_xp_update || 0);
                let mskLast = new Date(lastUpdate.toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
                
                if (mskNow.getDate() !== mskLast.getDate() || mskNow.getMonth() !== mskLast.getMonth() || mskNow.getFullYear() !== mskLast.getFullYear()) {
                    profileData.xp_start_day = parsedXpTotal;
                    profileData.xp_today = 0;
                } else {
                    if (!profileData.xp_start_day || profileData.xp_start_day === 0) profileData.xp_start_day = parsedXpTotal;
                    profileData.xp_today = parsedXpTotal - profileData.xp_start_day;
                }
                
                profileData.xp_total = parsedXpTotal;
                profileData.last_xp_update = Date.now();
            }

            this.db.saveProfile(profileData);
            console.log(`👤 [${profileData.nickname}] Профиль успешно просканирован!`);
        } catch (e) {
            console.error(`❌ Ошибка сканирования профиля для ${this.username}:`, e);
        }
    }
}

module.exports = ProfileScanner;