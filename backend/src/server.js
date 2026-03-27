const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DB_DIR, 'app.db');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PLACEHOLDERS_DIR = path.join(UPLOADS_DIR, 'placeholders');

fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(PLACEHOLDERS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const placeholderFiles = [
  { fileName: 'pipes.svg', label: 'Трубы', color: '#8ecae6' },
  { fileName: 'fittings.svg', label: 'Фитинги', color: '#ffb703' },
  { fileName: 'mixers.svg', label: 'Смесители', color: '#90be6d' },
  { fileName: 'tools.svg', label: 'Инструменты', color: '#f28482' },
];

function createPlaceholderSvg(label, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540" viewBox="0 0 720 540">
  <rect width="720" height="540" fill="#f4f7fb"/>
  <rect x="40" y="40" width="640" height="460" rx="36" fill="${color}" fill-opacity="0.24"/>
  <circle cx="360" cy="210" r="88" fill="${color}"/>
  <text x="360" y="385" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#234">${label}</text>
</svg>`;
}

for (const item of placeholderFiles) {
  const fullPath = path.join(PLACEHOLDERS_DIR, item.fileName);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, createPlaceholderSvg(item.label, item.color), 'utf-8');
  }
}

function hasTable(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function ensureBaseSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER NULL,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT NULL,
      price REAL NULL CHECK (price IS NULL OR price >= 0),
      unit TEXT NOT NULL DEFAULT 'шт',
      image_url TEXT NULL,
      category_id INTEGER NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );
  `);
}

function migrateProductsTable() {
  if (!hasTable('products')) {
    return;
  }

  const columns = db.prepare('PRAGMA table_info(products)').all();
  const priceColumn = columns.find((column) => column.name === 'price');
  const hasUnitColumn = columns.some((column) => column.name === 'unit');
  const shouldRebuild = !priceColumn || priceColumn.notnull === 1 || !hasUnitColumn;

  if (!shouldRebuild) {
    db.prepare("UPDATE products SET price = NULL WHERE price = 0").run();
    db.prepare("UPDATE products SET unit = 'шт' WHERE unit IS NULL OR TRIM(unit) = ''").run();
    return;
  }

  db.pragma('foreign_keys = OFF');
  const trx = db.transaction(() => {
    db.exec(`
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT NULL,
        price REAL NULL CHECK (price IS NULL OR price >= 0),
        unit TEXT NOT NULL DEFAULT 'шт',
        image_url TEXT NULL,
        category_id INTEGER NOT NULL,
        is_custom INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
      );
    `);

    const hasLegacyUnit = columns.some((column) => column.name === 'unit');
    const selectUnit = hasLegacyUnit ? 'COALESCE(NULLIF(TRIM(unit), \"\"), \"шт\")' : "'шт'";

    db.exec(`
      INSERT INTO products_new (id, name, sku, price, unit, image_url, category_id, is_custom, created_at)
      SELECT
        id,
        name,
        sku,
        CASE WHEN price IS NULL OR price = 0 THEN NULL ELSE price END,
        ${selectUnit},
        image_url,
        category_id,
        is_custom,
        created_at
      FROM products;
    `);

    db.exec('DROP TABLE products;');
    db.exec('ALTER TABLE products_new RENAME TO products;');
  });

  trx();
  db.pragma('foreign_keys = ON');
}

function ensureExtendedSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      note TEXT,
      FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE (list_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (session_id, product_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_lists_session_status ON shopping_lists(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_session_id ON favorites(session_id);
  `);
}

ensureBaseSchema();
migrateProductsTable();
ensureExtendedSchema();

function ensureDefaultCategory() {
  const row = db.prepare('SELECT id FROM categories WHERE name = ? LIMIT 1').get('Без категории');
  if (row) {
    return row.id;
  }

  return db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, NULL)').run('Без категории').lastInsertRowid;
}

function seedInitialData() {
  const categoriesCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
  const productsCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  const uncategorizedId = ensureDefaultCategory();

  if (categoriesCount <= 1) {
    const insertCategory = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)');
    const pipes = insertCategory.run('Трубы', null).lastInsertRowid;
    const fittings = insertCategory.run('Фитинги', null).lastInsertRowid;
    const mixers = insertCategory.run('Смесители', null).lastInsertRowid;
    const tools = insertCategory.run('Инструменты', null).lastInsertRowid;

    insertCategory.run('ПВХ', pipes);
    insertCategory.run('Металл', pipes);
    insertCategory.run('Углы', fittings);
    insertCategory.run('Муфты', fittings);
    insertCategory.run('Для кухни', mixers);
    insertCategory.run('Для ванной', mixers);

    if (productsCount === 0) {
      const insertProduct = db.prepare(
        'INSERT INTO products (name, sku, price, unit, image_url, category_id, is_custom) VALUES (?, ?, ?, ?, ?, ?, 0)'
      );

      const imagePipes = '/uploads/placeholders/pipes.svg';
      const imageFittings = '/uploads/placeholders/fittings.svg';
      const imageMixers = '/uploads/placeholders/mixers.svg';
      const imageTools = '/uploads/placeholders/tools.svg';

      insertProduct.run('Труба ПВХ 20 мм', 'PVC-20', 120, 'м', imagePipes, pipes);
      insertProduct.run('Труба ПВХ 32 мм', 'PVC-32', 180, 'м', imagePipes, pipes);
      insertProduct.run('Металлопласт труба 16 мм', 'MP-16', 240, 'м', imagePipes, pipes);
      insertProduct.run('Угол 90° ПВХ', 'FIT-90', 65, 'шт', imageFittings, fittings);
      insertProduct.run('Муфта соединительная 20 мм', 'MFT-20', 48, 'шт', imageFittings, fittings);
      insertProduct.run('Тройник ПВХ 20 мм', 'TR-20', 80, 'шт', imageFittings, fittings);
      insertProduct.run('Смеситель для кухни хром', 'MIX-K-01', 2890, 'шт', imageMixers, mixers);
      insertProduct.run('Смеситель для ванной короткий', 'MIX-B-02', 3190, 'шт', imageMixers, mixers);
      insertProduct.run('Лента ФУМ', 'FUM-01', 95, 'шт', imageTools, tools);
      insertProduct.run('Силикон сантехнический', 'SIL-01', 390, 'шт', imageTools, tools);
      insertProduct.run('Ключ разводной 250 мм', 'KEY-250', 760, 'шт', imageTools, tools);
      insertProduct.run('Хомут металлический 1/2"', 'CLAMP-12', 44, 'шт', imageFittings, fittings);
      insertProduct.run('Прокладка резиновая 1/2"', 'GASK-12', 15, 'шт', imageFittings, uncategorizedId);
      insertProduct.run('Гибкая подводка 60 см', 'FLEX-60', 210, 'шт', imageTools, uncategorizedId);
      insertProduct.run('Монтажный комплект', 'KIT-00', null, 'компл.', imageTools, uncategorizedId);
    }
  }
}

seedInitialData();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '-');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Разрешены только JPEG, PNG, GIF'));
      return;
    }

    cb(null, true);
  },
});

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: ORIGIN }));
app.use(morgan('dev'));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

function toCategoryTree(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  const tree = [];
  for (const row of rows) {
    if (row.parent_id && map.has(row.parent_id)) {
      map.get(row.parent_id).children.push(map.get(row.id));
    } else {
      tree.push(map.get(row.id));
    }
  }

  return tree;
}

function getCategoryById(id) {
  return db.prepare('SELECT id, name, parent_id FROM categories WHERE id = ?').get(id);
}

function normalizeProduct(row) {
  return {
    ...row,
    price: row.price === null ? null : Number(row.price),
    unit: row.unit || 'шт',
    is_custom: Boolean(row.is_custom),
  };
}

function parseNullablePrice(rawPrice) {
  if (rawPrice === undefined || rawPrice === null) {
    return null;
  }

  const value = String(rawPrice).trim();
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }

  return parsed;
}

function parseQuantity(rawQuantity, fallback = 1) {
  const parsed = Number(rawQuantity ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number.NaN;
  }

  return parsed;
}

function parseUnit(rawUnit) {
  const value = String(rawUnit || '').trim();
  return value || 'шт';
}

function tryDeleteImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) {
    return;
  }

  if (imageUrl.startsWith('/uploads/placeholders/')) {
    return;
  }

  const usage = db.prepare('SELECT COUNT(*) AS count FROM products WHERE image_url = ?').get(imageUrl).count;
  if (usage > 0) {
    return;
  }

  const absolute = path.join(ROOT_DIR, imageUrl.replace(/^\/+/, ''));
  if (fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
}

function getListById(id) {
  return db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(id);
}

function getSessionListById(id, sessionId) {
  return db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND session_id = ?').get(id, sessionId);
}

function normalizeList(row) {
  return {
    ...row,
    completed_at: row.completed_at || null,
  };
}

function createList(sessionId, name = 'Новый список') {
  const result = db
    .prepare("INSERT INTO shopping_lists (session_id, name, status, completed_at) VALUES (?, ?, 'active', NULL)")
    .run(sessionId, name);

  return normalizeList(getListById(result.lastInsertRowid));
}

function serializeListItem(row) {
  return {
    id: row.id,
    list_id: row.list_id,
    product_id: row.product_id,
    quantity: Number(row.quantity),
    note: row.note || null,
    product: normalizeProduct({
      id: row.product_ref_id,
      name: row.product_name,
      sku: row.product_sku,
      price: row.product_price,
      unit: row.product_unit,
      image_url: row.product_image_url,
      category_id: row.product_category_id,
      is_custom: row.product_is_custom,
      created_at: row.product_created_at,
    }),
  };
}

function getListItems(listId) {
  const rows = db
    .prepare(`
      SELECT
        li.id,
        li.list_id,
        li.product_id,
        li.quantity,
        li.note,
        p.id AS product_ref_id,
        p.name AS product_name,
        p.sku AS product_sku,
        p.price AS product_price,
        p.unit AS product_unit,
        p.image_url AS product_image_url,
        p.category_id AS product_category_id,
        p.is_custom AS product_is_custom,
        p.created_at AS product_created_at
      FROM list_items li
      INNER JOIN products p ON p.id = li.product_id
      WHERE li.list_id = ?
      ORDER BY li.id DESC
    `)
    .all(listId);

  return rows.map(serializeListItem);
}

app.use('/api', (req, res, next) => {
  const incoming = String(req.get('X-Session-Id') || '').trim();
  const sessionId = incoming || crypto.randomUUID();
  req.sessionId = sessionId;
  res.setHeader('X-Session-Id', sessionId);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/categories', (_req, res) => {
  const rows = db
    .prepare('SELECT id, name, parent_id FROM categories ORDER BY COALESCE(parent_id, id), name')
    .all();
  res.json(toCategoryTree(rows));
});

app.post('/api/categories', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const parentId = req.body?.parent_id ? Number(req.body.parent_id) : null;

  if (!name) {
    res.status(400).json({ message: 'Название категории обязательно' });
    return;
  }

  if (parentId && !getCategoryById(parentId)) {
    res.status(400).json({ message: 'Родительская категория не найдена' });
    return;
  }

  const result = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)').run(name, parentId);
  res.status(201).json(getCategoryById(result.lastInsertRowid));
});

app.put('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = getCategoryById(id);
  if (!current) {
    res.status(404).json({ message: 'Категория не найдена' });
    return;
  }

  const name = String(req.body?.name || current.name).trim();
  const parentId = req.body?.parent_id === null || req.body?.parent_id === ''
    ? null
    : Number(req.body?.parent_id ?? current.parent_id);

  if (!name) {
    res.status(400).json({ message: 'Название категории обязательно' });
    return;
  }

  if (parentId === id) {
    res.status(400).json({ message: 'Категория не может быть родителем самой себя' });
    return;
  }

  if (parentId && !getCategoryById(parentId)) {
    res.status(400).json({ message: 'Родительская категория не найдена' });
    return;
  }

  db.prepare('UPDATE categories SET name = ?, parent_id = ? WHERE id = ?').run(name, parentId, id);
  res.json(getCategoryById(id));
});

app.delete('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const current = getCategoryById(id);
  if (!current) {
    res.status(404).json({ message: 'Категория не найдена' });
    return;
  }

  const uncategorizedId = ensureDefaultCategory();
  if (id === uncategorizedId) {
    res.status(400).json({ message: 'Нельзя удалить служебную категорию' });
    return;
  }

  const trx = db.transaction(() => {
    db.prepare('UPDATE categories SET parent_id = ? WHERE parent_id = ?').run(uncategorizedId, id);
    db.prepare('UPDATE products SET category_id = ? WHERE category_id = ?').run(uncategorizedId, id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });

  trx();
  res.status(204).send();
});

app.get('/api/products', (req, res) => {
  const search = String(req.query.search || '').trim();
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;

  let sql = `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.price,
      p.unit,
      p.image_url,
      p.category_id,
      p.is_custom,
      p.created_at,
      c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE 1 = 1
  `;

  const params = [];
  if (search) {
    sql += " AND (LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.sku, '')) LIKE ?)";
    const value = `%${search.toLowerCase()}%`;
    params.push(value, value);
  }

  if (categoryId) {
    sql += ' AND p.category_id = ?';
    params.push(categoryId);
  }

  sql += ' ORDER BY p.created_at DESC, p.id DESC';
  res.json(db.prepare(sql).all(...params).map(normalizeProduct));
});

app.post('/api/products', upload.single('image'), (req, res) => {
  const name = String(req.body?.name || '').trim();
  const sku = String(req.body?.sku || '').trim() || null;
  const price = parseNullablePrice(req.body?.price);
  const unit = parseUnit(req.body?.unit);
  const categoryId = Number(req.body?.category_id);
  const isCustom = req.body?.is_custom === 'false' ? 0 : 1;

  if (!name) {
    res.status(400).json({ message: 'Название товара обязательно' });
    return;
  }

  if (Number.isNaN(price)) {
    res.status(400).json({ message: 'Цена указана некорректно' });
    return;
  }

  if (!getCategoryById(categoryId)) {
    res.status(400).json({ message: 'Категория не найдена' });
    return;
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db
    .prepare(
      'INSERT INTO products (name, sku, price, unit, image_url, category_id, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(name, sku, price, unit, imageUrl, categoryId, isCustom);

  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(normalizeProduct(created));
});

app.put('/api/products/:id', upload.single('image'), (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) {
    res.status(404).json({ message: 'Товар не найден' });
    return;
  }

  const name = String(req.body?.name ?? current.name).trim();
  const sku = req.body?.sku === undefined ? current.sku : String(req.body.sku).trim() || null;
  const price = req.body?.price === undefined ? current.price : parseNullablePrice(req.body.price);
  const unit = req.body?.unit === undefined ? parseUnit(current.unit) : parseUnit(req.body.unit);
  const categoryId = req.body?.category_id === undefined ? current.category_id : Number(req.body.category_id);

  if (!name) {
    res.status(400).json({ message: 'Название товара обязательно' });
    return;
  }

  if (Number.isNaN(price)) {
    res.status(400).json({ message: 'Цена указана некорректно' });
    return;
  }

  if (!getCategoryById(categoryId)) {
    res.status(400).json({ message: 'Категория не найдена' });
    return;
  }

  let imageUrl = current.image_url;
  if (req.file) {
    imageUrl = `/uploads/${req.file.filename}`;
  }

  db.prepare('UPDATE products SET name = ?, sku = ?, price = ?, unit = ?, image_url = ?, category_id = ? WHERE id = ?').run(
    name,
    sku,
    price,
    unit,
    imageUrl,
    categoryId,
    id
  );

  if (req.file && current.image_url && current.image_url !== imageUrl) {
    tryDeleteImage(current.image_url);
  }

  res.json(normalizeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
});

app.delete('/api/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    res.status(404).json({ message: 'Товар не найден' });
    return;
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  tryDeleteImage(product.image_url);
  res.status(204).send();
});

app.get('/api/lists', (req, res) => {
  const status = String(req.query.status || 'active').trim();
  if (!['active', 'completed'].includes(status)) {
    res.status(400).json({ message: 'Допустимые статусы: active, completed' });
    return;
  }

  const rows = db
    .prepare(
      'SELECT * FROM shopping_lists WHERE session_id = ? AND status = ? ORDER BY CASE WHEN completed_at IS NULL THEN created_at ELSE completed_at END DESC, id DESC'
    )
    .all(req.sessionId, status)
    .map(normalizeList);

  res.json(rows);
});

app.post('/api/lists', (req, res) => {
  const name = String(req.body?.name || '').trim() || 'Новый список';
  const created = createList(req.sessionId, name);
  res.status(201).json(created);
});

app.put('/api/lists/:id', (req, res) => {
  const id = Number(req.params.id);
  const list = getSessionListById(id, req.sessionId);
  if (!list) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  const name = String(req.body?.name || '').trim();
  if (!name) {
    res.status(400).json({ message: 'Название списка обязательно' });
    return;
  }

  db.prepare('UPDATE shopping_lists SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, id);
  res.json(normalizeList(getListById(id)));
});

app.delete('/api/lists/:id', (req, res) => {
  const id = Number(req.params.id);
  const list = getSessionListById(id, req.sessionId);
  if (!list) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  const force = String(req.query.force || '').toLowerCase() === 'true';
  if (list.status === 'completed' && !force) {
    res.status(400).json({ message: 'Завершённый список можно удалить только с force=true' });
    return;
  }

  db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(id);
  res.status(204).send();
});

app.get('/api/lists/:id/items', (req, res) => {
  const id = Number(req.params.id);
  const list = getSessionListById(id, req.sessionId);
  if (!list) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  res.json(getListItems(id));
});

app.post('/api/lists/:id/items', (req, res) => {
  const listId = Number(req.params.id);
  const list = getSessionListById(listId, req.sessionId);
  if (!list) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  const productId = Number(req.body?.productId);
  const quantity = parseQuantity(req.body?.quantity, 1);
  const note = req.body?.note === undefined ? null : String(req.body.note).trim() || null;

  if (!db.prepare('SELECT id FROM products WHERE id = ?').get(productId)) {
    res.status(400).json({ message: 'Товар не найден' });
    return;
  }

  if (Number.isNaN(quantity)) {
    res.status(400).json({ message: 'Количество указано некорректно' });
    return;
  }

  const existing = db
    .prepare('SELECT id, quantity, note FROM list_items WHERE list_id = ? AND product_id = ?')
    .get(listId, productId);

  if (existing) {
    db.prepare('UPDATE list_items SET quantity = ?, note = ? WHERE id = ?').run(
      Number(existing.quantity) + quantity,
      note ?? existing.note,
      existing.id
    );
  } else {
    db.prepare('INSERT INTO list_items (list_id, product_id, quantity, note) VALUES (?, ?, ?, ?)').run(
      listId,
      productId,
      quantity,
      note
    );
  }

  db.prepare('UPDATE shopping_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(listId);
  res.status(201).json(getListItems(listId));
});

app.put('/api/lists/:id/items/:itemId', (req, res) => {
  const listId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const list = getSessionListById(listId, req.sessionId);
  if (!list) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  const current = db.prepare('SELECT * FROM list_items WHERE id = ? AND list_id = ?').get(itemId, listId);
  if (!current) {
    res.status(404).json({ message: 'Позиция не найдена' });
    return;
  }

  const quantity = req.body?.quantity === undefined ? Number(current.quantity) : parseQuantity(req.body.quantity, current.quantity);
  const note = req.body?.note === undefined ? current.note : String(req.body.note || '').trim() || null;

  if (Number.isNaN(quantity)) {
    res.status(400).json({ message: 'Количество указано некорректно' });
    return;
  }

  db.prepare('UPDATE list_items SET quantity = ?, note = ? WHERE id = ?').run(quantity, note, itemId);
  db.prepare('UPDATE shopping_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(listId);
  res.json(getListItems(listId));
});

app.delete('/api/lists/:id/items/:itemId', (req, res) => {
  const listId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const list = getSessionListById(listId, req.sessionId);
  if (!list) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  db.prepare('DELETE FROM list_items WHERE id = ? AND list_id = ?').run(itemId, listId);
  db.prepare('UPDATE shopping_lists SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(listId);
  res.status(204).send();
});

app.post('/api/lists/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const list = getSessionListById(id, req.sessionId);
  if (!list) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  if (list.status !== 'active') {
    res.status(400).json({ message: 'Завершить можно только активный список' });
    return;
  }

  db.prepare(
    "UPDATE shopping_lists SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(id);

  const activeList = createList(req.sessionId, 'Новый список');
  res.json({ completedList: normalizeList(getListById(id)), activeList });
});

app.post('/api/lists/:id/restore', (req, res) => {
  const id = Number(req.params.id);
  const source = getSessionListById(id, req.sessionId);
  if (!source) {
    res.status(404).json({ message: 'Список не найден' });
    return;
  }

  if (source.status !== 'completed') {
    res.status(400).json({ message: 'Восстановить можно только завершённый список' });
    return;
  }

  const restored = db.transaction(() => {
    const list = createList(req.sessionId, `${source.name} (повтор)`);
    const rows = db.prepare('SELECT product_id, quantity, note FROM list_items WHERE list_id = ?').all(id);
    const insertItem = db.prepare('INSERT INTO list_items (list_id, product_id, quantity, note) VALUES (?, ?, ?, ?)');

    rows.forEach((item) => {
      insertItem.run(list.id, item.product_id, item.quantity, item.note);
    });

    return list;
  });

  const newList = restored();
  res.status(201).json({ list: newList, items: getListItems(newList.id) });
});

app.get('/api/favorites', (req, res) => {
  const rows = db
    .prepare('SELECT product_id FROM favorites WHERE session_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.sessionId);
  res.json(rows.map((row) => Number(row.product_id)));
});

app.post('/api/favorites', (req, res) => {
  const productId = Number(req.body?.productId);
  if (!db.prepare('SELECT id FROM products WHERE id = ?').get(productId)) {
    res.status(400).json({ message: 'Товар не найден' });
    return;
  }

  db.prepare('INSERT OR IGNORE INTO favorites (session_id, product_id) VALUES (?, ?)').run(req.sessionId, productId);
  res.status(201).json({ ok: true });
});

app.delete('/api/favorites/:productId', (req, res) => {
  const productId = Number(req.params.productId);
  db.prepare('DELETE FROM favorites WHERE session_id = ? AND product_id = ?').run(req.sessionId, productId);
  res.status(204).send();
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'Некорректный JSON в теле запроса' });
    return;
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({ message: error.message });
    return;
  }

  if (error?.message?.includes('JPEG') || error?.message?.includes('PNG') || error?.message?.includes('GIF')) {
    res.status(400).json({ message: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`API запущен на http://localhost:${PORT}`);
});
