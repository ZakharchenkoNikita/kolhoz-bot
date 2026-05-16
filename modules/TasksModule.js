const BaseModule = require('../core/BaseModule');

class TasksModule extends BaseModule {
    
    // ==========================================
    // 1. АНАЛИТИК: Ищет готовые задания и их названия
    // ==========================================
    static parseTasks(parsedPage) {
        let completedTasks = [];

        parsedPage('a').each((i, el) => {
            let text = parsedPage(el).text().trim();
            
            // Ищем кнопку сбора награды
            if (text === 'Забрать награду') {
                let href = parsedPage(el).attr('href');
                
                // Поднимаемся к родительскому блоку задания и ищем название в .fl span
                let taskNameElement = parsedPage(el).parent().parent().find('.fl span').first();
                let taskName = taskNameElement.length > 0 ? taskNameElement.text().trim() : "Неизвестное задание";

                if (href) {
                    completedTasks.push({
                        name: taskName,
                        url: href.replace(/^\.\//, '/')
                    });
                }
            }
        });

        return completedTasks;
    }

    // ==========================================
    // 2. СБОРЩИК: Автономный цикл сбора с обновлением страницы
    // ==========================================
    static async collectRewards(client, username) {
        let collectedCount = 0;

        while (true) {
            // 1. Скачиваем свежую версию страницы
            let parsedPage = await client.fetchHtml('/tasks');
            if (!parsedPage) break;

            // 2. Парсим свежий список заданий
            let tasks = this.parseTasks(parsedPage);

            // 3. Если кнопок больше нет - выходим из цикла
            if (tasks.length === 0) break;

            // 4. Всегда берем только ПЕРВОЕ задание из свежего списка
            let task = tasks[0];
            console.log(`🎁 [${username}] Забираем награду за задание: "${task.name}"...`);
            
            await client.fetchHtml(task.url);
            collectedCount++;
            
            // Умная пауза от 1 до 2 секунд перед следующим запросом
            let delay = Math.floor(Math.random() * 1000) + 1000;
            await new Promise(res => setTimeout(res, delay));
        }

        return collectedCount;
    }

    // ==========================================
    // 3. ДИРИЖЕР: Главная точка входа
    // ==========================================
    static async execute(client, db, workers) {
        const username = (workers && workers.username) ? workers.username : 'Бот';
        
        let parsedPage = await client.fetchHtml('/tasks');
        if (!parsedPage) return;

        // Получаем первичный список просто для статистики и лога
        let tasksToCollect = this.parseTasks(parsedPage);

        if (tasksToCollect.length > 0) {
            console.log(`\n📋 [${username}] Найдено выполненных заданий: ${tasksToCollect.length}.`);
            
            // Запускаем умного автономного сборщика
            await this.collectRewards(client, username);
            
            console.log(`✅ [${username}] Все доступные награды за задания успешно собраны!\n`);
        } else {
            console.log(`📋 [${username}] Выполненных заданий пока нет.`);
        }

        // Засыпаем ровно на 60 минут (3600000 мс)
        db.saveTimer('kb_tasks_timer', Date.now() + 3600000);
    }
}

module.exports = TasksModule;