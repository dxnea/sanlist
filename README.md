# Сантехнический помощник

Fullstack-приложение: каталог сантехтоваров, дерево категорий, пользовательские товары, черновики списков покупок, история заказов, избранное, заметки к позициям, быстрый предпросмотр, горячие клавиши и экспорт в TXT.

## Стек

- Frontend: Vite + React + TypeScript
- Backend: Node.js + Express + SQLite (better-sqlite3)
- Upload изображений: multer (`backend/uploads`)
- Состояние frontend: Zustand + localStorage

## Новые функции

- Несколько списков (черновики) с созданием, переименованием, переключением и удалением
- История заказов: завершение активного списка и восстановление в новый активный
- Заметки к позициям списка
- Необязательная цена товара (`price: null`) и единицы измерения (`unit`, например `шт`, `м`, `компл.`)
- Дробные количества в списке (например, `2.5 м`)
- Избранные товары (звезда) + фильтр по избранному
- Быстрый предпросмотр товара с добавлением в список
- Адаптивные карточки товаров для мобильных (marketplace-style)
- Настройки вида каталога: колонки (десктоп 3/4/5, мобильные 1/2) и компактный режим
- Массовый импорт товаров из CSV/JSON с выбором стратегии дубликатов
- Виртуализированный рендер каталога (react-window) для больших наборов товаров
- Debounce поиска (300 мс) + `useDeferredValue` для снижения нагрузки при наборе
- Кэш дерева категорий на клиенте (localStorage, TTL 1 час) с автообновлением
- Быстрый режим удаления категорий (кнопка 🗑️ в блоке категорий, без лишних подтверждений)
- Изображение товара можно задать файлом или URL (приоритет у файла)
- Горячие клавиши:
  - `/` — фокус на поиск
  - `Esc` — закрытие модалок/панелей
  - `c` — открыть/закрыть список
  - `a` — открыть форму добавления товара
  - `d` — удалить активный список (с подтверждением)

## Локальный запуск

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

API: `http://localhost:4000`

> Важно: frontend использует proxy `/api` и `/uploads` на `http://localhost:4000`, поэтому backend должен быть запущен отдельно.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: `http://localhost:5173`

## Production

Нужны: Node.js 20+ и Nginx.

### 1) Сборка фронтенда

```bash
cd frontend
npm ci
npm run build
```

Готовая статика: `frontend/dist`.

### 2) Запуск backend в prod

```bash
cd backend
npm ci
set NODE_ENV=production
set PORT=4000
set CORS_ORIGIN=https://your-domain.com
npm start
```

Для Linux/macOS используйте `export` вместо `set`.

### 3) systemd (Linux)

`/etc/systemd/system/santex-backend.service`

```ini
[Unit]
Description=Santex Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/santex/backend
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=CORS_ORIGIN=https://your-domain.com
ExecStart=/usr/bin/node /opt/santex/backend/src/server.js
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable santex-backend
sudo systemctl start santex-backend
```

### 4) Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /opt/santex/frontend/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
    }
}
```

## Переменные окружения backend

- `PORT` (по умолчанию `4000`)
- `CORS_ORIGIN` (по умолчанию `http://localhost:5173`)

## API: списки и избранное

- `GET /api/lists?status=active|completed`
- `POST /api/lists`
- `PUT /api/lists/:id`
- `DELETE /api/lists/:id`
- `GET /api/lists/:id/items`
- `POST /api/lists/:id/items`
- `PUT /api/lists/:id/items/:itemId`
- `DELETE /api/lists/:id/items/:itemId`
- `POST /api/lists/:id/complete`
- `POST /api/lists/:id/restore`
- `GET /api/favorites`
- `POST /api/favorites`
- `DELETE /api/favorites/:productId`
- `POST /api/products/import` (multipart/form-data, поле `file`, `duplicateStrategy=skip|update`)

## Импорт товаров

- Откройте кнопку **«Импорт товаров»** в верхней панели.
- Поддерживаются `.csv` и `.json`.
- Поля импорта: `Название` (обязательно), `Единица измерения`, `Цена`, `Категория`, `Подкатегория`, `Путь категории`, `Изображение`.
- `Путь категории` имеет приоритет и поддерживает разделители: `/`, `\`, `>`, `→`, `|`.
- Если категории нет — она создаётся автоматически.
- Можно выбрать стратегию дубликатов по названию: пропускать или обновлять.
- После завершения показывается статистика: добавлено / обновлено / пропущено / ошибки.
- На backend импорт обрабатывается пакетами (по 500 строк в транзакции), что снижает длительные блокировки БД на больших файлах.

## Оптимизации backend

- Индексы для каталога: `idx_products_name`, `idx_products_sku`, `idx_products_name_sku`, `idx_products_category_id`, `idx_products_created_at`.
- Кэш `/api/categories` в памяти сервера с инвалидацией при изменениях категорий и после импорта.

Пример CSV-файла: `backend/sql/sample_products.csv`.

## Настройки отображения каталога

- В блоке **«Вид каталога»** можно выбрать количество колонок и включить компактный режим.
- Настройки сохраняются в `localStorage` и автоматически применяются при следующем запуске.
- На мобильных очень узких экранах (< 480px) используется 1 колонка для лучшей читаемости.

Все API-запросы поддерживают `X-Session-Id`. Если заголовок не передан, сервер сгенерирует UUID и вернёт его в ответе.

## Миграции данных

### Миграция БД (backend, при старте)

- `products.price` переведено в nullable (`REAL NULL`)
- добавлено `products.unit`
- добавлены таблицы: `shopping_lists`, `list_items`, `favorites`
- добавлены индексы под поиск и работу со списками
- legacy-значения `price = 0` приводятся к `NULL`

### Миграция старой корзины (frontend)

При первом запуске новой версии:

1. Берутся старые данные из `localStorage` ключа `santex_cart_v1`
2. Позиции переносятся в текущий активный список на сервере
3. Старый ключ удаляется
4. В `localStorage` ставится флаг завершённой миграции

