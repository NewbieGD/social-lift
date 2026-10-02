# Социальный лифт

HTML5-игра для каталога игр VK Mini Apps.

- `frontend/` — игра (TypeScript, Vite, Canvas 2D)
- `backend/` — сервер (FastAPI, PostgreSQL, Alembic), деплой на Amvera
- `docs/` — документы для модерации

## Локальный запуск фронтенда

```bash
cd frontend
npm install
npm run dev
```

Фронтенд публикуется на GitHub Pages автоматически при каждом пуше в `main`
(см. `.github/workflows/deploy-frontend.yml`).

## Управление

- Компьютер: A/D или стрелки — движение; 1, 2, 3 — жёлтый, синий, зелёный; пробел или 4 — красный; Esc — пауза.
- Телефон: ведите пальцем по полю; кнопки цветов внизу.

Все числа баланса — в `frontend/src/core/gameConfig.ts`.

Инструкция по деплою: `docs/DEPLOY.md`. Тесты бэкенда запускаются в GitHub Actions при каждом пуше в `backend/`.

## Документы

- `docs/DEPLOY.md` — деплой и чек-лист перед модерацией
- `docs/COMPLIANCE.md` — соответствие правилам VK по пунктам
- `docs/TUNING.md` — баланс, отчёт бота, что настраивать
- `docs/CATALOG_ASSETS.md` — материалы для карточки, иконка и обложка в `docs/catalog/`
- `docs/USER_AGREEMENT.md`, `docs/PRIVACY_POLICY.md`, `docs/RULES_TEXT.md` — тексты (публичные страницы генерирует `npm run docs`)
