/**
 * Скрипт экспорта данных из SQLite (бэкенд) в JSON-файл для импорта в PWA.
 * 
 * Запуск: node scripts/export-to-pwa.js
 * Результат: data/pwa-export.json
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'pwa-export.json');

if (!fs.existsSync(DB_PATH)) {
  console.error('База данных не найдена:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

function exportData() {
  const categories = db.prepare('SELECT id, name, parent_id FROM categories ORDER BY id').all();
  const products = db.prepare('SELECT id, name, sku, price, unit, image_url, category_id, is_custom, created_at FROM products ORDER BY id').all();
  const lists = db.prepare('SELECT id, name, status, completed_at, created_at, updated_at FROM shopping_lists ORDER BY id').all();
  const listItems = db.prepare('SELECT id, list_id, product_id, quantity, note FROM list_items ORDER BY id').all();
  const favorites = db.prepare('SELECT product_id, created_at FROM favorites ORDER BY created_at').all();

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    products,
    shoppingLists: lists,
    listItems,
    favorites,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(exportData, null, 2), 'utf-8');

  console.log('Экспорт завершён!');
  console.log(`  Категории: ${categories.length}`);
  console.log(`  Товары: ${products.length}`);
  console.log(`  Списки: ${lists.length}`);
  console.log(`  Позиции в списках: ${listItems.length}`);
  console.log(`  Избранное: ${favorites.length}`);
  console.log(`  Файл: ${OUTPUT_PATH}`);
}

try {
  exportData();
} finally {
  db.close();
}
