# wrapper_Kt12345

Тестовое задание: работа с рекламным трекером **Keitaro** через Admin API.

Приложение умеет:

1. **Создавать кампании** («создаватор») — по названию, гео-коду страны и ID оффера создаёт кампанию с двумя потоками:
   - первый поток ловит трафик из указанной страны и редиректит на Google;
   - второй поток редиректит на выбранный оффер.
   - Домен, группа и источник настраиваются (подтягиваются из Keitaro API).
2. **Редактировать кампании** — добавлять/удалять офферы в кампании, с корректным пересчётом долей трафика (сумма всегда 100%).

## Стек

- **Backend**: FastAPI + SQLAlchemy + Alembic (миграции)
- **Frontend**: React (Vite)
- **БД**: PostgreSQL
- **Запуск**: Docker Compose

## Структура

```
adrobot/
├── backend/            # FastAPI-приложение
│   ├── app/
│   │   ├── main.py     # точка входа
│   │   ├── config.py   # настройки из env
│   │   ├── models.py   # SQLAlchemy-модели
│   │   ├── keitaro.py  # клиент Keitaro Admin API
│   │   ├── services.py # бизнес-логика
│   │   └── routers/    # HTTP-роуты
│   ├── alembic/        # миграции
│   └── Dockerfile
├── frontend/           # React-приложение
│   ├── src/
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Как получить API-ключ Keitaro

Ключ лежит в админке Keitaro:

1. Зайдите в админку (`https://tlgk.host/admin`).
2. Нажмите на иконку аккаунта (правый верхний угол) → **Account → API keys**.
3. Нажмите **Create API key** и скопируйте полученный ключ.

## Запуск через Docker

1. Создайте `.env` из примера:

   ```bash
   cp .env.example .env
   ```

2. Вставьте API-ключ Keitaro в `.env`:

   ```dotenv
   KEITARO_API_KEY=ваш_ключ
   ```

3. Соберите и запустите:

   ```bash
   docker compose up --build
   ```

4. Откройте приложение:

   - Frontend: http://localhost:8080
   - Swagger API: http://localhost:8000/docs

## Безопасность

- **Rate limiting.**
  - На уровне nginx (edge): API — `10 req/s` с burst 20, статический интерфейс — `30 req/s` с burst 60. При превышении лимита nginx возвращает `429`.
  - На уровне backend дополнительно работает in-memory скользящее окно на 60 секунд. Лимит задаётся переменной `RATE_LIMIT_PER_MINUTE` (по умолчанию 120 запросов в минуту с одного IP), внешних зависимостей не требует. В нормальных ответах есть заголовки `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, при блокировке — `Retry-After`.
  - `/health` и CORS preflight (`OPTIONS`) не лимитируются, чтобы мониторинг и браузерные запросы не ломались.
- **Заголовки безопасности** выставляются и nginx, и backend'ом: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`. Для статики nginx добавляет `Content-Security-Policy`, ответы API помечаются `Cache-Control: no-store`.
- **CORS:** разрешены только origins из `CORS_ALLOW_ORIGINS` (по умолчанию `http://localhost:8080` и `http://localhost:5173`). Значение `*` допустимо только для разработки — в этом случае `allow_credentials` автоматически отключается.
- **Сеть:** в `docker-compose.yml` порт бэкенда `8000` привязан к `127.0.0.1`, наружу доступен только frontend `:8080`. Для продакшена terminate TLS и заголовок `Strict-Transport-Security` следует добавить на reverse proxy (на локальном HTTP они не нужны).
- In-memory лимит работает в рамках одного процесса. Если появится несколько воркеров или инстансов backend, лимит нужно вынести в общий store (например, Redis).

Для локального запуска эти настройки задаются в `.env` (см. `.env.example`):
`RATE_LIMIT_PER_MINUTE` и `CORS_ALLOW_ORIGINS`.

## Миграции

Миграции применяются автоматически при старте backend-контейнера
(`alembic upgrade head` выполняется в `CMD` Dockerfile).

Применить миграции вручную:

```bash
cd backend
alembic upgrade head
```

Создать новую миграцию после изменения моделей:

```bash
cd backend
alembic revision --autogenerate -m "описание"
```

## Локальная разработка (без Docker)

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://adrobot:adrobot@localhost:5432/adrobot
export KEITARO_API_KEY=ваш_ключ
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Vite-сервер проксирует `/api` на `http://localhost:8000`.

## Основные эндпоинты API

| Метод | Путь | Описание |
| --- | --- | --- |
| `POST` | `/api/campaigns` | Создать кампанию (2 потока) |
| `GET` | `/api/campaigns` | Список созданных кампаний |
| `GET` | `/api/campaigns/{id}/offers` | Офферы в кампании |
| `POST` | `/api/campaigns/{id}/offers` | Добавить оффер |
| `DELETE` | `/api/campaigns/{id}/offers/{offer_id}` | Удалить оффер |
| `POST` | `/api/campaigns/{id}/offers/export` | Применить список офферов к Keitaro |
| `POST` | `/api/campaigns/{id}/import` | Импортировать кампанию из Keitaro (обновить или создать локальную запись) |
| `GET` | `/api/offers` | Список офферов Keitaro |
| `GET` | `/api/reference/domains` | Домены |
| `GET` | `/api/reference/groups` | Группы |
| `GET` | `/api/reference/traffic-sources` | Источники |
| `GET` | `/api/keitaro/campaigns?q=` | Поиск кампаний Keitaro по названию/alias/ID (фильтрация локально, до 20 результатов) |

В `POST /api/campaigns/{id}/offers/export` у каждого оффера можно передать `pinned: true`. Такая доля не пересчитывается: остаток распределяется только между незафиксированными офферами.

## Логика потоков кампании

- **Поток 1** (`schema=redirect`): фильтр `{name: country, mode: accept, payload: [GEO]}`,
  редирект `https://google.com`.
- **Поток 2** (`schema=landings`, `type=default`): массив `offers: [{offer_id, share}]`.
  Офферы делят трафик по долям (`share`), сумма долей всегда равна 100%.
