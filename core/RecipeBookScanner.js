// ─── Константы ────────────────────────────────────────────────────────────────

const SCAN_DELAY_MS   = 1_000;
const NEXT_PAGE_WORD  = 'туда';
const START_URL       = '/user/recipebook';

// ─── Сканер ───────────────────────────────────────────────────────────────────

class RecipeBookScanner {
    constructor(client, db, username) {
        this.client   = client;
        this.db       = db;
        this.username = username;
    }

    // ==========================================
    // 🔧 УТИЛИТЫ
    // ==========================================

    /**
     * Парсит мастерство из текста.
     * ИСПРАВЛЕНИЕ: parseInt("идеал") → NaN, теперь корректно возвращает 'MAX'.
     */
    static parseMastery(text) {
        if (!text) return 0;
        if (/Идеальный/i.test(text)) return 'MAX';
        return parseInt(text, 10) || 0;
    }

    /** Строит абсолютный URL для следующей страницы пагинации. */
    static buildNextUrl(href) {
        if (href.startsWith('./')) return '/user/' + href.slice(2);
        return href.startsWith('/') ? href : '/' + href;
    }

    // ==========================================
    // 📄 ПАРСИНГ СТРАНИЦЫ
    // ==========================================

    /**
     * Парсит рецепты с одной страницы книги рецептов.
     * ИСПРАВЛЕНИЕ: рецепты с мастерством 0 (открыты, но не готовились)
     * теперь включаются — условие masteryText !== '' убрано.
     */
    _parsePage($) {
        const recipes = {};

        $('h3').each((_, el) => {
            const name = $(el).text().trim();
            if (!name) return;

            const nextDiv = $(el).next('div');
            // Проверяем, что это структура рецепта (есть следующий div)
            if (!nextDiv.length) return;

            const masteryText = nextDiv
                .find('div:contains("Кулинарное мастерство:")')
                .find('span.title')
                .text()
                .trim();

            // Было: if (recipeName && masteryText !== '') { ... }
            // Новое: включаем все рецепты, пустой masteryText = мастерство 0
            recipes[name] = RecipeBookScanner.parseMastery(masteryText);
        });

        return recipes;
    }

    /** Ищет ссылку на следующую страницу пагинации. */
    _findNextUrl($) {
        let href = null;
        $('a.pag').each((_, el) => {
            if ($(el).text().trim().includes(NEXT_PAGE_WORD)) {
                href = $(el).attr('href');
            }
        });
        return href ? RecipeBookScanner.buildNextUrl(href) : null;
    }

    /** Находит ID аккаунта по имени пользователя. */
    _findAccountId() {
        return this.db.getAccounts()
            .find(a => a.username.toLowerCase() === this.username.toLowerCase())
            ?.id;
    }

    // ==========================================
    // 🚀 ТОЧКА ВХОДА
    // ==========================================

    async scan() {
        console.log(`📖 [${this.username}] Сканируем Книгу Рецептов...`);

        const recipeBook = {};
        let currentUrl  = START_URL;

        while (currentUrl) {
            const $ = await this.client.fetchHtml(currentUrl);
            if (!$) {
                console.log(`❌ [${this.username}] Ошибка загрузки страницы.`);
                break;
            }

            Object.assign(recipeBook, this._parsePage($));

            const nextUrl = this._findNextUrl($);
            if (nextUrl) {
                console.log(`➡️  [${this.username}] Следующая страница...`);
                await new Promise(r => setTimeout(r, SCAN_DELAY_MS));
                currentUrl = nextUrl;
            } else {
                currentUrl = null;
            }
        }

        const count = Object.keys(recipeBook).length;
        console.log(`✅ [${this.username}] Книга Рецептов отсканирована. Рецептов: ${count}`);

        const accountId = this._findAccountId();
        if (accountId) {
            this.db.saveProfile(accountId, { recipe_book: recipeBook });
            console.log(`💾 [${this.username}] Сохранено в БД.`);
        }

        return recipeBook;
    }
}

module.exports = RecipeBookScanner;