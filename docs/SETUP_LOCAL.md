# Локальный запуск — с нуля после `git clone`

Пошаговая инструкция для того, кто только что склонировал репозиторий: что установить, как запустить сайт
(на компьютере и с телефона), как запустить тесты, какие файлы с секретами создать и откуда взять значения,
как работать с контентом и аудио.

Проверено на macOS (Node 24, Python 3.9, Google Chrome), 2026-11-20.

---

## Содержание

0. [Что это за проект и карта документов](#0-что-это-за-проект-и-карта-документов)
1. [Что установить](#1-что-установить)
2. [Clone и первый запуск](#2-clone-и-первый-запуск)
3. [mp3 после clone](#3-mp3-после-clone)
4. [Файлы с секретами](#4-файлы-с-секретами)
5. [Запуск «как на сайте» (wrangler dev), вход, первый админ](#5-запуск-как-на-сайте-wrangler-dev-вход-первый-админ)
6. [Тесты и проверки](#6-тесты-и-проверки)
7. [Контент и аудио: типовые сценарии](#7-контент-и-аудио-типовые-сценарии)
8. [Git-процесс](#8-git-процесс)
9. [Частые проблемы при первом запуске](#9-частые-проблемы-при-первом-запуске)
10. [Чек-лист «всё работает»](#10-чек-лист-всё-работает)

---

## 0. Что это за проект и карта документов

- **Что:** личный сайт для изучения английского (A1 → B1): рассказы с аудио и караоке, интервальное повторение слов,
  грамматика с упражнениями, тесты (в т.ч. от AI), диктант, неправильные глаголы, mp3 со словами.
- **Из чего:** сайт — Vue 3 + TypeScript + Vite (`web/`); серверная часть — Cloudflare Worker (`web/worker/`: вход, AI-посредник, озвучка `/api/tts`);
  контент — CSV/JSON/TXT (`content/`), собирается Python-скриптами (`tools/`) в `web/public/data/*.json`.
- **Где хранится:** сайт — Cloudflare Worker (автодеплой из `main`); mp3 — Supabase Storage (публичный бакет);
  аккаунты — Supabase Postgres; прогресс гостя — localStorage браузера.
- **Адрес:** https://open-english-for-beginner.rasuli-naurizbaev.workers.dev
- **Репозиторий:** https://github.com/RasuliNaurizbaev/En (работа — в ветке `development`, сайт — из `main`).

| Документ | Что в нём |
|---|---|
| `README.md` | как устроен сайт, разделы, архитектура, форматы контента, все скрипты, деплой |
| `HANDOFF.md` | текущее состояние, что не доделано и не проверено, риски, планы (аккаунты, база прогресса) |
| **`docs/SETUP_LOCAL.md`** (этот файл) | установка и запуск на своём компьютере — «входная дверь» |
| `docs/SETUP_SUPABASE.md` | проекты Supabase (основной и тестовый), миграции, ключи, бакет mp3 |
| `docs/SETUP_CLOUDFLARE.md` | Worker на Cloudflare, секреты Worker'а, сборка из GitHub, предпросмотр веток |

Всё, что касается **настройки** Supabase и Cloudflare (создать проект, применить миграции, задать секреты Worker'а), — в соседних
документах. Здесь — только то, что нужно для работы на своём компьютере, и ссылки туда.

---

## 1. Что установить

| Программа | Версия | Зачем | Как проверить |
|---|---|---|---|
| **Git** | любая современная | клонировать репозиторий, ветки, PR | `git --version` |
| **Node.js** (вместе с npm) | **22** (из `web/.node-version`, так собирает Cloudflare и CI). Для `tools/create_user.ts` — **22.18+** (запускает `.ts` без сборки). У автора — 24 | сайт, сборка, тесты, `wrangler` | `node --version`, `npm --version` |
| **Python 3** | **3.9+** (у автора 3.9.6, в CI — 3.12). Для большинства скриптов pip-пакеты не нужны | сборка данных сайта, проверка контента, загрузка mp3 | `python3 --version` |
| **Google Chrome** | любая актуальная | тесты в браузере (Playwright локально запускает установленный Chrome: `channel: "chrome"` в `web/playwright.config.ts`) | открыть Chrome; на Mac: `ls "/Applications/Google Chrome.app"` |
| *edge-tts* (по желанию) | последняя | только **озвучка** новых mp3 (`make_story_audio.py`, `make_word_audio.py`) | `python3 -c "import edge_tts; print('ok')"` |
| *ffmpeg* (по желанию) | любая | только **озвучка** новых mp3 | `ffmpeg -version` |
| *Wrangler* (CLI Cloudflare) | ставится сам через `npx` | запуск «как на сайте» (`npx wrangler dev`) | `cd web && npx wrangler --version` |

Как поставить (macOS, через Homebrew — https://brew.sh):

```bash
brew install git node@22 python        # или Node через nvm / fnm / volta — версия 22.18+ (или 24)
brew install --cask google-chrome      # если Chrome ещё нет
# только если будете озвучивать новые рассказы/слова:
pip3 install edge-tts
brew install ffmpeg
```

> **Wrangler не входит в `package.json`.** Первый `npx wrangler …` скачает его из npm (спросит «Need to install the following packages: wrangler… Ok to proceed?» — ответить `y`, нужен интернет).
> **Supabase CLI** (`npx supabase …`) нужен только для миграций базы — см. `docs/SETUP_SUPABASE.md`.

Без Chrome тоже можно запустить браузерные тесты — на Chromium от Playwright (как в CI), см. [раздел 6](#6-тесты-и-проверки).

---

## 2. Clone и первый запуск

### 2.1. Склонировать и перейти в рабочую ветку

```bash
git clone https://github.com/RasuliNaurizbaev/En.git EL
cd EL
git switch development          # по умолчанию после clone открыта main; работаем в development
```

> Клонируйте **полностью** (без `--depth`): старые коммиты понадобятся, если захотите достать mp3 из истории git ([раздел 3](#3-mp3-после-clone), вариант «а»).
> Репозиторий весит около 115+ МБ именно из-за mp3 в старых коммитах.

### 2.2. Данные сайта (по желанию)

`web/public/data/*.json` уже лежат в git. Пересобрать их — безопасно (после свежего clone результат побайтно тот же, даже без mp3):

```bash
python3 tools/build_site_data.py       # из папки EL
python3 tools/validate_content.py      # «OK: тем грамматики 40, рассказов 40, тестов 4, глаголов 122 — ошибок нет»
```

После `build_site_data.py` проверьте `git status` — изменений быть не должно.

### 2.3. Библиотеки

```bash
cd web
npm ci              # ставит ровно то, что в package-lock.json (не меняет его); npm install — только если добавляете пакет
```

### 2.4. Запуск в режиме разработки

```bash
cd web              # из папки EL
npm run dev
```

Vite покажет адреса:
```
➜  Local:   http://localhost:5173/          ← на компьютере
➜  Network: http://192.168.x.x:5173/        ← на телефоне (та же сеть)
```

Откройте http://localhost:5173/ — должна открыться вкладка «Сегодня». Изменения в коде видны сразу (без перезапуска).

**Что работает в `npm run dev`, а что нет:**

| Работает | Не работает (нет Worker'а — сервера сайта) |
|---|---|
| все уроки, рассказы, слова, грамматика, тесты, диктант, глаголы | **вход** (имя + пароль, старый вход по коду) — на `#/login` сообщение «Сервер сайта недоступен (локальный запуск без Worker'а?)…» |
| прогресс (в localStorage), резервная копия в файл | **AI через сервер** (общие ключи сайта) — работает только блок «Свои ключи» в браузере |
| голос браузера (рассказы, 🔊) | **озвучка** `/api/tts` («Аудио → Мои» → «🎙 Сделать mp3», ✨ перевод через сервер) |
| mp3 — **только если они есть в папке `audio/`** (после clone их нет, см. [раздел 3](#3-mp3-после-clone)) | |

Всё вместе (вход, AI, озвучка) — [раздел 5](#5-запуск-как-на-сайте-wrangler-dev-вход-первый-админ).

### 2.5. С телефона

1. Компьютер и телефон — **в одной сети**: общий Wi-Fi или точка доступа с телефона (iPhone: Настройки → Режим модема;
   Android: Настройки → Точка доступа), к которой подключён компьютер.
2. На компьютере: `cd EL/web && npm run dev` (скрипт уже запускает Vite с `--host` — сайт виден в сети).
3. На телефоне откройте адрес из строки `Network:` (раздача с iPhone — обычно `http://172.20.10.x:5173/`, с Android/Wi-Fi — `http://192.168.x.x:5173/`).
4. По желанию: Safari → «Поделиться» → «На экран Домой».

Если не открывается — [раздел 9](#9-частые-проблемы-при-первом-запуске).

> ⚠ **Прогресс привязан к адресу.** `localhost:5173`, `192.168.x.x:5173`, `172.20.10.x:5173`, `localhost:8787` — для браузера **разные сайты** с разным прогрессом.
> Перенос: «Сегодня» → «💾 Резервная копия прогресса» → «Сохранить в файл» на старом адресе → «Загрузить из файла» на новом.
> Хранение прогресса аккаунта в базе Supabase — в работе (см. `HANDOFF.md`, раздел 5, «План: аккаунты + база прогресса»).

### 2.6. Готовая сборка (как на сервере, но без Worker'а)

```bash
cd web
npm run build       # проверка типов + сборка в web/dist/
npm run preview     # открыть сборку (http://localhost:4173/, адрес для телефона тоже покажет)
```

Сборка берёт mp3 **из Supabase** (а не из папки `audio/`) — см. [раздел 3](#3-mp3-после-clone), вариант «в». Входа, AI через сервер и озвучки здесь тоже нет.

### 2.7. Все команды `web/`

| Команда | Что делает |
|---|---|
| `npm run dev` | разработка, http://localhost:5173, доступен с телефона; mp3 из `../audio` |
| `npm run build` | `vue-tsc --noEmit` + `vite build` → `web/dist/`; mp3 — из Supabase |
| `npm run build:pages` | то же, что `build` (эту команду вызывает Cloudflare) |
| `npm run build:pages-with-audio` | запасной вариант: сборка с mp3 рядом с сайтом (`VITE_AUDIO_URL=audio` + копирование `audio/` → `dist/audio`; нужны mp3 на диске) |
| `npm run preview` | открыть собранный `web/dist/` (http://localhost:4173) |
| `npm run typecheck` | проверка типов TypeScript |
| `npm test` | модульные тесты (Vitest) |
| `npm run test:e2e` | тесты в настоящем браузере (Playwright; сам собирает сайт и запускает `vite preview` на порту 4174) |
| `npm run check` | всё вместе: типы → модульные → сборка → браузерные |
| `npx wrangler dev` | сайт + Worker локально, http://localhost:8787 (сначала `npm run build:pages`) |

---

## 3. mp3 после clone

**Как устроено (с 2026-11-20):**

- mp3 рассказов и слов (84 файла, ≈ 114 МБ) **не хранятся в git**: `audio/**/*.mp3` в `.gitignore`. Они лежат в **Supabase Storage**
  (публичный бакет `mp3 audios` основного проекта). Главная копия — папка `audio/` на компьютере автора.
- В git остались **json с таймингами** (`audio/stories/<id>/<голос>.json`, `audio/words/manifest.json`) — из них `tools/build_site_data.py`
  собирает данные сайта. Поэтому данные сайта без mp3 получаются побайтно те же (проверено).
- **Собранный сайт** (`npm run build`, Cloudflare) берёт mp3 из Supabase: адрес — `SUPABASE_AUDIO_URL` в `web/src/data/config.ts`.
- **`npm run dev`** берёт mp3 из **локальной** папки `audio/`: в `web/.env.development` записано `VITE_AUDIO_URL=/audio`, и Vite раздаёт `../audio`
  (с перемоткой; `web/vite.config.ts`).

**Следствие:** после свежего clone в `audio/` только json → в `npm run dev` **плееры mp3 пустые**, рассказы читает голос браузера,
вкладка «Аудио» не играет. Это не поломка. Три способа получить звук:

### (а) Достать mp3 из старого коммита git — mp3 будут на диске

До 2026-11-20 mp3 хранились в git. **Последний коммит, где они есть, — `80bb922`**
(«Make AI test generation reliable…», 2026-11-19; mp3 удалены из индекса следующим коммитом `4317409`). Проверить самому:

```bash
git log --oneline -- 'audio/**/*.mp3'      # 4317409 — удаление, b66d10a — добавление
git ls-tree -r --name-only 4317409^ -- audio | grep -c '\.mp3$'   # 84
```

Восстановить **только в рабочую папку** (индекс git не трогается — mp3 не попадут в следующий коммит):

```bash
git restore --source=80bb922 --worktree -- audio/
find audio -name '*.mp3' | wc -l     # 84
git status --short                   # пусто: json в 80bb922 и сейчас одинаковые, mp3 игнорируются
```

> ⚠ **Не используйте** `git checkout 80bb922 -- audio/`: эта команда кладёт файлы **и в индекс** — 84 mp3 окажутся «добавлены» (`A  audio/…mp3`),
> несмотря на `.gitignore`, и уйдут в следующий коммит. Если уже сделали так — уберите их из индекса (файлы останутся на диске):
> ```bash
> git restore --staged -- audio/
> ```
> Json с таймингами в `80bb922` такие же, как сейчас (проверено), поэтому их возвращать не нужно. Если когда-нибудь json в текущей ветке
> поменяются, после восстановления верните их из ветки: `git restore --source=HEAD -- 'audio/**/*.json'` и проверьте `git status`.
>
> ⚠ В старом коммите — **mp3 на момент 2026-11-19**. Если позже появятся новые или перезаписанные mp3 (они будут только в Supabase), этот способ их не даст.

### (б) Брать mp3 из Supabase в `npm run dev`

Адрес бакета — не секрет (он в `web/src/data/config.ts`). Самый простой способ — переменная окружения при запуске
(переменные, уже заданные в окружении, важнее файлов `.env*` у Vite):

```bash
cd web
VITE_AUDIO_URL="https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/mp3%20audios" npm run dev
```

Или постоянно — файлом `web/.env.development.local` (у Vite он важнее `web/.env.development` и действует только в `npm run dev`):

```bash
cd web
echo 'VITE_AUDIO_URL=https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/mp3%20audios' > .env.development.local
```

> `*.local` игнорируется (`web/.gitignore`, добавлено 2026-11-20) — файл не попадёт в git. Проверить: `git check-ignore -v web/.env.development.local`.
>
> Минусы: трафик идёт из Supabase (бесплатно — 5 ГБ/мес на всех) и нужен интернет; если проект Supabase уснул — mp3 не играют.

### (в) Продакшен-сборка локально

```bash
cd web
npm run build && npx vite preview --host     # http://localhost:4173 (= npm run preview)
```

Сборка без `VITE_AUDIO_URL` берёт mp3 из Supabase — как на настоящем сайте. Минус: код не обновляется на лету, после правок — пересобрать.
Так же работает `npx wrangler dev` ([раздел 5](#5-запуск-как-на-сайте-wrangler-dev-вход-первый-админ)).

> Скрипта «скачать все mp3 из Supabase в `audio/`» **пока нет** (запланирован). Для новых mp3, которых нет в старых коммитах,
> единственная полная копия — папка `audio/` на компьютере автора и бакет Supabase.

---

## 4. Файлы с секретами

Создаются **вручную**, в git **не попадают** (проверено `git check-ignore`). Значения хранятся в **менеджере паролей** владельца:
Cloudflare и Supabase сохранённые секреты **назад не показывают** (можно только задать новый). **Никогда не присылайте значения в чат
(в т.ч. Claude) и не вписывайте их в код или в `web/.env*`** — всё, что начинается с `VITE_`, попадает в открытые файлы сайта.

Два проекта Supabase (подробно — `docs/SETUP_SUPABASE.md`):

| Проект | Адрес | Для чего |
|---|---|---|
| **основной** | `https://rmbcltczrruvlepsmtwd.supabase.co` | настоящий сайт: аккаунты, бакет mp3 `mp3 audios` |
| **тестовый** (`english-test`) | `https://llpbzemgndrsupnpbvhp.supabase.co` | локальный `wrangler dev` и ветка `development`: сначала миграции и опыты здесь |

| Файл | Переменная | Что это / откуда взять | Какой проект | Обязательно? |
|---|---|---|---|---|
| `web/.dev.vars` | `SUPABASE_URL` | `https://llpbzemgndrsupnpbvhp.supabase.co` (Supabase → проект → Project Settings → API / Data API → Project URL) | **тестовый** | для входа |
| `web/.dev.vars` | `SUPABASE_SECRET_KEY` | Supabase → тестовый проект → Project Settings → **API Keys → Secret key** (`sb_secret_…`) | **тестовый** | для входа |
| `web/.dev.vars` | `GEMINI_API_KEY` | https://aistudio.google.com/apikey (бесплатно) | — | для AI (хотя бы один из двух) |
| `web/.dev.vars` | `GROQ_API_KEY` | https://console.groq.com/keys (бесплатно), запасной | — | нет |
| `web/.dev.vars` | `ACCESS_CODES` | старый вход по коду: `имя:код, имя:код` (код ≥ 12 символов, придумать: `openssl rand -hex 12`). Уйдёт после перехода на аккаунты | — | нет |
| `web/.dev.vars` | `GEMINI_MODEL`, `GROQ_MODEL` | модель вручную; без них выбирается сама | — | нет |
| `tools/.env` | `SUPABASE_URL` | `https://rmbcltczrruvlepsmtwd.supabase.co` (уже в образце) | **основной** | для `upload_audio.py` |
| `tools/.env` | `SUPABASE_BUCKET` | `mp3 audios` (уже в образце) | **основной** | для `upload_audio.py` |
| `tools/.env` | `SUPABASE_SECRET_KEY` | Supabase → **основной** проект → Project Settings → API Keys → Secret key (`sb_secret_…`) | **основной** | для `upload_audio.py` |

> ⚠ **Ключ Supabase — только секретный `sb_secret_…`** (или legacy `service_role`), **не публичный `sb_publishable_…`**.
> С публичным ключом база отвечает `permission denied … current role anon` — так уже было. RLS включён, политик нет: публичный ключ ничего не прочитает.
>
> ⚠ В `web/.dev.vars` — ключ **тестового** проекта, в `tools/.env` — **основного** (там бакет mp3). Не перепутайте.

### `web/.dev.vars` — для `npx wrangler dev`

Формат — `ИМЯ=значение`, по одной на строку (как `.env`). Имена — те же, что у секретов Worker'а на Cloudflare (`web/worker/api.ts`, `ApiEnv`).

```bash
cd web
touch .dev.vars && chmod 600 .dev.vars
open -e .dev.vars          # или любой редактор; впишите строки вида:
# SUPABASE_URL=https://llpbzemgndrsupnpbvhp.supabase.co
# SUPABASE_SECRET_KEY=<sb_secret_… тестового проекта>
# GEMINI_API_KEY=<ключ>
# GROQ_API_KEY=<ключ>
# ACCESS_CODES=<имя:код>
```

Секреты для **настоящего сайта** задаются не здесь, а в Cloudflare (`npx wrangler secret put ИМЯ` или панель) — `docs/SETUP_CLOUDFLARE.md`.

### `tools/.env` — для `tools/upload_audio.py`

```bash
cp tools/.env.example tools/.env       # из папки EL
chmod 600 tools/.env
open -e tools/.env                     # впишите SUPABASE_SECRET_KEY= (ключ ОСНОВНОГО проекта)
```

Без этого файла `upload_audio.py` остановится с сообщением «Нет файла … Скопируйте tools/.env.example в tools/.env и впишите значения.»

### Что исключено из git (`.gitignore` и `web/.gitignore`)

| Правило | Где | Что |
|---|---|---|
| `.dev.vars` | `.gitignore` | `web/.dev.vars` (и любой `.dev.vars`) — секреты для `wrangler dev` |
| `tools/.env` | `.gitignore` | ключ для загрузки mp3 |
| `web/.env.production`, `.env.production` | оба | личный адрес аудио для сборки (образец — `web/.env.production.example`, он в git) |
| `audio/**/*.mp3` | `.gitignore` | mp3 (они в Supabase) |
| `backups/` | `.gitignore` | копии данных базы перед миграциями (`npx supabase db dump`) |
| `web/node_modules/`, `web/dist/` | оба | библиотеки и сборка |
| `test-results/`, `playwright-report/` | `web/.gitignore` | отчёты Playwright |
| `.wrangler` | `web/.gitignore` | кеш и локальное состояние `wrangler dev` |
| `*.local` (`.env.local`, `.env.development.local`, …) | `web/.gitignore` | личные настройки Vite |
| `.DS_Store`, `__pycache__/`, `*.pyc` | `.gitignore` | системный мусор |

**Не игнорируется:** `web/.env.development` (в git, без секретов: `VITE_AUDIO_URL=/audio`). Секреты в `web/.env*` всё равно не кладём: Vite встраивает `VITE_*` в открытые файлы сайта. Перед коммитом — `git status` и `git diff --cached --name-only`.

---

## 5. Запуск «как на сайте» (wrangler dev), вход, первый админ

`npx wrangler dev` запускает собранный сайт **вместе со скриптом Worker'а** (`web/worker/index.ts`) на движке Cloudflare у вас на компьютере:
работают вход, AI через сервер, озвучка `/api/tts`. База — **тестовый** проект Supabase (из `web/.dev.vars`).

### 5.1. Что нужно заранее

1. `web/.dev.vars` заполнен ([раздел 4](#4-файлы-с-секретами)).
2. В **тестовом** проекте Supabase применены миграции из `supabase/migrations/` (обе: `20261120120000_users.sql`, `20261120130000_grant_service_role.sql`) —
   как это сделать, в `docs/SETUP_SUPABASE.md`. Без второй миграции вход с секретным ключом падает с `permission denied`.
3. Интернет (Supabase, Gemini/Groq, Microsoft edge-tts; при первом запуске — скачать wrangler).

### 5.2. Запуск

```bash
cd web
npm run build:pages          # сборка в web/dist (wrangler отдаёт её как статические файлы)
npx wrangler dev             # → http://localhost:8787
```

- После правок кода сайта — снова `npm run build:pages` (wrangler отдаёт готовую `dist/`). Правки в `web/worker/` wrangler подхватывает сам.
- С телефона: `npx wrangler dev --ip 0.0.0.0`, на телефоне — `http://<IP компьютера>:8787` (IP — из `npm run dev` или
  `ipconfig getifaddr en0`). Cookie входа без `Secure` по http — специально, чтобы Safari входил локально.
- mp3 здесь — из Supabase (основной проект), как на сайте.

### 5.3. Вход и первый админ

Вход — **имя + пароль** (`#/login`, кнопка 👤 в шапке). Саморегистрации нет: аккаунт создаёт админ.
Имя: 3–32 символа, латиница/цифры/`_`, **регистр важен** (`Rasul` ≠ `rasul`). Пароль — не короче 8 символов.

Создать первого админа (или обычного пользователя) в **тестовом** проекте:

```bash
node tools/create_user.ts            # админ; из папки EL; нужен Node 22.18+
node tools/create_user.ts --user     # обычный пользователь
```

Скрипт спросит имя, пароль и повтор (пароль не виден при вводе) и напечатает SQL `insert into public.users …` — **там только хеш, пароля нет**.
Дальше: https://supabase.com/dashboard → **тестовый** проект (`llpbzemgndrsupnpbvhp`) → **SQL Editor** → вставить SQL → **Run**.
Для настоящего сайта — то же самое в **основном** проекте.

> Предупреждение Node `MODULE_TYPELESS_PACKAGE_JSON … Reparsing as ES module` при запуске `create_user.ts` безвредно.

Проверить: http://localhost:8787/#/login → имя и пароль → «Войти». В шапке появится имя. Старый вход «по коду доступа» тоже работает,
если задан `ACCESS_CODES`. Проверка AI после входа: http://localhost:8787/api/ai/check (модель и время ответа по каждому сервису).

> Админ-панели (`#/admin`) и профиля (`#/profile`) пока нет — это следующие шаги (`HANDOFF.md`, раздел 5).

---

## 6. Тесты и проверки

```bash
python3 tools/validate_content.py    # из EL: контент (грамматика, вопросы, тесты, глаголы)
cd web
npm run check                        # типы → модульные (Vitest) → сборка → браузерные (Playwright)
```

По частям:

```bash
cd web
npm run typecheck      # vue-tsc --noEmit
npm test               # Vitest: 118 тестов в 13 файлах (~5 с)
npm run test:e2e       # Playwright: 25 тестов в 2 файлах (сам собирает сайт и запускает vite preview на :4174)
npx playwright test --list     # список браузерных тестов без запуска
```

- **Модульные** (`web/src/**/*.test.ts`, `web/worker/**/*.test.ts`) — в т.ч. Worker (Range, вход, AI-посредник, edge-tts) и **миграции базы**:
  `web/worker/db/migrations.test.ts` применяет все `supabase/migrations/*.sql` по порядку в **PGlite** (Postgres внутри Node, пакет `@electric-sql/pglite` в devDependencies) — Docker и Supabase не нужны.
- **Браузерные** (`web/e2e/*.spec.ts`) идут на ширине телефона (390 px). mp3 и `/api/*` в них **подменяются** (`fakeMp3` в `e2e/helpers.ts`) —
  сеть, Supabase и папка `audio/` не нужны.
- Локально Playwright запускает **установленный Google Chrome** (`channel: "chrome"`). В CI (`CI=true`) — Chromium от Playwright
  (`npx playwright install --with-deps chromium`). Нет Chrome — можно как в CI:
  ```bash
  cd web
  npx playwright install chromium
  CI=1 npm run test:e2e        # с CI=1: Chromium, отчёт в web/playwright-report, сервер не переиспользуется
  ```
- Локально Playwright **переиспользует** уже запущенный сервер на порту 4174 — если там висит старая сборка, остановите его.
- **GitHub Actions** (`.github/workflows/check.yml`) на каждый push и PR: Python 3.12 → `validate_content.py` → `build_site_data.py` →
  Node 22 → `npm ci` → Chromium → `npm run check`. Если браузерные тесты упали — отчёт `playwright-report` во вкладке Actions (7 дней).
- Тесты в браузере завязаны на контент (например, в A2 ровно 906 слов). Изменили такие данные — обновите тесты вместе с ними.

---

## 7. Контент и аудио: типовые сценарии

Все Python-скрипты запускаются **из папки `EL`**: `python3 tools/<скрипт>.py`. Форматы файлов — `README.md` → «Форматы файлов контента»
и шапка `tools/validate_content.py`.

**Главное правило:** после любой правки в `content/` или `audio/` — `build_site_data.py`, и **закоммитить `web/public/data/`**
(Cloudflare берёт данные из git, Python там не запускается; CI пересобирает данные, но не проверяет, что в git они актуальны).

### Поправить опечатку / вопрос / упражнение

```bash
# отредактировать content/.../*.json|csv|txt
python3 tools/validate_content.py
python3 tools/build_site_data.py
git status        # должны измениться ваш файл и web/public/data/*.json
```

### Новая тема грамматики или тест

Положить `content/grammar/B1/16_my_topic.json` или `content/tests/<id>.json`, затем:
```bash
python3 tools/validate_content.py && python3 tools/build_site_data.py
```

### Изменить словари

```bash
# правка content/vocabulary/A1.csv (A2, B1); перед большой правкой — копия в content/vocabulary/backup/
python3 tools/find_story_words.py --force    # обновить словарные слова в рассказах
python3 tools/build_site_data.py
```
По желанию перезаписать mp3 со словами — см. «Новые mp3» ниже (`make_word_audio.py`).

### Новый рассказ (без mp3 — читает голос браузера)

```bash
# content/stories/41_my_story/story.txt и questions.json
python3 tools/find_story_words.py
python3 tools/validate_content.py
python3 tools/build_site_data.py
```

### Новые mp3 (рассказ или слова) — порядок важен

Нужны `edge-tts`, `ffmpeg`, интернет и `tools/.env` с ключом **основного** проекта.

```bash
# 1. озвучка → audio/stories/<id>/<голос>.mp3 + .json (тайминги)
python3 tools/make_story_audio.py --only 41          # флаги: --voices jenny,sonia, --rate -10%, --force
#    или слова: python3 tools/make_word_audio.py --level A1   (--pause 1.8, --rate -10%)

# 2. тайминги → данные сайта
python3 tools/build_site_data.py

# 3. mp3 → Supabase Storage: сначала посмотреть, что будет загружено и удалено
python3 tools/upload_audio.py --dry-run
python3 tools/upload_audio.py                        # --keep-extra — не удалять из бакета файлы, которых нет в audio/
```

> ⚠ `upload_audio.py` приводит бакет к **вашей** папке `audio/`: файлы, которых у вас нет, **удаляются из бакета**.
> После свежего clone (mp3 нет или они только из старого коммита) **обязательно** сначала `--dry-run`, а при неполной папке — `--keep-extra`.
>
> Если пропустить шаг 3 — на сайте плеер будет пустым (данные сайта говорят «mp3 есть», а в Supabase файла нет).
> Если пропустить шаг 2 — новые mp3 на сайте не появятся.
> Не забудьте закоммитить `audio/**/*.json` и `web/public/data/` (mp3 в git не попадут — так и задумано).

Озвучка одного рассказа ~1000 слов тремя голосами — несколько минут. Зависла — запустите снова (готовые файлы пропускаются).

---

## 8. Git-процесс

```
development  ──push──▶  GitHub  ──Pull Request──▶  main  ──merge──▶  Cloudflare собирает и деплоит сайт
     │                     └── GitHub Actions: проверка (check.yml) на каждый push и PR
     └── Cloudflare делает предпросмотр ветки (wrangler preview)
```

```bash
git switch development
git pull
# … работа, проверки: python3 tools/validate_content.py; cd web && npm run check …
git status                                  # нет ли лишнего: .env*.local, mp3, секретов
git add <файлы>
git commit -m "Коротко, что сделано"
git push origin development                 # первый раз: git push -u origin development
```

Затем на GitHub: **Pull requests → New → base: `main` ← compare: `development`** → дождаться зелёной проверки → **Merge**.
Merge в `main` = автоматический деплой на https://open-english-for-beginner.rasuli-naurizbaev.workers.dev (1–3 минуты).
Как настроена сборка в Cloudflare — `docs/SETUP_CLOUDFLARE.md`.

- Что не попадает в git — таблица в [разделе 4](#что-исключено-из-git-gitignore-и-webgitignore).
- Изменения структуры базы — только новыми файлами в `supabase/migrations/`, сначала на тестовом проекте (`docs/SETUP_SUPABASE.md`, `HANDOFF.md` → «Изменения структуры базы»).

---

## 9. Частые проблемы при первом запуске

| Симптом | Причина | Что сделать |
|---|---|---|
| Рассказы 01–20 без mp3 в `npm run dev`: плеера нет / читает голос браузера; «Аудио» не играет | после clone в `audio/` нет mp3 (они в Supabase), а dev берёт их из `audio/` | [раздел 3](#3-mp3-после-clone): (а) `git restore --source=80bb922 --worktree -- audio/`, (б) `VITE_AUDIO_URL=… npm run dev`, (в) `npm run build && npm run preview` |
| Нет звука у рассказов 21–40 | так задумано: mp3 для них нет | кнопка «▶ Читать вслух» — голос браузера |
| `git status` показывает 84 mp3 как `A` (added) | восстанавливали через `git checkout <коммит> -- audio/` (кладёт в индекс) | `git restore --staged -- audio/` (файлы останутся на диске) |
| На `#/login`: «Сервер сайта недоступен (локальный запуск без Worker'а?)» | `npm run dev` / `npm run preview` — Worker'а нет | для входа: `npm run build:pages && npx wrangler dev` → http://localhost:8787 |
| «🎙 Сделать mp3» / ✨ перевод / AI: «Сервер сайта недоступен…» | то же | `wrangler dev`, или для AI — блок «Свои ключи» |
| Вход: `permission denied … current role anon` | в `SUPABASE_SECRET_KEY` вписан публичный `sb_publishable_…` | вписать секретный `sb_secret_…` того же (тестового) проекта, перезапустить `wrangler dev` |
| Вход: `permission denied` с секретным ключом | в проекте не применена миграция `20261120130000_grant_service_role.sql` | применить миграции — `docs/SETUP_SUPABASE.md` |
| Вход: «неверное имя или пароль», хотя пользователь создан | регистр имени (`Rasul` ≠ `rasul`); пользователь создан в другом проекте (основной vs тестовый); 5 неудачных попыток → пауза 15 мин | проверить имя и проект (`SUPABASE_URL` в `.dev.vars`), подождать |
| Вход/mp3 из Supabase вдруг перестали работать | бесплатный проект Supabase **уснул** после недели без активности | Supabase → проект → Restore / Resume (`docs/SETUP_SUPABASE.md`) |
| `npx wrangler dev` спрашивает «Need to install the following packages» | wrangler не в `package.json` | ответить `y` (нужен интернет) |
| `wrangler dev` отдаёт старую версию сайта / пустую страницу | не пересобрана `dist/` | `npm run build:pages`, затем снова `npx wrangler dev` |
| `node tools/create_user.ts`: `Unknown file extension ".ts"` / синтаксическая ошибка | Node старше 22.18 | обновить Node (22.18+ или 24) |
| Сайт пустой, вверху «Не загрузилось: данные …» | нет/сломаны `web/public/data/*.json` | `python3 tools/build_site_data.py` |
| `python3 tools/build_site_data.py` меняет `web/public/data` после свежего clone | кто-то закоммитил контент без пересборки данных | пересобрать и закоммитить данные отдельным коммитом |
| Телефон не открывает сайт | разные сети; брандмауэр macOS не пускает `node`; компьютер уснул; сменился IP | одна сеть; разрешить входящие для `node` (macOS спросит; на рабочем Mac брандмауэр может быть включён политикой); взять новый адрес из `Network:` |
| Прогресс «пропал» | другой адрес/порт/браузер — у каждого свой localStorage | резервная копия: «Сегодня» → «💾» → сохранить на старом адресе, загрузить на новом |
| `npm run test:e2e`: `Chromium distribution 'chrome' is not found` | нет Google Chrome | поставить Chrome, или `npx playwright install chromium && CI=1 npm run test:e2e` |
| `npm run test:e2e`: порт 4174 занят / тесты видят старую сборку | висит прошлый `vite preview` (локально сервер переиспользуется) | остановить процесс на 4174 (`lsof -i :4174`) |
| `upload_audio.py`: «Нет файла … tools/.env» | файл не создан | `cp tools/.env.example tools/.env` и вписать ключ основного проекта |
| `make_story_audio.py`: `ModuleNotFoundError: edge_tts` / нет `ffmpeg` | озвучка требует пакетов | `pip3 install edge-tts`, `brew install ffmpeg` |
| Голос браузера молчит | в Chrome голоса Google требуют интернет | интернет или Safari (работает офлайн) |
| `npm audit` про `picomatch` | уязвимость в инструментах сборки, на сайт не попадает | исправления пока нет, можно не обращать внимания |

---

## 10. Чек-лист «всё работает»

**Без секретов (достаточно для работы с контентом и кодом):**

- [ ] `node --version` → v22.18+ (или 24); `python3 --version` → 3.9+
- [ ] `git branch --show-current` → `development`
- [ ] `python3 tools/validate_content.py` → «OK: тем грамматики 40, рассказов 40, тестов 4, глаголов 122 — ошибок нет»
- [ ] `python3 tools/build_site_data.py` → после него `git status` чистый
- [ ] `cd web && npm ci` прошёл без ошибок
- [ ] `npm run dev` → http://localhost:5173 открывает «Сегодня», вкладки работают
- [ ] С телефона по адресу `Network:` открывается сайт
- [ ] mp3: выбран один из способов [раздела 3](#3-mp3-после-clone); рассказ 01 играет, нажатие на предложение перематывает
- [ ] `npm test` → 118 passed; `npm run typecheck` — без ошибок
- [ ] `npm run test:e2e` → 25 passed (или сразу `npm run check`)

**С секретами (вход, AI, озвучка, загрузка mp3):**

- [ ] `web/.dev.vars` создан; `git check-ignore web/.dev.vars` печатает путь (значит, игнорируется)
- [ ] `npm run build:pages && npx wrangler dev` → http://localhost:8787 открывается
- [ ] В тестовом проекте создан админ (`node tools/create_user.ts` → SQL Editor), вход на `#/login` проходит
- [ ] http://localhost:8787/api/ai/check после входа показывает модель Gemini и/или Groq
- [ ] «Аудио → Мои» → «🎙 Сделать mp3» создаёт mp3 (озвучка через Worker)
- [ ] `tools/.env` создан (ключ **основного** проекта); `git check-ignore tools/.env` печатает путь; `python3 tools/upload_audio.py --dry-run` показывает план без ошибок
- [ ] `git status` перед первым коммитом — нет `.dev.vars`, `tools/.env`, `*.local`, mp3
