# Деплой на Netlify (бесплатно)

## Шаг 1: Сборка проекта

```bash
cd frontend
npm run build
```

После сборки в папке `frontend/dist/` будут все файлы для деплоя.

## Шаг 2: Регистрация на Netlify

1. Открой https://www.netlify.com/
2. Нажми **Sign up** → выбери **Email** или **GitHub**
3. Подтверди email

## Шаг 3: Деплой (2 способа)

### Способ A: Drag & Drop (самый простой)

1. Зайди в https://app.netlify.com/drop
2. Перетащи папку `dist` (из `frontend/dist/`) в область загрузки
3. Подожди 10-20 секунд
4. Получишь ссылку вида `https://random-name-12345.netlify.app`

### Способ B: Через Git (для обновлений)

1. Создай репозиторий на GitHub
2. Запушь проект:
   ```bash
   git init
   git add .
   git commit -m "initial"
   git remote add origin https://github.com/твой-username/твой-репо.git
   git push -u origin main
   ```
3. На Netlify нажми **Add new site** → **Import an existing project**
4. Выбери GitHub → свой репозиторий
5. Укажи:
   - **Build command:** `cd frontend && npm run build`
   - **Publish directory:** `frontend/dist`
6. Нажми **Deploy site**

## Шаг 4: Настройка домена

1. В панели Netlify → **Domain settings** → **Options** → **Edit site name**
2. Введи удобное имя, например: `santex-helper`
3. Ссылка станет: `https://santex-helper.netlify.app`

## Шаг 5: Проверка PWA

1. Открой ссылку в Chrome на телефоне
2. Нажми **⋮** → **Установить приложение** (или "Добавить на главный экран")
3. Приложение установится и будет работать **офлайн**
4. Теперь сервер можно выключить — всё работает из кэша

## Обновление

### Способ A (Drag & Drop):
1. Внеси изменения в код
2. `cd frontend && npm run build`
3. Зайди на https://app.netlify.com/sites/твой-сайт/deploys
4. Перетащи новую папку `dist` в область **Drag and drop a new deploy**

### Способ B (Git):
1. `git add . && git commit -m "обновление" && git push`
2. Netlify сам пересоберёт и обновит сайт

## Бесплатные лимиты Netlify

- **100 GB** трафика в месяц
- **300 минут** сборки в месяц
- **Безлимит** сайтов
- **HTTPS** автоматически
- **Без рекламы**
