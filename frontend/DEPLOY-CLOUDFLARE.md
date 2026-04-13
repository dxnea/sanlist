# Cloudflare Pages — деплой PWA

## Способ 1: Через Git (рекомендуется)

1. **Создайте репозиторий на GitHub/GitLab** (если ещё нет):
   ```bash
   cd frontend
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-username/santex-pwa.git
   git push -u origin main
   ```

2. **Зайдите на [dash.cloudflare.com](https://dash.cloudflare.com)** → Workers & Pages → Create → Pages

3. **Подключите репозиторий** → выберите проект

4. **Настройки билда:**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend` (если репозиторий содержит и backend)

5. **Deploy!** — Cloudflare автоматически соберёт и задеплоит

## Способ 2: Через Wrangler CLI

```bash
# Установите Wrangler
npm install -g wrangler

# Авторизуйтесь
wrangler login

# Задеплойте
cd frontend
wrangler pages deploy dist
```

## Способ 3: Прямая загрузка dist/

1. Зайдите на [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages
2. Create → Pages → Upload assets
3. Загрузите папку `frontend/dist/`

## После деплоя

- Получите домен вида `santex-pwa.pages.dev`
- Можно привязать свой домен в настройках проекта
- HTTPS включён автоматически
- Кэширование через Cloudflare CDN

## Обновление

- **Git:** `git push` → автоматический деплой
- **Wrangler:** `wrangler pages deploy dist`
- **Upload:** загрузить новый `dist/` через панель
