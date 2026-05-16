const cheerio = require('cheerio');

class GameClient {
    constructor() {
        this.baseUrl = 'https://sadovnik.mobi';
        this.cookies = new Map();
    }

    getCookieString() {
        return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    parseCookies(headers) {
        if (typeof headers.getSetCookie === 'function') {
            const cookieArray = headers.getSetCookie();
            for (const str of cookieArray) {
                const parts = str.split(';');
                const mainPart = parts[0].trim();
                const eqIdx = mainPart.indexOf('=');
                if (eqIdx > 0) {
                    this.cookies.set(mainPart.substring(0, eqIdx).trim(), mainPart.substring(eqIdx + 1).trim());
                }
            }
        }
    }

    async request(url, options = {}, redirectCount = 0) {
        if (redirectCount > 5) {
            console.warn(`⚠️ [Network] Обнаружен бесконечный редирект на ссылке: ${url}. Разрываю соединение!`);
            return null; 
        }

        const fullUrl = url.startsWith('http') ? url : this.baseUrl + (url.startsWith('/') ? url : '/' + url);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const reqOptions = {
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cookie': this.getCookieString(),
                ...(options.headers || {})
            },
            redirect: 'manual',
            body: options.body,
            signal: controller.signal
        };

        try {
            const res = await fetch(fullUrl, reqOptions);
            clearTimeout(timeoutId);
            this.parseCookies(res.headers);

            if (res.status >= 300 && res.status < 400) {
                const redirectUrl = res.headers.get('location');
                if (redirectUrl) {
                    return await this.request(redirectUrl, { method: 'GET' }, redirectCount + 1);
                }
            }
            return res;
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    }

    async fetchHtml(url) {
        try {
            const response = await this.request(url);
            if (!response) return null;

            if (response.status >= 500) {
                console.warn(`[Network] Ошибка сервера ${response.status}. Ждем...`);
                return null;
            }

            const text = await response.text();

            // 🛡️ ГЛОБАЛЬНЫЙ ЩИТ ОТ АНТИ-СПАМА И СТИРАНИЯ БАЗЫ
            if (text.includes('Пожалуйста дождитесь обработки') || text.includes('Слишком частые')) {
                return null; 
            }

            return cheerio.load(text);
        } catch (error) {
            if (error.name === 'AbortError') return null;
            console.error(`[Network] Ошибка при запросе к ${url}:`, error.message);
            return null;
        }
    }

    async login(username, password) {
        console.log(`⏳ Пробуем залогиниться как ${username}...`);
        try {
            const $ = await this.fetchHtml('/'); 
            if (!$) return false;

            const formAction = $('form').attr('action');
            if (!formAction) {
                const text = $.text().toLowerCase();
                if (text.includes('выход') || text.includes('грядки')) {
                    console.log('✅ Уже авторизованы!');
                    return true;
                }
                console.log('❌ Ошибка: не нашли форму авторизации на странице.');
                return false;
            }

            const submitUrl = formAction.replace(/^\.\//, '/');
            const params = new URLSearchParams();
            params.append('login', username);
            params.append('password', password);
            
            $('form input[type="hidden"]').each((i, el) => {
                params.append($(el).attr('name'), $(el).val() || '');
            });

            await this.request(submitUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });

            const check$ = await this.fetchHtml('/myfarm');
            if (!check$) return false;

            const checkText = check$.text().toLowerCase();
            if (checkText.includes('выход') || checkText.includes('грядки')) {
                console.log('✅ Авторизация успешна!');
                return true;
            }
            
            console.log('❌ Не удалось войти. Проверь логин/пароль.');
            return false;
            
        } catch (error) {
            console.error('❌ Ошибка при логине:', error.message);
            return false;
        }
    }
}

module.exports = GameClient;