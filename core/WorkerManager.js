class WorkerManager {
    constructor(client, db, username) {
        this.client = client;
        this.db = db;
        this.username = username;
    }

    // =========================================================
    // 🧱 МОДУЛЬНЫЕ МЕТОДЫ (ЛОГИЧЕСКИЕ ШАГИ)
    // =========================================================

    async hireWorker(workerId, workerType) {
        let hireUrl = `/shop/${workerType}?-1.ILinkListener-getSafeWorkerLink&0=${workerId}`;
        await this.client.fetchHtml(hireUrl);
        console.log(`⏳ [${this.username}] Ждем, пока работник дойдет...`);
        await new Promise(res => setTimeout(res, 2000));
    }

    async goToLocation(locationUrl) {
        let parsedPage = await this.client.fetchHtml(`/${locationUrl}`);
        if (parsedPage) {
            await new Promise(res => setTimeout(res, 1500));
        }
        return parsedPage;
    }

    async openPanel(parsedPage) {
        if (!parsedPage) return null;
        let openLink = parsedPage('a').filter((i, el) => (parsedPage(el).attr('href') || '').includes('BonusPanel-openLink')).first().attr('href');
        
        if (openLink) {
            let newPage = await this.client.fetchHtml(openLink.replace(/^\.\//, '/'));
            return newPage ? newPage : parsedPage; 
        }
        return parsedPage;
    }

    async fireWorker(parsedPage, fireUrlPattern = null) {
        if (!parsedPage) return { page: null, fired: false };
        let fireLink = parsedPage('a').filter((i, el) => (parsedPage(el).attr('href') || '').includes('fireWorkerLink')).first().attr('href');
        let finalFireUrl = null;

        if (fireLink) {
            finalFireUrl = fireLink.replace(/^\.\//, '/');
        } else if (fireUrlPattern) {
            let html = parsedPage.html();
            let vMatch = html.match(/\?(\d+)-/);
            if (vMatch) {
                finalFireUrl = `/${fireUrlPattern.replace('?-1', `?${vMatch[1]}`)}`;
            }
        }

        if (finalFireUrl) {
            let newPage = await this.client.fetchHtml(finalFireUrl);
            return { page: (newPage ? newPage : parsedPage), fired: true };
        }
        return { page: parsedPage, fired: false };
    }

    async hidePanel(parsedPage, fireUrlPattern = null) {
        if (!parsedPage) return null;
        let hideLink = parsedPage('a').filter((i, el) => (parsedPage(el).attr('href') || '').includes('BonusPanel-hideLink')).first().attr('href');
        let finalHideUrl = null;

        if (hideLink) {
            finalHideUrl = hideLink.replace(/^\.\//, '/');
        } else if (fireUrlPattern) {
            let html = parsedPage.html();
            let vMatch = html.match(/\?(\d+)-/);
            if (vMatch) {
                finalHideUrl = `/${fireUrlPattern.replace('?-1', `?${vMatch[1]}`).replace('fireWorkerLink', 'hideLink')}`;
            }
        }

        if (finalHideUrl) {
            let newPage = await this.client.fetchHtml(finalHideUrl);
            return newPage ? newPage : parsedPage;
        }
        return parsedPage;
    }

    // =========================================================
    // 🧹 АВАРИЙНАЯ ЗАЧИСТКА ПРИ СТАРТЕ
    // =========================================================

    async emergencyCleanup() {
        console.log(`🧹 [${this.username}] Начинаем генеральную зачистку локаций от зависших работников...`);
        const locations = ['farm', 'mypool', 'cellar'];

        for (let loc of locations) {
            try {
                let parsedPage = await this.client.fetchHtml(`/${loc}`);
                if (!parsedPage) continue;

                // 1. Пытаемся открыть панель
                parsedPage = await this.openPanel(parsedPage);
                
                // 2. Пытаемся уволить
                let fireResult = await this.fireWorker(parsedPage);
                parsedPage = fireResult.page;

                if (fireResult.fired) {
                    console.log(`🧹 [${this.username}] Аварийная зачистка: на локации '${loc}' найден и уволен зависший работник!`);
                }

                // 3. 🛡️ ГАРАНТИРОВАННО СВОРАЧИВАЕМ (даже если увольнения не было, но панель открыта)
                await this.hidePanel(parsedPage);
                await new Promise(res => setTimeout(res, 1000));
                
            } catch (e) {
                console.error(`❌ [${this.username}] Ошибка при зачистке локации ${loc}:`, e.message);
            }
        }
        console.log(`✅ [${this.username}] Генеральная зачистка завершена!`);
    }

    // =========================================================
    // 👷 ОСНОВНОЙ ЦИКЛ РАБОТЫ
    // =========================================================

    async process(workerId, workerType, locationUrl, fireUrlPattern) {
        console.log(`👷 [${this.username}] Вызываем работника на ${locationUrl}...`);
        try {
            await this.hireWorker(workerId, workerType);

            let parsedPage = await this.goToLocation(locationUrl);
            if (!parsedPage) return false;

            parsedPage = await this.openPanel(parsedPage);
            
            let fireResult = await this.fireWorker(parsedPage, fireUrlPattern);
            parsedPage = fireResult.page;

            await this.hidePanel(parsedPage, fireUrlPattern);

            // 🛡️ ЖЕСТКАЯ ПРОВЕРКА СПУСТЯ 10 СЕКУНД
            console.log(`👀 [${this.username}] Ждем 10 секунд для проверки статуса на ${locationUrl}...`);
            await new Promise(res => setTimeout(res, 10000));

            let checkPage = await this.client.fetchHtml(`/${locationUrl}`);
            if (checkPage) {
                checkPage = await this.openPanel(checkPage);
                
                let stillHasFireLink = checkPage('a').filter((i, el) => (checkPage(el).attr('href') || '').includes('fireWorkerLink')).first().attr('href');
                
                if (stillHasFireLink) {
                    console.log(`⚠️ [${this.username}] Баг сервера: работник всё еще на ${locationUrl}! Делаем контрольный выстрел...`);
                    let emergencyFire = await this.fireWorker(checkPage, fireUrlPattern);
                    checkPage = emergencyFire.page;
                }
                
                if (checkPage) {
                    await this.hidePanel(checkPage, fireUrlPattern);
                }
            }

            console.log(`✅ [${this.username}] Цикл работника на ${locationUrl} полностью завершен!`);
            return true;
        } catch (e) {
            console.error(`❌ [${this.username}] Ошибка вызова работника:`, e);
            return false;
        }
    }
}

module.exports = WorkerManager;