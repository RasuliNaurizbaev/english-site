# Cloudflare: как устроен сайт и как настроить деплой с нуля

> Сменился адрес сайта, имя Worker'а, проект или бакет Supabase — пошагово: [CHANGE_DOMAIN_OR_PROJECT.md](CHANGE_DOMAIN_OR_PROJECT.md).

Документ для того, кто только что сделал `git clone` и должен понять, как сайт живёт на Cloudflare, как его заново подключить,
какие нужны секреты, как проверить работу, где смотреть логи и как чинить типичные ошибки.

Связанные документы:
- `docs/SETUP_SUPABASE.md` — база аккаунтов, ключи Supabase, бакет с mp3, миграции.
- `docs/SETUP_LOCAL.md` — запуск на своём компьютере (`npm run dev`, Python-скрипты, тесты).
- `README.md` → «Деплой», «AI для новых тестов», «Лимиты»; `HANDOFF.md` → что не проверено, риски, планы.

Публичные значения, которые встречаются ниже:

| Что | Значение |
|---|---|
| Имя Worker'а | `english` |
| Адрес сайта | https://english.foryourself.workers.dev |
| Репозиторий GitHub | `RasuliNaurizbaev/english-site` (`https://github.com/RasuliNaurizbaev/english-site.git`) |
| Основной проект Supabase (сайт) | `https://rmbcltczrruvlepsmtwd.supabase.co` |
| Тестовый проект Supabase (только локально) | `llpbzemgndrsupnpbvhp` → `https://llpbzemgndrsupnpbvhp.supabase.co` |
| Публичный бакет mp3 | `mp3 audios` (адрес — `SUPABASE_AUDIO_URL` в `web/src/data/config.ts`) |

---

## Оглавление

1. [Как устроено](#1-как-устроено)
2. [Все значения: откуда взять, куда вписать](#2-все-значения-откуда-взять-куда-вписать)
3. [Настройка с нуля](#3-настройка-с-нуля)
4. [Секреты Worker'а](#4-секреты-workerа)
5. [Ветки, предпросмотр, деплой](#5-ветки-предпросмотр-деплой)
6. [Локальный запуск на движке Cloudflare (wrangler dev)](#6-локальный-запуск-на-движке-cloudflare-wrangler-dev)
7. [Проверка после деплоя (чек-лист)](#7-проверка-после-деплоя-чек-лист)
8. [Логи и диагностика](#8-логи-и-диагностика)
9. [Частые ошибки → что делать](#9-частые-ошибки--что-делать)
10. [Лимиты бесплатного плана](#10-лимиты-бесплатного-плана)
11. [Что не проверено и что запланировано](#11-что-не-проверено-и-что-запланировано)

---

## 1. Как устроено

### Хостинг: Cloudflare **Worker** со статическими файлами (не Pages)

- Сайт (Vue + Vite) собирается в `web/dist` и выкладывается как **статические файлы Worker'а** (Workers Static Assets).
- В том же Worker'е есть **код** (`web/worker/index.ts`), но он запускается **только** для адресов из `run_worker_first`
  в `web/wrangler.jsonc`: `/api/*` и `/audio/*`. Всё остальное Cloudflare отдаёт как файлы, не вызывая код
  (и такие запросы не тратят лимит «запросов к коду»).
- **Почему не Pages:** Worker — основной продукт Cloudflare, на нём удобнее держать `/api` (посредник к AI, вход, озвучка),
  а позже — базу, задачи по расписанию.
- **Почему не Cloudflare Access** для закрытия сайта: Zero Trust требует привязать банковскую карту даже на бесплатном тарифе.
  Поэтому вход сделан своим кодом (`/api/login`).

### Схема

```
                         ┌──────────────────────────────────────────────────────────────┐
 Браузер ──────────────▶ │ Cloudflare: Worker english                 │
  (сайт, iPhone, Mac)    │                                                              │
                         │  /, /assets/*, /data/*, index.html …  → статические файлы    │
                         │                                         (web/dist, без кода)  │
                         │                                                              │
                         │  /api/*   → web/worker/api.ts  ──┬──▶ Google Gemini (AI)      │
                         │                                  ├──▶ Groq (AI, запасной)     │
                         │                                  ├──▶ Microsoft edge-tts      │
                         │                                  │    (озвучка, WebSocket)    │
                         │                                  └──▶ Supabase Postgres       │
                         │                                       (аккаунты, сессии)      │
                         │                                                              │
                         │  /audio/* → web/worker/index.ts + range.ts (Range → 206)     │
                         │             сейчас не используется — запасной вариант         │
                         └──────────────────────────────────────────────────────────────┘

 Браузер ──────────────▶ Supabase Storage, бакет «mp3 audios» (mp3 рассказов и слов — напрямую,
                         не через Cloudflare; Supabase сам отдаёт части файла, Range → 206)
```

### Что делает код Worker'а

| Файл | Что делает |
|---|---|
| `web/worker/index.ts` | Точка входа. `/audio/*` → `handleAudio`, `/api/*` → `handleApi`, остальное → `env.ASSETS.fetch` |
| `web/worker/api.ts` | Все адреса `/api/*` (таблица ниже) |
| `web/worker/accounts.ts` | Вход по имени и паролю, сессии на 30 дней, блокировка после 5 неверных паролей на 15 минут (по имени и по IP) |
| `web/worker/passwords.ts` | PBKDF2, `PBKDF2_ITERATIONS = 100_000` |
| `web/worker/auth.ts` | **Старый** вход по коду доступа (`ACCESS_CODES`), cookie `el_access` на год. Будет удалён |
| `web/worker/db/supabase.ts`, `supabaseAccounts.ts` | Запросы в Supabase (таймаут 10 с) по секретам `SUPABASE_URL`, `SUPABASE_SECRET_KEY` |
| `web/worker/range.ts` | Отдача части файла (`Range` → `206 Partial Content`) |
| `web/worker/edgeTts/` | Озвучка через edge-tts: `synthesize.ts` (WebSocket к Microsoft), `drm.ts` (токен `Sec-MS-GEC`) |

### Адреса API

| Метод и адрес | Нужен вход | Что делает |
|---|---|---|
| `GET /api/session` | нет | `{ user, role, services }` — кто вошёл и какие AI-сервисы настроены на сервере (`services` — только после входа) |
| `POST /api/login` | — | `{username, password}` — аккаунт из Supabase; или старый `{code}` — код доступа. Ставит cookie |
| `POST /api/logout` | — | Удаляет сессию и cookie |
| `POST /api/ai/complete` | да | `{ service, system, user }` → `{ text }`. Ключ AI берётся из секретов, браузер его не знает |
| `GET /api/ai/check` | да | Открыть в браузере после входа: по каждому сервису — модель и время ответа (или ошибка) |
| `POST /api/tts` | да | `{ text, voice? }` → `audio/mpeg`. Озвучка слова/фразы (до 100 символов) через edge-tts; mp3 на сервере не хранится |

**Сессия:** cookie `el_session`, 30 дней, `Path=/api; HttpOnly; SameSite=Strict`. Флаг `Secure` ставится **только по https** —
иначе Safari на `http://localhost` (wrangler dev) не отправляет cookie и вход «не держится».
Старый вход по коду — cookie `el_access` на год, те же флаги.

### Где mp3 и зачем `/audio/*`

- Сейчас mp3 берутся из **Supabase Storage** (адрес — `SUPABASE_AUDIO_URL` в `web/src/data/config.ts`) и **в сборку не входят**.
- Статические файлы Worker'а отдаются **только целиком** (`200`), а Safari на iPhone без частичной отдачи (`206`) не перематывает mp3.
  Поэтому для `/audio/*` написан свой код (`range.ts`). Он нужен **только для запасного варианта** «mp3 рядом с сайтом»:
  `npm run build:pages-with-audio` (собирает с `VITE_AUDIO_URL=audio` и копирует `../audio` → `dist/audio` скриптом `web/scripts/copy-audio.mjs`).
  mp3 нет в git, поэтому такой вариант собирается только на компьютере, где есть папка `audio/`, и выкладывается вручную (`npx wrangler deploy`).

### Файлы конфигурации

| Файл | Что в нём |
|---|---|
| `web/wrangler.jsonc` | `name` (= имя Worker'а в Cloudflare), `main: ./worker/index.ts`, `assets.directory: ./dist`, `assets.binding: ASSETS`, `run_worker_first: ["/audio/*", "/api/*"]`, `compatibility_date`, пустой `"previews": {}` |
| `web/package.json` | `build` = `vue-tsc --noEmit && vite build`; `build:pages` = `npm run build`; `build:pages-with-audio` (см. выше) |
| `web/.node-version` | `22` — версия Node для сборки на Cloudflare |
| `web/public/_headers` | Кеш: `/assets/*` — навсегда (`immutable`), `/audio/*` — неделя, `/data/*` — всегда перепроверять. Попадает в `dist/` |
| `web/src/data/config.ts` | `SUPABASE_AUDIO_URL` — откуда сайт берёт mp3 (переопределяется `VITE_AUDIO_URL` при сборке) |
| `web/.dev.vars` | Локальные секреты для `wrangler dev` (в `.gitignore`, в репозитории его нет — создать самому, раздел 6) |

> ⚠ `wrangler` **не** указан в `web/package.json`: `npx wrangler …` скачивает последнюю версию (на 2026-11-20 — 4.165.0).
> Документация Cloudflare для Previews требует Wrangler ≥ 4.135.0 и советует ставить его зависимостью проекта.
> Сейчас работает и так; если сборка веток начнёт падать из-за версии — `npm i -D wrangler` в `web/` (это отдельное изменение, не делалось).

---

## 2. Все значения: откуда взять, куда вписать

| Значение | Откуда взять | Куда вписать | Обязательно? |
|---|---|---|---|
| Аккаунт Cloudflare | https://dash.cloudflare.com/sign-up (бесплатный план, карта не нужна) | — | да |
| Поддомен `foryourself.workers.dev` | задаётся один раз при первом Worker'е в аккаунте (Workers & Pages → подпункт с subdomain; название могло измениться) | — | да |
| Доступ Cloudflare к GitHub | при импорте репозитория Cloudflare попросит установить GitHub-приложение и выбрать репозиторий `RasuliNaurizbaev/english-site` | — | да |
| Имя Worker'а | `web/wrangler.jsonc` → `name` = `english` | поле имени при создании Worker'а | да, **должно совпадать** |
| `GEMINI_API_KEY` | https://aistudio.google.com → **API keys** (прямая ссылка https://aistudio.google.com/apikey) → Create API key | секрет Worker'а; локально `web/.dev.vars` | хотя бы один из двух AI-ключей |
| `GROQ_API_KEY` | https://console.groq.com → **API Keys** (https://console.groq.com/keys) → Create API Key. **Ключ показывается один раз** — сразу сохранить в менеджер паролей | секрет Worker'а; `web/.dev.vars` | хотя бы один из двух AI-ключей |
| `SUPABASE_URL` | Supabase → **основной** проект → Project URL. Для сайта = `https://rmbcltczrruvlepsmtwd.supabase.co` | секрет Worker'а. В `web/.dev.vars` — URL **тестового** проекта `https://llpbzemgndrsupnpbvhp.supabase.co` | да (для входа по имени и паролю) |
| `SUPABASE_SECRET_KEY` | Supabase → **основной** проект → API Keys → **секретный** ключ `sb_secret_…` (**не** publishable `sb_publishable_…`). Подробно — `docs/SETUP_SUPABASE.md` | секрет Worker'а. В `web/.dev.vars` — секретный ключ **тестового** проекта | да (для входа по имени и паролю) |
| `ACCESS_CODES` | придумать самим: `имя:код, имя:код` (через запятую или с новой строки), каждый код **≥ 12 символов** (короче — игнорируются). Генерировать менеджером паролей | секрет Worker'а; `web/.dev.vars` | нет — **старый** вход, удалить, когда все перейдут на аккаунты |
| `GEMINI_MODEL` | название модели Gemini, если автовыбор плохой (сейчас автоматически выбирается `gemini-flash-lite-latest`) | переменная Worker'а типа **Text** | нет |
| `GROQ_MODEL` | название модели Groq вручную | переменная типа **Text** | нет |
| `KEYS_SECRET` | — | — | **запланировано, пока нет** (шифрование AI-ключей пользователей) |

Правила:
- Все секреты хранить в **менеджере паролей**. Cloudflare значения назад **не показывает**: `npx wrangler secret list` и панель показывают только имена.
- Потеряли значение — у сервиса создать **новый** ключ (старый удалить) и задать секрет заново (раздел 4).
- **Никогда** не вписывать ключи в код, в `wrangler.jsonc` (`vars`) или в `web/.env*`: всё, что попадает в сборку сайта, видно всем.
- Сборке (Build) переменные окружения **не нужны**. Секреты из раздела «Build variables and secrets» видны только во время сборки, коду Worker'а — нет.

---

## 3. Настройка с нуля

Ситуации: новый аккаунт Cloudflare, Worker удалён, или нужно пересоздать подключение к GitHub.

### 3.1. Подготовка (на компьютере)

```bash
git clone https://github.com/RasuliNaurizbaev/english-site.git
cd En
git checkout development
cd web
npm ci
```

Проверить, что сборка и настройки Worker'а в порядке (вход в Cloudflare не нужен, ничего не выкладывает):

```bash
cd web
npm run build:pages
npx wrangler deploy --dry-run
```

Ожидаемый конец вывода (пример от 2026-11-20):

```
 ⛅️ wrangler 4.165.0
✨ Read 35 files from the assets directory …/web/dist
Total Upload: 43.11 KiB / gzip: 13.76 KiB
Your Worker has access to the following bindings:
Binding            Resource
env.ASSETS         Assets
--dry-run: exiting now.
```

Если `Read N files` ≈ 35 — mp3 в сборку не попали (так и должно быть). Если `npm run build:pages` падает — сначала `python3 tools/build_site_data.py`
в корне репозитория (данные сайта, см. `docs/SETUP_LOCAL.md`).

### 3.2. Создать Worker из репозитория (в браузере)

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** (в документации кнопка называется **Create application**) →
   **Worker** → **Import a repository** (в документации — выбрать **GitHub**). *(Названия пунктов могли измениться.)*
2. Если просит — **авторизовать GitHub** и дать приложению Cloudflare доступ к репозиторию `RasuliNaurizbaev/english-site`
   (достаточно «Only select repositories» → `english-site`).
3. Выбрать репозиторий `RasuliNaurizbaev/english-site`.
4. Заполнить настройки:

   | Поле в Cloudflare | Значение | Почему |
   |---|---|---|
   | Project name / Worker name | `english` | должно совпадать с `name` в `web/wrangler.jsonc`, иначе `wrangler deploy` создаст/обновит **другой** Worker или сборка упадёт |
   | Production branch (в документации — **Git branch**) | `main` | деплой основного сайта только из `main` |
   | Root directory (path) | `web` | `package.json` и `wrangler.jsonc` лежат в `web/` |
   | Build command | `npm run build:pages` | типы + сборка Vite → `web/dist` |
   | Deploy command | `npx wrangler deploy` (по умолчанию) | выкладывает `dist` + код Worker'а |
   | Non-production branch deploy command (в документации — **Preview command**) | `npx wrangler preview` (по умолчанию) | предпросмотр для `development` и других веток |
   | Build variables | не нужны | — |
   | API token | оставить пустым (Cloudflare создаст сам) | — |

   Версия Node берётся из файла `web/.node-version` (`22`), т.к. Root directory = `web`. Без него Cloudflare взял бы свою версию по умолчанию (по документации сейчас 24.x).
   Можно также задать `NODE_VERSION` в Build variables — **не** делать без нужды, источником должен оставаться `.node-version`.
   Пакетный менеджер — npm (по `package-lock.json`); зависимости ставятся автоматически перед Build command.
5. **Deploy** (или **Save and Deploy**). Сборка занимает 1–3 минуты. Сайт откроется по адресу
   https://english.foryourself.workers.dev (поддомен `foryourself` — свой у каждого аккаунта; в новом аккаунте адрес будет другим —
   тогда обновите его в `README.md`, `HANDOFF.md`, шапке `web/wrangler.jsonc` и этом документе).
6. Задать **секреты** (раздел 4). До этого сайт открывается, но вход, AI и озвучка не работают.
7. Пройти **чек-лист** (раздел 7).

### 3.3. Подключить GitHub к уже существующему Worker'у

Worker → **Settings** → **Builds** (в документации встречается и **Build**) → **Connect** → выбрать репозиторий → те же поля, что в таблице выше.
Изменения настроек сборки применяются со **следующей** сборки.

### 3.4. Где потом поменять настройки сборки

Worker → **Settings** → **Build(s)**: репозиторий, ветка, Root directory, Build / Deploy / Preview command, Build variables.
После изменения — запустить новую сборку (push в ветку или **Retry build** в истории сборок).

### 3.5. Почему в `wrangler.jsonc` пустой `"previews": {}`

Без этого блока сборка **не-production веток** падала с ошибкой `wrangler preview`: missing `previews` block.
Пустой блок = «у предпросмотров те же настройки, что у основного Worker'а» (статические файлы, `run_worker_first`).
**Не удалять.** Секреты он **не** копирует (см. 5.3).

---

## 4. Секреты Worker'а

### 4.1. Список

| Имя | Тип | Значение (формат) |
|---|---|---|
| `GEMINI_API_KEY` | Secret | ключ Google AI Studio |
| `GROQ_API_KEY` | Secret | ключ Groq (`gsk_…`) |
| `SUPABASE_URL` | Secret | `https://rmbcltczrruvlepsmtwd.supabase.co` (основной проект) |
| `SUPABASE_SECRET_KEY` | Secret | `sb_secret_…` основного проекта |
| `ACCESS_CODES` | Secret | `rasul:<код ≥12 символов>, anna:<код ≥12 символов>` — старый вход |
| `GEMINI_MODEL` | Text (необязательно) | например `gemini-flash-lite-latest` |
| `GROQ_MODEL` | Text (необязательно) | например `openai/gpt-oss-120b` |

Что будет без секрета:
- нет `GEMINI_API_KEY` и `GROQ_API_KEY` → `/api/session` возвращает `services: []`, AI на сайте недоступен («ключ не задан на сервере»);
- нет `SUPABASE_URL` или `SUPABASE_SECRET_KEY` → вход по имени и паролю: «Вход по имени и паролю ещё не настроен на сервере.» (503);
- неверные `SUPABASE_*` → «База недоступна — попробуйте через минуту.» (503), подробности в логах Worker'а;
- нет `ACCESS_CODES` → вход по коду: «Неверный код доступа.» (401).

### 4.2. Способ 1 — панель Cloudflare

Workers & Pages → (Overview) → `english` → **Settings** → **Variables and Secrets** → **Add** →
Type: **Secret** (для `GEMINI_MODEL`/`GROQ_MODEL` — **Text**) → Variable name → Value → **Deploy**.

Значение вставлять **без кавычек и пробелов/переводов строки по краям** (код делает `trim()`, но лучше не рассчитывать).

### 4.3. Способ 2 — wrangler (в ОБЫЧНОМ Терминале)

> ⚠ Только в **обычном Терминале** (Terminal.app / iTerm), **не** через `!` в чате с Claude Code: `wrangler secret put` ждёт ввода значения,
> а через `!` значение не передаётся — так в секрет однажды попал неверный ключ Groq.

```bash
cd web
npx wrangler login            # один раз: откроет браузер, войти в аккаунт Cloudflare
npx wrangler whoami           # проверить, что вошли в нужный аккаунт
```

```bash
cd web
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put ACCESS_CODES
```

Каждая команда спрашивает значение (вставить, Enter). Имя Worker'а берётся из `wrangler.jsonc`, поэтому запускать **из папки `web`**.
`wrangler secret put` **сразу создаёт новую версию и выкладывает её** — отдельный деплой не нужен.

### 4.4. Проверить, какие секреты заданы

```bash
cd web
npx wrangler secret list
```

Покажет только **имена** (значения не возвращаются никогда). Проверить, что значения **правильные**, можно только по работе сайта:
- AI — после входа открыть `/api/ai/check` (раздел 7);
- Supabase — войти по имени и паролю.

### 4.5. Поменять / удалить секрет

- Поменять: тот же `npx wrangler secret put ИМЯ` (перезапишет) или в панели → секрет → **Edit** → Deploy.
- Удалить: `npx wrangler secret delete ИМЯ` или в панели. Тоже сразу выкладывает новую версию.
- Сменить ключ AI, который «засветился»: у сервиса создать новый → `secret put` → проверить `/api/ai/check` → у сервиса **удалить старый**.
- Отозвать доступ по старому коду: убрать пару `имя:код` из `ACCESS_CODES` (`secret put ACCESS_CODES` с новым списком). Cookie у человека перестанет подходить при следующем запросе.

---

## 5. Ветки, предпросмотр, деплой

### 5.1. Схема веток

```
development  ──(push)──▶  предпросмотр (npx wrangler preview), основной сайт не меняется
     │
     └── Pull Request на GitHub ──▶ проверки GitHub Actions ──▶ merge в main
                                                                  │
                                                     main ──(push)──▶  npx wrangler deploy = основной сайт
```

- Работа — в `development`. Push делает человек (у Claude Code push в этот репозиторий заблокирован).
  ```bash
  git push origin development
  ```
- Деплой основного сайта = **merge Pull Request в `main`**. Cloudflare сам соберёт и выложит.
- Откат: на GitHub сделать **Revert** PR → merge (новая сборка). Либо в панели Worker → **Deployments** → выбрать прошлую версию → откатить
  (кнопка **Rollback**; название могло измениться). Откат в панели не меняет git — следующий merge снова выложит текущий `main`.

### 5.2. Где видны сборки и ссылка предпросмотра

- История сборок и логи: Worker → **Deployments** → внизу **View build history** (хранятся 90 дней). Там же — **Retry build**.
- Ссылка предпросмотра для ветки — **в логе сборки** этой ветки и в разделе **Previews** страницы Worker'а.
  Формат адреса (по документации): `<имя-ветки>-english.foryourself.workers.dev`.

### 5.3. Секреты в предпросмотре — ⚠ НЕ проверено

По документации Cloudflare (Previews, 2026): **предпросмотры не наследуют переменные и секреты основного Worker'а** —
«Each Preview is configured with its own variables, secrets, and bindings». Вероятно, на предпросмотре вход, AI и озвучка **не работают**,
пока секреты не заданы отдельно. На практике это **не проверялось**.

Как проверить: открыть ссылку предпросмотра → `…/api/session` → войти. Если «Вход по имени и паролю ещё не настроен» — секретов нет.

Как задать (команды из `npx wrangler preview secret --help`, open beta; не запускались):

```bash
cd web
# для предпросмотра текущей ветки (имя Preview по умолчанию = имя git-ветки)
npx wrangler preview secret put SUPABASE_URL --name development
npx wrangler preview secret list --name development

# общие секреты для всех новых предпросмотров (Preview base config)
npx wrangler preview base-config secret --help
```

> Для предпросмотра лучше задать `SUPABASE_*` **тестового** проекта, а не основного, — тогда эксперименты в ветке не трогают настоящие аккаунты.
> Решения по этому пока нет.

### 5.4. Ручной деплой (только в крайнем случае)

Обычно не нужен — деплой идёт из `main`. Если Cloudflare-сборка сломана, а выложить нужно срочно (в обычном Терминале, после `wrangler login`):

```bash
cd web
npm run build:pages
npx wrangler deploy --dry-run   # проверка
npx wrangler deploy             # выкладывает то, что лежит в web/dist, — из текущей папки, а не из main!
```

Запасной вариант «mp3 рядом с сайтом» (только на компьютере с папкой `audio/`):

```bash
cd web
npm run build:pages-with-audio
npx wrangler deploy
```

После ручного деплоя следующий merge в `main` всё равно перезапишет сайт.

### 5.5. GitHub Actions

| Файл | Когда | Что делает |
|---|---|---|
| `.github/workflows/check.yml` («Проверка») | каждый push и pull request, любая ветка | `tools/validate_content.py` → `tools/build_site_data.py` → `npm ci` → Playwright Chromium → `npm run check` (типы, модульные тесты, сборка, тесты в браузере). При падении — артефакт `playwright-report` на 7 дней |
| `.github/workflows/keep-supabase-awake.yml` («Supabase: не засыпать») | пн и чт 06:17 UTC; вручную — Actions → «Supabase: не засыпать» → **Run workflow** | запрашивает 2 байта mp3 из Supabase, ждёт `206` — чтобы бесплатный проект не уснул |

Важно: **Cloudflare не ждёт GitHub Actions.** Он соберёт и выложит `main`, даже если «Проверка» красная. Поэтому мержить только зелёные PR.

Совет (не сделано): включить защиту ветки `main` — GitHub → репозиторий → **Settings** → **Branches** (или **Rules → Rulesets**) →
правило для `main`: «Require a pull request before merging» и «Require status checks to pass» → проверка `check`.

---

## 6. Локальный запуск на движке Cloudflare (wrangler dev)

Нужен, чтобы проверить `/api` (вход, AI, озвучку) до деплоя. Для обычной работы над сайтом достаточно `npm run dev` (см. `docs/SETUP_LOCAL.md`) —
там Worker'а нет.

1. Создать файл `web/.dev.vars` (он в `.gitignore`, в git не попадает). Формат — `ИМЯ=значение`, по одному на строку, те же имена, что у секретов:

   ```
   GEMINI_API_KEY=...
   GROQ_API_KEY=...
   SUPABASE_URL=https://llpbzemgndrsupnpbvhp.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   ACCESS_CODES=имя:код-не-короче-12-символов
   ```

   `SUPABASE_*` — **тестового** проекта `llpbzemgndrsupnpbvhp`, а не основного (как создать и наполнить — `docs/SETUP_SUPABASE.md`).
   Ненужные строки можно не писать — соответствующая функция просто будет «не настроена».

2. Собрать и запустить:

   ```bash
   cd web
   npm run build:pages
   npx wrangler dev
   ```

3. Открыть http://localhost:8787. Проверить: http://localhost:8787/api/session, вход, http://localhost:8787/api/ai/check.

Особенности:
- `wrangler dev` отдаёт то, что лежит в `web/dist` — после изменений сайта снова `npm run build:pages`. Код Worker'а (`web/worker/`) перезагружается сам.
- Ошибки Worker'а печатаются прямо в окне `wrangler dev` (например, строки `login: база …`, `session: база …`).
- По `http://localhost` cookie ставится **без** `Secure` — так задумано (иначе Safari не входит).
- Озвучка из `wrangler dev` ходит в Microsoft с IP вашего компьютера, поэтому её успех локально **не гарантирует** успех на Cloudflare.
- mp3 и здесь берутся из Supabase Storage (основного проекта, бакет публичный) — сборка `build:pages` их не копирует.

---

## 7. Проверка после деплоя (чек-лист)

Адрес: https://english.foryourself.workers.dev

| # | Что сделать | Ожидаемо | Если нет |
|---|---|---|---|
| 1 | Открыть сайт | главная страница, разделы открываются | лог сборки (раздел 8.1); `python3 tools/build_site_data.py` закоммичен? |
| 2 | Открыть `/api/session` | JSON вида `{"user":null,"role":null,"services":[]}` | 404/HTML вместо JSON → нет `run_worker_first` или упал код Worker'а (логи, раздел 8.2) |
| 3 | Войти: кнопка 👤 → имя и пароль | вход проходит, после перезагрузки страницы вы всё ещё вошли | раздел 9 |
| 4 | Снова `/api/session` | `user` — ваше имя, `role`, `services` — `["gemini","groq"]` (те, у кого есть ключ) | пустой `services` → нет AI-ключей |
| 5 | Рассказ 01 → ▶ mp3; нажать на предложение в середине | звук идёт, перематывается. Проверить и на iPhone (Safari) | DevTools → Network: запрос к `rmbcltczrruvlepsmtwd.supabase.co/…/mp3%20audios/…` → должен быть `206`; не отвечает — Supabase уснул (см. `docs/SETUP_SUPABASE.md`) |
| 6 | Открыть `/api/ai/check` (после входа) | по каждому сервису `model`, `modelSeconds`, `answerSeconds` | `error` в ответе — текст ошибки сервиса (неверный ключ, лимит, перегрузка) |
| 7 | Практика → Тесты → «✨ Создать тест» | тест появляется за 5–30 с | раздел 9 (524, ключи) |
| 8 | «Аудио → Мои» → «🎙 Сделать mp3» (нужны «Мои слова») | mp3 создаётся | раздел 9 (озвучка) — **на Cloudflare не проверено** |
| 9 | Выйти | `/api/session` снова `user: null` | — |

Проверка перемотки из Терминала (без входа; mp3 рассказа 01 из Supabase):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=0-1" \
  "https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/mp3%20audios/stories/01_weekend_by_the_sea/jenny.mp3"
# ожидается 206
```

```bash
curl -s https://english.foryourself.workers.dev/api/session
# ожидается {"user":null,"role":null,"services":[]}
```

---

## 8. Логи и диагностика

### 8.1. Лог сборки (почему не выложилось)

Worker → **Deployments** → **View build history** → нужная сборка → лог. Там видно: установку зависимостей, `npm run build:pages`
(ошибки TypeScript, Vite), `wrangler deploy` / `wrangler preview` и ссылку предпросмотра.

### 8.2. Логи работающего Worker'а (ошибки `/api`)

Код пишет ошибки через `console.error`, например `login: база <текст>` и `session: база <текст>`. Где смотреть:

- **В реальном времени, панель:** Workers & Pages → `english` → **Logs** → справа **Live**. Открыть, затем повторить действие на сайте.
- **Сохранённые логи (Workers Logs):** Worker → **Observability**. По документации включены по умолчанию у новых Worker'ов;
  на бесплатном плане хранятся 3 дня, до 200 000 событий в день. В `web/wrangler.jsonc` блока `observability` **нет** —
  если раздел пустой, добавить `"observability": { "enabled": true }` (изменение кода, через PR).
  *(Названия Logs / Observability / Live могли измениться; включены ли логи у этого Worker'а — не проверялось.)*
- **В Терминале** (после `wrangler login`):

  ```bash
  cd web
  npx wrangler tail --format pretty
  npx wrangler tail --format pretty --status error         # только запросы с ошибкой
  npx wrangler tail --format pretty --search "login: база" # только нужные строки
  ```

  `wrangler tail` ничего не меняет, только читает. Одновременно — не больше 10 зрителей логов.

### 8.3. Что смотреть в браузере

- DevTools → **Network**: ответ `/api/...` — статус и JSON `{"error": "..."}` с понятным текстом.
- DevTools → **Application → Cookies**: `el_session` (или старая `el_access`) с Path `/api`. Её не видно в `document.cookie` — так и должно быть (HttpOnly).

### 8.4. Что проверить в настройках

- Settings → **Variables and Secrets**: все имена на месте (раздел 4.1).
- Settings → **Build(s)**: Root directory `web`, команды из раздела 3.2, ветка `main`.
- `name` в `web/wrangler.jsonc` = имя Worker'а.

---

## 9. Частые ошибки → что делать

| Симптом | Причина | Что делать |
|---|---|---|
| Сборка веток падает: `wrangler preview`: missing `previews` block | удалён `"previews": {}` из `web/wrangler.jsonc` | вернуть пустой блок |
| Сборка падает на `vue-tsc` / `vite build` | ошибка в коде или данных | воспроизвести локально `cd web && npm run build:pages`; проверить, что `web/public/data` пересобраны (`python3 tools/build_site_data.py`) и закоммичены |
| Сборка падает на `npm ci` | `package-lock.json` не совпадает с `package.json` | локально `npm install`, закоммитить `package-lock.json` |
| Деплой ушёл в другой Worker / ошибка про имя | `name` в `wrangler.jsonc` ≠ имени Worker'а в Cloudflare | привести к `english` |
| После merge сайт не обновился | сборка упала или ещё идёт; браузер держит кеш | лог сборки (8.1); жёсткая перезагрузка (`Cmd+Shift+R`) |
| `/api/...` отдаёт HTML страницы сайта или 404 | нет `"/api/*"` в `run_worker_first` | вернуть `run_worker_first: ["/audio/*", "/api/*"]` |
| «Вход по имени и паролю ещё не настроен на сервере.» (503) | не задан `SUPABASE_URL` или `SUPABASE_SECRET_KEY` | задать секреты (раздел 4); `npx wrangler secret list` |
| «База недоступна — попробуйте через минуту.» (503 при входе) | секреты Supabase неверные (часто — вставлен publishable ключ вместо `sb_secret_…`, или URL тестового проекта); проект Supabase уснул (пауза); нет таблиц (миграции не применены) | смотреть логи Worker'а (8.2), строку `login: база …`; проверить проект в панели Supabase и миграции — `docs/SETUP_SUPABASE.md` |
| «Неверное имя или пароль.» (401) | неверный пароль или нет такого пользователя в **этой** базе (локально — тестовый проект, на сайте — основной) | проверить пользователя в нужном проекте Supabase |
| «Слишком много неверных попыток. Попробуйте через N мин.» (429) | 5 неверных паролей подряд за час — блокировка на 15 минут (по имени и по IP) | подождать |
| «Неверный код доступа.» (401) | кода нет в `ACCESS_CODES` или он короче 12 символов | проверить секрет `ACCESS_CODES` |
| Вход проходит, но после перезагрузки снова «гость» | на `http://` cookie с `Secure` не сохраняется; или `session: база …` в логах | на сайте — только https; локально — смотреть вывод `wrangler dev` |
| «Войдите: имя и пароль (или код доступа).» (401) на `/api/ai/*` или `/api/tts` | нет сессии | войти |
| AI: «Gemini: ключ не задан на сервере.» (503) | нет `GEMINI_API_KEY` (то же для Groq) | задать секрет |
| AI: 401 / 403 от сервиса | ключ неверный или отозван (было: в секрет попало неверное значение через `!` в чате) | новый ключ, `secret put` **в обычном Терминале**, проверить `/api/ai/check` |
| AI: 503 «перегружен» у Gemini | бесплатный Gemini перегружен | браузер сам переходит к Groq; при частых сбоях задать `GEMINI_MODEL` (Text) |
| **524** при создании теста | Cloudflare рвёт запрос, если ответа нет **100 с**; поэтому таймаут AI в коде — **70 с** (`COMPLETE_TIMEOUT_MS` в `web/src/data/ai/aiProvider.ts`) | не повышать таймаут ≥ 100 с; выбрать более быструю модель (`/api/ai/check` → `GEMINI_MODEL`) |
| **1102** (Worker exceeded resource limits / CPU) при входе | на бесплатном плане 10 мс CPU на запрос, а PBKDF2 со 100 000 итерациями — тяжёлый | уменьшить `PBKDF2_ITERATIONS` в `web/worker/passwords.ts` (больше 100 000 Cloudflare и не разрешает). Число итераций хранится у каждого пользователя вместе с хешем, поэтому старые пароли продолжат проверяться — но **со своими 100 000** итерациями; чтобы вход ускорился, пароли надо задать заново. **На Cloudflare не проверено**, см. раздел 10 |
| Озвучка: «Сервис озвучки не принял соединение (HTTP 403).» | Microsoft сменил схему токена `Sec-MS-GEC` у edge-tts | `pip install -U edge-tts` → перенести изменения `edge_tts/drm.py` и `constants.py` в `web/worker/edgeTts/drm.ts` (как — в шапке файла) → обновить эталоны в `drm.test.ts` → `npm test` → PR. Подробности — `HANDOFF.md` раздел 3 «Техника» |
| Озвучка: «Сервис озвучки не ответил вовремя.» / «закрыл соединение» | Microsoft не отвечает или не пускает IP Cloudflare (**не проверено**) | повторить; если стабильно — запасной путь: mp3 скриптами Python на компьютере |
| mp3 не играют, рассказы читает голос браузера | проект Supabase уснул (неделя без активности) или исчерпан трафик 5 ГБ/мес | панель Supabase → восстановить проект; GitHub → Actions → «Supabase: не засыпать» → Run workflow; `docs/SETUP_SUPABASE.md` |
| mp3 играет, но не перематывается на iPhone | хранилище отдаёт `200` вместо `206` | `curl` из раздела 7 — ожидается `206` |
| Предпросмотр ветки: вход / AI не работают | секреты в предпросмотре не заданы (раздел 5.3, не проверено) | `wrangler preview secret put … --name <ветка>` |
| `wrangler secret put` «ничего не спросил» / задал пустое | команда запущена через `!` в чате Claude Code | повторить в обычном Терминале |
| `wrangler` пишет, что не найден Worker / не тот аккаунт | `wrangler login` в другой аккаунт или запуск не из `web/` | `npx wrangler whoami`; `cd web` |

---

## 10. Лимиты бесплатного плана

Проверено 2026-11 (актуальное: https://developers.cloudflare.com/workers/platform/limits/):

| Лимит | Значение | Как касается нас |
|---|---|---|
| Запросы к коду Worker'а | 100 000 в день | считаются только `/api/*` и `/audio/*`; статические файлы не считаются |
| Процессорное время (CPU) | 10 мс на запрос | ожидание ответа Gemini/Groq/Supabase/Microsoft **не** считается. Но вход: **PBKDF2 100 000 итераций** — это чистый CPU. В `wrangler dev` вход целиком ≈ 0,5 с; **на настоящем Cloudflare не проверено** — может упереться в лимит → ошибка **1102** → уменьшить итерации |
| Время ответа | Cloudflare рвёт запрос через 100 с → **524** | таймаут AI 70 с, Supabase 10 с |
| Статические файлы | до 20 000 файлов, каждый до 25 МиБ | у нас ~35 файлов (без mp3) |
| Workers Logs | 3 дня, 200 000 событий в день | — |
| Сборки (Workers Builds) | история 90 дней | лимиты на число/время сборок — см. документацию Workers Builds (не сверялось) |

Лимиты внешних сервисов (Gemini, Groq — бесплатные квоты; Supabase — трафик 5 ГБ/мес, 1 ГБ файлов, сон после недели) — в `README.md` и `docs/SETUP_SUPABASE.md`.
**Лимита AI и озвучки на человека пока нет**: вошедший может делать запросы без ограничений в пределах квот сервисов.

---

## 11. Что не проверено и что запланировано

Не проверено:
- **Секреты в предпросмотре веток.** По документации не наследуются (5.3); на практике не проверяли.
- **Озвучка `/api/tts` на настоящем Cloudflare** — пускает ли Microsoft запросы с IP Cloudflare. Проверено только в `wrangler dev`.
- **Вход по паролю на настоящем Cloudflare и лимит CPU 10 мс** (PBKDF2 100 000 итераций, возможна ошибка 1102).
- **Workers Logs / Observability** у этого Worker'а — включены ли (блока `observability` в `wrangler.jsonc` нет).
- **mp3 из Supabase на iPhone** (перемотка в Safari) после деплоя.
- **`keep-supabase-awake.yml`** — считает ли Supabase такие запросы активностью.
- Точные названия пунктов панели Cloudflare (Create / Import a repository, Build vs Builds, Logs → Live, Observability, Rollback) — сверены с документацией на 2026-11-20, но интерфейс меняется.

Запланировано / советы:
- Удалить `ACCESS_CODES` и `web/worker/auth.ts`, когда все перейдут на аккаунты.
- Секрет `KEYS_SECRET` — шифрование AI-ключей пользователей (ещё нет).
- Защита ветки `main` на GitHub (обязательный PR и зелёная «Проверка») — не включена.
- Добавить `wrangler` в `devDependencies` `web/package.json` (стабильная версия для `wrangler preview`).
- Явно включить `"observability": { "enabled": true }` в `web/wrangler.jsonc`.
- Решить, какую базу Supabase (тестовую или основную) использовать в предпросмотрах.
- Лимит AI-запросов и озвучки на пользователя (с базой).
