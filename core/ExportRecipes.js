const fs = require('fs');
const path = require('path');
const DBManager = require('./Database');

function exportRecipes() {
    console.log('📦 Подключаемся к базе данных...');
    const db = new DBManager();

    console.log('🔍 Извлекаем рецепты из таблицы recipes_kb...');
    const recipes = db.getAllRecipes();

    if (!recipes || recipes.length === 0) {
        console.log('❌ База рецептов пуста!');
        process.exit(1);
    }

    // Создаем путь для файла в корне проекта (на уровень выше папки core)
    const outputPath = path.join(__dirname, '../recipes_dump.json');

    console.log(`💾 Сохраняем ${recipes.length} рецептов...`);
    // Превращаем массив в красивый текст с отступами (2 пробела)
    fs.writeFileSync(outputPath, JSON.stringify(recipes, null, 2), 'utf-8');

    console.log(`✅ Готово! Файл сохранен в корне проекта: recipes_dump.json`);
    process.exit(0);
}

exportRecipes();