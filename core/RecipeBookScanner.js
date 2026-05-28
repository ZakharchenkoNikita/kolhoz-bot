class RecipeBookScanner {
    constructor(client, db, username) {
        this.client = client;
        this.db = db;
        this.username = username;
    }

    async scan() {
        console.log(`📖 [${this.username}] Сканируем Книгу Рецептов...`);
        let recipeBook = {};
        let currentUrl = '/user/recipebook';
        let hasNextPage = true;

        while (hasNextPage) {
            let $ = await this.client.fetchHtml(currentUrl);
            if (!$) {
                console.log(`❌ [${this.username}] Ошибка загрузки Книги Рецептов.`);
                break;
            }

            // Парсим рецепты по четкой HTML-структуре
            $('h3').each((i, el) => {
                let recipeName = $(el).text().trim();
                
                // Ищем цифру мастерства в соседнем блоке
                let masteryText = $(el)
                    .next('div')
                    .find('div:contains("Кулинарное мастерство:")')
                    .find('span.title')
                    .text()
                    .trim();
                
                if (recipeName && masteryText !== '') {
                    recipeBook[recipeName] = parseInt(masteryText);
                }
            });

            // Ищем ссылку на следующую страницу
            let nextLink = null;
            $('a.pag').each((i, el) => {
                let text = $(el).text().trim();
                // Хотфикс: ищем вхождение слова "туда", игнорируя спецсимволы вроде &gt;
                if (text.includes('туда')) {
                    nextLink = $(el).attr('href');
                }
            });

            if (nextLink) {
                console.log(`➡️ [${this.username}] Найдена следующая страница, переходим...`);
                // Приводим относительную ссылку вида ./recipebook?... к нормальному /recipebook?...
                currentUrl = nextLink.replace(/^\.\//, '/');
                if (!currentUrl.startsWith('/')) {
                    currentUrl = '/' + currentUrl;
                }
                await new Promise(r => setTimeout(r, 1000)); // Защита от спама запросами
            } else {
                hasNextPage = false; // Страницы кончились, выходим из цикла
            }
        }

        console.log(`✅ [${this.username}] Книга Рецептов отсканирована. Открыто рецептов: ${Object.keys(recipeBook).length}`);
        
        // Находим ID аккаунта и сохраняем прогресс в профиль
        let accountId = this.db.getAccounts().find(a => a.username.toLowerCase() === this.username.toLowerCase())?.id;
        if (accountId) {
            this.db.saveProfile(accountId, { recipe_book: recipeBook });
            console.log(`💾 [${this.username}] Прогресс успешно сохранен в БД.`);
        }
        
        return recipeBook;
    }
}

module.exports = RecipeBookScanner;