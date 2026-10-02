# Социальный лифт

HTML5-игра для каталога игр VK Mini Apps.

- `frontend/` — игра (TypeScript, Vite, Canvas 2D)
- `backend/` — сервер (FastAPI, PostgreSQL), появится на этапе 2
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
