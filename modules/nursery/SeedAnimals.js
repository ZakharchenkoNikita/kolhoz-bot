/**
 * База данных животных Питомника.
 * timeMin - время роста в минутах (нужно для расчета правила 50%)
 * reqPoints - количество очков Питомника, необходимое для открытия животного
 * kpd - очки в минуту
 */
const AnimalData = {
    "Шелкопряд": { name: "Шелкопряд", points: 1, timeMin: 10, kpd: 0.1, reqPoints: 0 },
    "Курица": { name: "Курица", points: 2, timeMin: 20, kpd: 0.1, reqPoints: 0 },
    "Корова": { name: "Корова", points: 3, timeMin: 25, kpd: 0.12, reqPoints: 0 },
    "Овечка": { name: "Овечка", points: 4, timeMin: 30, kpd: 0.13, reqPoints: 0 },
    "Гусыня": { name: "Гусыня", points: 5, timeMin: 35, kpd: 0.14, reqPoints: 0 },
    "Пчела": { name: "Пчела", points: 6, timeMin: 40, kpd: 0.15, reqPoints: 0 },
    "Перепелка": { name: "Перепелка", points: 7, timeMin: 45, kpd: 0.15, reqPoints: 0 },
    "Шиншилла": { name: "Шиншилла", points: 8, timeMin: 50, kpd: 0.16, reqPoints: 0 },
    "Коконопряд": { name: "Коконопряд", points: 9, timeMin: 55, kpd: 0.16, reqPoints: 0 },
    "Крокодил": { name: "Крокодил", points: 10, timeMin: 60, kpd: 0.16, reqPoints: 0 },
    "Марал": { name: "Марал", points: 11, timeMin: 55, kpd: 0.2, reqPoints: 110 },
    "Лебедь": { name: "Лебедь", points: 14, timeMin: 70, kpd: 0.2, reqPoints: 250 },
    "Фламинго": { name: "Фламинго", points: 17, timeMin: 85, kpd: 0.2, reqPoints: 420 },
    "Бобер": { name: "Бобер", points: 20, timeMin: 100, kpd: 0.2, reqPoints: 620 },
    "Панда": { name: "Панда", points: 23, timeMin: 115, kpd: 0.2, reqPoints: 850 },
    "Страус": { name: "Страус", points: 26, timeMin: 130, kpd: 0.2, reqPoints: 1110 },
    "Рысь": { name: "Рысь", points: 29, timeMin: 145, kpd: 0.2, reqPoints: 1400 },
    "Павлин": { name: "Павлин", points: 32, timeMin: 160, kpd: 0.2, reqPoints: 1720 },
    "Лиса": { name: "Лиса", points: 35, timeMin: 175, kpd: 0.2, reqPoints: 2070 },
    "Сокол": { name: "Сокол", points: 38, timeMin: 190, kpd: 0.2, reqPoints: 2450 },
    "Лев": { name: "Лев", points: 45, timeMin: 180, kpd: 0.25, reqPoints: 2900 },
    "Индюк": { name: "Индюк", points: 50, timeMin: 200, kpd: 0.25, reqPoints: 3400 },
    "Свинья": { name: "Свинья", points: 55, timeMin: 220, kpd: 0.25, reqPoints: 3950 },
    "Голубь": { name: "Голубь", points: 60, timeMin: 240, kpd: 0.25, reqPoints: 4550 },
    "Лошадь": { name: "Лошадь", points: 65, timeMin: 260, kpd: 0.25, reqPoints: 5200 },
    "Аист": { name: "Аист", points: 70, timeMin: 280, kpd: 0.25, reqPoints: 5900 },
    "Белка": { name: "Белка", points: 75, timeMin: 300, kpd: 0.25, reqPoints: 6650 },
    "Чайка": { name: "Чайка", points: 80, timeMin: 320, kpd: 0.25, reqPoints: 7450 },
    "Ёжик": { name: "Ёжик", points: 85, timeMin: 340, kpd: 0.25, reqPoints: 8300 },
    "Пеликан": { name: "Пеликан", points: 90, timeMin: 360, kpd: 0.25, reqPoints: 9200 },
    "Кенгуру": { name: "Кенгуру", points: 100, timeMin: 300, kpd: 0.33, reqPoints: 10200 },
    "Попугай": { name: "Попугай", points: 110, timeMin: 330, kpd: 0.33, reqPoints: 11300 },
    "Кролик": { name: "Кролик", points: 120, timeMin: 360, kpd: 0.33, reqPoints: 12500 },
    "Сова": { name: "Сова", points: 130, timeMin: 390, kpd: 0.33, reqPoints: 13800 },
    "Мандаринка": { name: "Мандаринка", points: 140, timeMin: 420, kpd: 0.33, reqPoints: 15200 },
    "Верблюд": { name: "Верблюд", points: 150, timeMin: 450, kpd: 0.33, reqPoints: 16700 },
    "Канарейка": { name: "Канарейка", points: 160, timeMin: 480, kpd: 0.33, reqPoints: 18300 },
    "Коза": { name: "Коза", points: 170, timeMin: 510, kpd: 0.33, reqPoints: 20000 },
    "Утка": { name: "Утка", points: 180, timeMin: 540, kpd: 0.33, reqPoints: 21800 },
    "Норка": { name: "Норка", points: 190, timeMin: 570, kpd: 0.33, reqPoints: 23700 },
    "Паук": { name: "Паук", points: 210, timeMin: 420, kpd: 0.5, reqPoints: 25800 },
    "Улитка": { name: "Улитка", points: 240, timeMin: 480, kpd: 0.5, reqPoints: 28200 },
    "Черепаха": { name: "Черепаха", points: 270, timeMin: 540, kpd: 0.5, reqPoints: 30900 },
    "Питон": { name: "Питон", points: 300, timeMin: 600, kpd: 0.5, reqPoints: 33900 },
    "Янтарка": { name: "Янтарка", points: 330, timeMin: 660, kpd: 0.5, reqPoints: 37200 },
    "Зебра": { name: "Зебра", points: 360, timeMin: 720, kpd: 0.5, reqPoints: 40800 }
};

/**
 * Словарь для распознавания животных по картинкам.
 * Позволяет Рукам мгновенно переводить ссылку вида "cow_new.jpg" в "Корова".
 */
const ImageToNameMap = {
    "shelkopryad": "Шелкопряд", "chicken_new": "Курица", "cow_new": "Корова", "lamb_new": "Овечка",
    "gus_new": "Гусыня", "pchela2": "Пчела", "perepelka": "Перепелка", "shinshilla": "Шиншилла",
    "kokonopryad": "Коконопряд", "krokodil": "Крокодил", "maral": "Марал", "lebed": "Лебедь",
    "flamingo": "Фламинго", "beaver": "Бобер", "panda": "Панда", "straus": "Страус", "rys": "Рысь",
    "pavlin": "Павлин", "lisa": "Лиса", "sokol": "Сокол", "lev": "Лев", "induk": "Индюк",
    "svinka": "Свинья", "svinja": "Свинья", "golub": "Голубь", "loshad": "Лошадь", "aist": "Аист",
    "belka": "Белка", "chayka": "Чайка", "ezh": "Ёжик", "ezhik": "Ёжик", "pelikan": "Пеликан",
    "kenguru": "Кенгуру", "popugai": "Попугай", "krolik": "Кролик", "zajac": "Кролик", "sova": "Сова",
    "mandarinka": "Мандаринка", "camel": "Верблюд", "kanareyka": "Канарейка", "kanarejka": "Канарейка",
    "koza": "Коза", "utka": "Утка", "norka": "Норка", "pauk": "Паук", "ulitka": "Улитка",
    "cherepakha": "Черепаха", "piton": "Питон", "yantarka": "Янтарка", "zebra": "Зебра"
};

class SeedAnimals {
    /**
     * Получить все характеристики животного по его имени.
     */
    static get(name) {
        return AnimalData[name] || null;
    }

    /**
     * Опознать животное по названию файла картинки (например, 'kenguru' -> 'Кенгуру').
     */
    static getNameByImage(imageFileName) {
        // Убираем расширение (.jpg, .png), если оно передано
        let cleanName = imageFileName.split('.')[0].toLowerCase();
        return ImageToNameMap[cleanName] || null;
    }

    /**
     * Получить список всех животных, которые мы УЖЕ открыли на текущем уровне очков.
     * Возвращает отсортированный массив объектов (от самых жирных по очкам к самым слабым).
     */
    static getAvailableAnimals(currentPoints) {
        let available = [];
        for (let key in AnimalData) {
            if (currentPoints >= AnimalData[key].reqPoints) {
                available.push(AnimalData[key]);
            }
        }
        // Сортируем: сначала самые высокоуровневые
        return available.sort((a, b) => b.reqPoints - a.reqPoints);
    }
}

module.exports = SeedAnimals;