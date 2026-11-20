# Supabase: устройство, настройка с нуля, миграции

> Сменился адрес сайта, имя Worker'а, проект или бакет Supabase — пошагово: [CHANGE_DOMAIN_OR_PROJECT.md](CHANGE_DOMAIN_OR_PROJECT.md).

Документ для того, кто только что сделал `git clone`. После него понятно:
что проект хранит в Supabase, откуда брать каждое значение, как поднять свой/новый проект с нуля
и как менять структуру базы, не теряя данных.

Связанные документы: `docs/SETUP_CLOUDFLARE.md` (Worker, секреты Cloudflare, деплой),
`docs/SETUP_LOCAL.md` (запуск на компьютере), `HANDOFF.md` (история решений), `README.md` («Деплой → mp3 в Supabase Storage»).

> **Секреты.** Ни один секретный ключ и ни один пароль не пишется в этот документ, в git, в чат, в issue.
> Ref проектов и публичные адреса ниже — не секреты (они и так есть в коде).

## Содержание

1. [Что лежит в Supabase и зачем](#1-что-лежит-в-supabase-и-зачем)
2. [Какое значение — откуда взять — куда вписать](#2-какое-значение--откуда-взять--куда-вписать)
3. [С нуля: проекты, бакет, ключи](#3-с-нуля-проекты-бакет-ключи)
4. [Supabase CLI: login, link, push, list, переключение проектов](#4-supabase-cli-login-link-push-list-переключение-проектов)
5. [Миграции: как менять структуру базы](#5-миграции-как-менять-структуру-базы)
6. [mp3 в Storage: загрузка и проверка](#6-mp3-в-storage-загрузка-и-проверка)
7. [Аккаунты: первый админ и пользователи](#7-аккаунты-первый-админ-и-пользователи)
8. [Безопасность](#8-безопасность)
9. [Частые ошибки](#9-частые-ошибки)
10. [Лимиты бесплатного плана и «засыпание»](#10-лимиты-бесплатного-плана-и-засыпание)
11. [Что ещё не проверено / не сделано](#11-что-ещё-не-проверено--не-сделано)
12. [Шпаргалка](#12-шпаргалка)

---

## 1. Что лежит в Supabase и зачем

Supabase используется для двух вещей:

| Часть | Что хранит | Кто обращается |
|---|---|---|
| **Storage** (файлы) | mp3 рассказов и слов, публичный бакет `mp3 audios` | **браузер** напрямую (тег `<audio>`), по публичному адресу, без ключа |
| **Postgres** (база) | аккаунты: `users`, `sessions`, `login_attempts`, `user_ai_keys`, `usage` + функция `use_quota` | **только Worker** Cloudflare, через REST API (PostgREST) с **секретным** ключом |

```
                       публичный адрес mp3 (без ключа)
 браузер ─────────────────────────────────────────────────▶ Supabase Storage (бакет "mp3 audios")
    │
    │ /api/*  (вход, сессии, AI, озвучка)
    ▼
 Cloudflare Worker (web/worker/) ──REST /rest/v1, секретный ключ──▶ Supabase Postgres
                                   (роль service_role, обходит RLS)
```

- Браузер **никогда** не ходит в базу Supabase. Публичный (publishable) ключ в коде сайта не используется вообще.
- Код доступа к базе: `web/worker/db/supabase.ts` (HTTP-клиент), `web/worker/db/supabaseAccounts.ts` (запросы аккаунтов),
  `web/worker/accounts.ts` (логика входа), `web/worker/passwords.ts` (хеши паролей PBKDF2-SHA256).
- Если у Worker'а не заданы `SUPABASE_URL`/`SUPABASE_SECRET_KEY`, вход по имени отвечает
  «Вход по имени и паролю ещё не настроен на сервере.» (HTTP 503) — сайт без входа при этом работает.
- Адрес mp3 для сайта зашит в `web/src/data/config.ts` → `SUPABASE_AUDIO_URL`.
  Локально (`npm run dev`) mp3 берутся из папки `audio/` (`web/.env.development`: `VITE_AUDIO_URL=/audio`), Supabase не нужен.

### Два проекта

Бесплатный план разрешает **2 активных проекта** — используются оба:

| | ОСНОВНОЙ | ТЕСТОВЫЙ |
|---|---|---|
| Имя в панели | (основной проект сайта) | `english-test` |
| Ref | `rmbcltczrruvlepsmtwd` | `llpbzemgndrsupnpbvhp` |
| URL | https://rmbcltczrruvlepsmtwd.supabase.co | https://llpbzemgndrsupnpbvhp.supabase.co |
| Storage (mp3) | **да**, бакет `mp3 audios` | нет (не нужен) |
| База | аккаунты сайта | копия структуры для проверки миграций |
| Кто подключается | сайт на Cloudflare (секреты Worker'а), `tools/upload_audio.py` | `wrangler dev` на компьютере (`web/.dev.vars`) |
| Миграции | применяются **вторыми** | применяются **первыми** |

Аккаунты в двух проектах независимы: пользователя нужно создавать в каждом отдельно.

### Что в репозитории

| Путь | Что это |
|---|---|
| `supabase/config.toml` | настройки CLI (создан `npx supabase init`; `project_id = "EL"`). Нужен CLI; для облачных проектов почти ничего не значит (это настройки локального стека Docker, которым мы не пользуемся) |
| `supabase/migrations/*.sql` | **миграции** — вся структура базы. Единственный источник правды о таблицах |
| `supabase/.temp/` | служебные файлы CLI, **не в git** (`supabase/.gitignore`). `supabase/.temp/project-ref` — ref проекта, к которому сейчас привязан CLI |
| `web/worker/db/migrations.test.ts` | тест: применяет все миграции в PGlite (Postgres в памяти) и проверяет правила |
| `tools/upload_audio.py` | загрузка mp3 из `audio/` в бакет |
| `tools/.env.example` | образец настроек для `upload_audio.py` (сам `tools/.env` — не в git) |
| `tools/create_user.ts` | печатает SQL для создания админа/пользователя (с хешем пароля) |
| `.github/workflows/keep-supabase-awake.yml` | 2 раза в неделю запрашивает 2 байта mp3, чтобы проект не «уснул» |
| `backups/` | копии данных перед миграциями, **не в git** (`.gitignore`) |

### Текущие миграции

| Файл | Что делает |
|---|---|
| `20261120120000_users.sql` | таблицы `users` (username с учётом регистра, `^[A-Za-z0-9_]{3,32}$`, роль `user`/`admin`, поле `extra jsonb`), `sessions` (хеш токена, 30 дней), `login_attempts` (защита от перебора), `user_ai_keys` (на будущее), `usage` (дневные лимиты); функция `use_quota` (атомарный лимит), триггер `updated_at`; **RLS на всех таблицах, политик нет**, у `anon`/`authenticated` права отобраны |
| `20261120130000_grant_service_role.sql` | права `service_role` на все таблицы и последовательности + `alter default privileges` — чтобы и **будущие** таблицы сразу были доступны Worker'у (см. ошибку в разделе 9) |

---

## 2. Какое значение — откуда взять — куда вписать

| Значение | Пример / вид | Секрет? | Где взять в панели Supabase | Куда вписать |
|---|---|---|---|---|
| **Project ref** | `rmbcltczrruvlepsmtwd` (20 строчных букв) | нет | в адресе панели `supabase.com/dashboard/project/<ref>`; Project Settings → General (Project ID) | `npx supabase link --project-ref <ref>` |
| **Project URL** | `https://<ref>.supabase.co` | нет | собирается из ref; также Project Settings → Data API или кнопка **Connect** (название пункта могло измениться) | `tools/.env` → `SUPABASE_URL` (основной); `web/.dev.vars` → `SUPABASE_URL` (тестовый); секрет Cloudflare `SUPABASE_URL` (основной) |
| **Имя бакета** | `mp3 audios` (с пробелом) | нет | Storage → список бакетов | `tools/.env` → `SUPABASE_BUCKET=mp3 audios` (без кавычек и без `%20`); в адресах — `mp3%20audios` |
| **Публичный адрес бакета** | `https://<ref>.supabase.co/storage/v1/object/public/mp3%20audios` | нет | собирается вручную; `upload_audio.py` печатает его в конце | `web/src/data/config.ts` → `SUPABASE_AUDIO_URL`; `.github/workflows/keep-supabase-awake.yml`; проверка в `web/e2e/learning.spec.ts` |
| **Publishable key** | `sb_publishable_…` | нет (публичный) | Project Settings → **API Keys** | **никуда.** Для Worker'а и `upload_audio.py` не подходит (см. раздел 9) |
| **Secret key** | `sb_secret_…` | **ДА** | Project Settings → **API Keys** → Secret keys (показать/скопировать) | `tools/.env` → `SUPABASE_SECRET_KEY` (**основной**); `web/.dev.vars` → `SUPABASE_SECRET_KEY` (**тестовый**); секрет Cloudflare `SUPABASE_SECRET_KEY` (**основной**) |
| Legacy `service_role` | JWT, начинается с `eyJ…` | **ДА** | Project Settings → API Keys → вкладка Legacy API keys (название вкладки могло измениться) | можно вместо `sb_secret_…` в те же места. Legacy `anon` (`eyJ…`) — публичный, **не подходит** |
| **Пароль базы** (роль `postgres`) | придумывается при создании проекта | **ДА** | задаётся при создании (Generate a password); сброс — Project Settings → Database → **Reset database password** (страница `…/project/<ref>/database/settings`) | только в менеджер паролей; вводится, когда CLI спросит (`link`, `db push --remote`, `db dump --remote`) |
| Аккаунт Supabase (вход в CLI) | — | да (токен) | `npx supabase login` открывает браузер | CLI хранит токен сам; в репозиторий ничего не пишется |

Как Worker передаёт ключ (`web/worker/db/supabase.ts`): `sb_secret_…` — **только** в заголовке `apikey`;
legacy JWT (`eyJ…`) — в `apikey` и ещё в `Authorization: Bearer`. Так и рекомендует документация Supabase
(новые ключи — не JWT, их шлют в `apikey`). `upload_audio.py` шлёт ключ в обоих заголовках — для Storage это работает (проверено загрузкой 84 файлов).

### Какой ключ какого проекта куда

| Файл / место | Проект | Значения |
|---|---|---|
| `tools/.env` (из `tools/.env.example`) | **ОСНОВНОЙ** | `SUPABASE_URL`, `SUPABASE_BUCKET=mp3 audios`, `SUPABASE_SECRET_KEY` |
| `web/.dev.vars` (для `wrangler dev`) | **ТЕСТОВЫЙ** | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (подробно — `docs/SETUP_LOCAL.md`) |
| Секреты Worker'а в Cloudflare | **ОСНОВНОЙ** | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (подробно — `docs/SETUP_CLOUDFLARE.md`) |

Cloudflare после сохранения значение секрета **назад не показывает**. Поэтому каждый ключ — сразу в менеджер паролей.
Потеряли — в Supabase (Project Settings → API Keys) создать новый secret key, вписать его везде, где использовался старый
(таблица выше), проверить вход на сайте и только потом удалить старый ключ.

---

## 3. С нуля: проекты, бакет, ключи

Нужно, если вы поднимаете свою копию сайта или пересоздаёте проект. Если работаете с существующими проектами — переходите к разделу 4.

### 3.1. Создать проект

1. https://supabase.com/dashboard → **New project**.
2. Имя (например `english` и `english-test`), регион — ближайший к пользователям.
3. **Database Password → Generate a password** → **сразу** скопировать в менеджер паролей (запись «Supabase <имя> — пароль базы»).
   Потом его не показывают; забыли — Project Settings → Database → Reset database password.
4. План — Free. Create new project. Ждать 1–2 минуты.
5. Записать ref (из адреса страницы) и URL `https://<ref>.supabase.co`.

Повторить для второго (тестового) проекта. Storage в тестовом не нужен.

### 3.2. Бакет для mp3 (только основной проект)

1. **Storage → New bucket**. Имя: `mp3 audios` (можно другое, но тогда поменять везде из таблицы раздела 2).
2. Включить **Public bucket** (уроки и так открыты всем; приватный бакет сайт открыть не сможет).
   Если бакет уже создан приватным: Storage → бакет → меню бакета → **Edit bucket** → **Public bucket** → Save.
3. Ограничения размера/типа файлов можно не задавать (файл ≤ 50 МБ — лимит плана).

Проверка, что бакет публичный (файл может ещё не существовать):

```bash
curl -s "https://<ref>.supabase.co/storage/v1/object/public/mp3%20audios/nope.mp3"
```

- `Object not found` — бакет **публичный**, всё хорошо (файла просто нет).
- `Bucket not found` — бакет **приватный** (или имя написано неверно) → включить Public bucket.

### 3.3. Ключи

Project Settings → **API Keys**:
- **Publishable key** (`sb_publishable_…`) — нам не нужен.
- **Secret key** (`sb_secret_…`) — нужен. Если его нет — создать (кнопка добавления secret key; название могло измениться).
  Скопировать в менеджер паролей. Для каждого проекта — свой.

### 3.4. Структура базы

Применить миграции через CLI — раздел 4 (сначала тестовый, потом основной). Таблицы руками в Table Editor **не создавать**:
всё, что не в `supabase/migrations/`, потеряется при следующем пересоздании и разойдётся между проектами.

### 3.5. Вписать значения

- `tools/.env` — раздел 6.1.
- `web/.dev.vars` — `docs/SETUP_LOCAL.md`.
- Секреты Cloudflare — `docs/SETUP_CLOUDFLARE.md`.
- **Если основной проект новый (другой ref)** — заменить старый ref `rmbcltczrruvlepsmtwd` в файлах:
  `web/src/data/config.ts` (`SUPABASE_AUDIO_URL`), `.github/workflows/keep-supabase-awake.yml`,
  `web/e2e/learning.spec.ts` (проверка адреса mp3), `tools/.env.example`, а также упоминания в `README.md`/`HANDOFF.md`.
  Найти все:

  ```bash
  grep -rn "rmbcltczrruvlepsmtwd\|mp3%20audios\|mp3 audios" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
  ```

### 3.6. Первые данные

- mp3 — раздел 6.
- Первый админ — раздел 7.

---

## 4. Supabase CLI: login, link, push, list, переключение проектов

CLI запускается через `npx supabase` (проверена версия **3.2.0**). Устанавливать глобально не нужно, **Docker не нужен**.
Первый запуск `npx` может спросить «Need to install the following packages: supabase… Ok to proceed?» → `y`.
Все команды — **из корня репозитория** (`EL/`, там, где папка `supabase/`).

```bash
npx supabase --version
```

### 4.1. Вход (один раз на компьютере)

```bash
npx supabase login
```

Откроется браузер → подтвердить. Токен CLI хранит сам, в репозиторий ничего не попадает.

### 4.2. Привязать к проекту

```bash
npx supabase link --project-ref llpbzemgndrsupnpbvhp     # ТЕСТОВЫЙ
```

Спросит **пароль базы** этого проекта (из менеджера паролей). Ref сохраняется в `supabase/.temp/project-ref` (не в git).

**Какой проект привязан сейчас:**

```bash
cat supabase/.temp/project-ref; echo
```

`llpbzemgndrsupnpbvhp` — тестовый, `rmbcltczrruvlepsmtwd` — основной. На момент написания документа на этом компьютере
привязан **основной** — перед любым `db push` проверяйте!

### 4.3. Применить миграции

```bash
npx supabase db push --remote --dry-run    # только показать, какие миграции будут применены
npx supabase db push --remote              # применить
```

**ВАЖНО: в CLI 3.x без `--remote` команда идёт в ЛОКАЛЬНУЮ базу (Docker) и падает:**

```
Target: local stack (127.0.0.1:54322)
… failed to connect to postgres …
Make sure Docker is running …
To use the linked project instead, pass --remote.
```

Перед ответом **Yes** на вопрос о применении — прочитать строку **`Target:`**: там указан проект. Должен быть тот, который вы собирались менять.

Можно указать проект прямо в команде, не меняя привязку (по `--help` CLI 3.2.0; на практике в этом проекте не проверялось —
мы всегда делали через `link`):

```bash
npx supabase db push --remote=llpbzemgndrsupnpbvhp
```

Пароль базы CLI спросит сам (или флаг `-p`, но тогда пароль останется в истории Терминала — лучше не надо).

### 4.4. Проверить, что применено

```bash
npx supabase migration list --remote
```

Две колонки: Local (файлы в `supabase/migrations/`) и Remote (история в базе). У каждой миграции должны быть заполнены обе.
Пустое значение в Remote — миграция ещё не применена к этому проекту.

### 4.5. Переключение тестовый ↔ основной

```bash
npx supabase link --project-ref llpbzemgndrsupnpbvhp     # → тестовый
npx supabase link --project-ref rmbcltczrruvlepsmtwd     # → основной
cat supabase/.temp/project-ref; echo                     # проверить
```

Каждый раз спрашивается пароль базы **соответствующего** проекта. Отвязать: `npx supabase unlink`.

### 4.6. Команды, которые НЕ нужны / опасны

| Команда | Почему не трогать |
|---|---|
| `npx supabase start`, `npx supabase db reset` (без `--remote`) | локальный стек в Docker — мы им не пользуемся |
| `npx supabase db reset --remote` | **стирает всю базу** привязанного проекта и накатывает миграции заново. На основном — никогда; на тестовом — только сознательно (аккаунты тестового пропадут) |
| `npx supabase db pull` | создаёт миграцию из текущей базы — нужна, только если кто-то менял структуру руками в панели (так делать нельзя) |
| `npx supabase migration repair` | правит только **историю** миграций, не структуру. Нужна в редких случаях расхождения истории — сначала разобраться |

---

## 5. Миграции: как менять структуру базы

### 5.1. Правила (обязательно)

1. **Структура базы — только миграциями** из `supabase/migrations/`. Руками в Table Editor / SQL Editor структуру не менять
   (SQL Editor — только для данных, например создания пользователя).
2. **Имя файла: `<ГГГГММДДччммсс>_<имя>.sql`**, имя — строчные латинские буквы, цифры, `_`. Например `20261201090000_progress.sql`.
   Так требует CLI; тест проверяет формат и что версии (первые 14 цифр) не повторяются. Время в имени задаёт порядок применения —
   новая миграция должна быть **позже** всех существующих.
3. **Применённую миграцию не менять никогда.** CLI запоминает версию в базе и второй раз файл не выполнит — правка просто
   не дойдёт до базы, а проекты разойдутся. Новое изменение = новый файл.
4. **Только «расширить → перенести → убрать»:**
   - новый столбец — с `default …` или допускающий `null` (иначе миграция упадёт на существующих строках);
   - переименование = новый столбец + копирование данных + код Worker'а читает новый; старый столбец удаляется **отдельной миграцией позже**,
     когда новый код уже на сайте;
   - `drop column` / `rename` / смена типа за один шаг — нельзя (старый код на сайте сломается между деплоем и миграцией).
5. **Поле `extra jsonb`** (уже есть в `users`): экспериментальные данные можно класть туда без миграции; устоится — сделать столбцом.
6. **Worker выбирает явный список столбцов** (`select=id,username,…`, не `*`) — тогда новые столбцы старый код не ломают. Новый код — так же.
7. **Новые таблицы:** включить RLS (`alter table … enable row level security;`), политик не добавлять, `anon`/`authenticated` прав не давать.
   Права `service_role` на новые таблицы выдаются автоматически (`alter default privileges` из `20261120130000_grant_service_role.sql`),
   но тест всё равно проверит.
8. Таблицы прогресса пользователя: `user_id bigint not null references public.users (id) on delete cascade`, `updated_at`, `extra jsonb not null default '{}'`.
9. Функции: `set search_path = ''` и полные имена (`public.…`); `revoke all … from public, anon, authenticated` и `grant execute … to service_role`.

### 5.2. Порядок работы (каждый раз)

```bash
# 1. Создать файл (CLI подставит текущее время UTC в имя)
npx supabase migration new progress
#    → supabase/migrations/<ГГГГММДДччммсс>_progress.sql — написать SQL
#    (можно создать файл и вручную — главное формат имени)

# 2. Проверить локально: все миграции по порядку в PGlite + правила
cd web && npm test && cd ..
#    (только тест миграций: cd web && npx vitest run worker/db/migrations.test.ts)
```

Если нужна новая проверка (новое ограничение, новая функция) — добавить её в `web/worker/db/migrations.test.ts`.
Тест создаёт роли `anon`, `authenticated`, `service_role` (как в Supabase), применяет все миграции и проверяет:
формат имён, регистр username, ограничения, `updated_at`, лимиты `use_quota`, каскадное удаление, RLS на всех таблицах,
отсутствие прав у `anon`/`authenticated`, полные права `service_role` (в том числе на будущие таблицы).
PGlite — не настоящий Supabase: он не знает расширений и схем Supabase (`auth`, `storage`…), поэтому шаг 4 ниже обязателен.

```bash
# 3. Копия данных ТЕСТОВОГО проекта (необязательно, но полезно потренироваться)
npx supabase link --project-ref llpbzemgndrsupnpbvhp
mkdir -p backups
npx supabase db dump --remote --data-only -f backups/test-$(date +%Y-%m-%d).sql

# 4. Применить к ТЕСТОВОМУ
npx supabase db push --remote --dry-run
npx supabase db push --remote            # смотреть строку Target:
npx supabase migration list --remote

# 5. Проверить работу: wrangler dev (web/.dev.vars → тестовый проект), войти, проверить новую функцию.
#    Подробно — docs/SETUP_LOCAL.md

# 6. Копия данных ОСНОВНОГО — ОБЯЗАТЕЛЬНО
npx supabase link --project-ref rmbcltczrruvlepsmtwd
npx supabase db dump --remote --data-only -f backups/main-$(date +%Y-%m-%d).sql
#    проверить, что файл не пустой:
ls -lh backups/

# 7. Применить к ОСНОВНОМУ
npx supabase db push --remote --dry-run
npx supabase db push --remote            # Target: должен быть rmbcltczrruvlepsmtwd
npx supabase migration list --remote

# 8. Закоммитить файл миграции (и код Worker'а) — миграция в git должна совпадать с тем, что применено
```

Порядок «миграция ↔ деплой кода»: при правилах из 5.1 миграция **расширяет** структуру, поэтому её применяют **до** деплоя кода,
который ею пользуется. Удаление старого столбца — **после** того, как новый код уже на сайте.

О `db dump`: синтаксис проверен по `npx supabase db dump --help` (CLI 3.2.0): без `--remote` команда целится в **локальную** базу,
`--data-only` — только данные, `-f` — файл. Сам дамп на этом проекте **ещё ни разу не запускался** — при первом запуске
проверить, что работает без Docker и файл содержит `INSERT`/`COPY` строки таблиц `public`. Если понадобится и структура — дополнительно
без `--data-only` в отдельный файл. Файлы в `backups/` содержат хеши паролей и сессии — **не в git** (уже в `.gitignore`), никому не отправлять.

### 5.3. Откат

«Обратных» миграций (down) в Supabase CLI нет. Варианты:

1. **Новая миграция, которая отменяет изменение** (например, `drop` только что добавленного и ещё не используемого столбца) —
   основной способ. Тем же порядком: тест → тестовый → основной.
2. Миграция упала с ошибкой — по описанию CLI файл миграции выполняется в одной транзакции, значит в базе ничего не поменялось
   и версия в историю не записана (на этом проекте не проверялось — убедиться через `migration list --remote` и Table Editor).
   Если версии в Remote нет — исправить **этот же** файл (он ещё не применён!) и запустить `db push --remote` снова.
3. **Данные испорчены** — восстановление из `backups/<дата>.sql`. Не проверялось. Обычно: восстановить в **тестовый** проект,
   убедиться, что всё на месте, затем в основной. Подключение — строкой подключения из панели (кнопка **Connect**, название могло измениться)
   через `psql`; делать осторожно, при сомнениях — сначала спросить.
4. Если миграцию применили руками через SQL Editor (так нельзя) и история разошлась — `npx supabase migration repair --status applied <версия> --remote`
   записывает версию в историю, не выполняя SQL. Только когда точно понятно, что структура уже соответствует файлу.

---

## 6. mp3 в Storage: загрузка и проверка

**Главная копия mp3 — папка `audio/` на компьютере.** В git mp3 нет (`audio/**/*.mp3` в `.gitignore`);
json с таймингами (`audio/stories/*/*.json`, `audio/words/manifest.json`) — в git. Supabase — **не** резервная копия.
Сейчас загружено 84 mp3 (114 МБ).

Публичный адрес файла:

```
https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/mp3%20audios/<путь внутри audio/>
```

Например `…/mp3%20audios/stories/01_weekend_by_the_sea/jenny.mp3`. Пробел в имени бакета в адресе — `%20`.

### 6.1. Настроить `tools/.env` (один раз)

```bash
cp tools/.env.example tools/.env
```

Открыть `tools/.env` в редакторе и вписать (ключ — **ОСНОВНОГО** проекта):

```
SUPABASE_URL=https://rmbcltczrruvlepsmtwd.supabase.co
SUPABASE_BUCKET=mp3 audios
SUPABASE_SECRET_KEY=<sb_secret_… основного проекта>
```

`tools/.env` в `.gitignore`. Проверить, что git его не видит: `git status --short tools/` — файла `.env` там быть не должно.

### 6.2. Загрузить / обновить

Нужен только Python 3 (без pip). Запуск из корня репозитория.

```bash
python3 tools/upload_audio.py --dry-run     # план: что загрузится (+) и удалится (-); ничего не меняет
python3 tools/upload_audio.py               # загрузить новые и изменённые, удалить лишние из бакета
python3 tools/upload_audio.py --keep-extra  # то же, но ничего не удалять из бакета
```

Как работает: сравнивает `audio/**/*.mp3` с бакетом по размеру и MD5 (eTag); загружает с `Content-Type: audio/mpeg` и
`cache-control: max-age=604800` (неделя); файлы, которых больше нет в `audio/`, **удаляет** из бакета (если не `--keep-extra`).
В конце проверяет, что бакет совпадает с папкой, и печатает «✓ Бакет совпадает с audio/.» и адрес для сайта.

**Всегда сначала `--dry-run`**: если в `audio/` чего-то не хватает (например, папка не вся скопирована на новый компьютер),
скрипт удалит эти файлы из бакета и сайт перестанет их играть.

### 6.3. Добавить новые mp3

1. Сделать mp3 (`python3 tools/make_story_audio.py …` / `make_word_audio.py`, см. `README.md` → «Python-скрипты»).
2. `python3 tools/build_site_data.py` — данные сайта (берутся из json с таймингами).
3. `python3 tools/upload_audio.py --dry-run` → `python3 tools/upload_audio.py`.
4. Закоммитить json и `web/public/data` (mp3 не коммитятся).
5. Проверить файл (6.4).

### 6.4. Проверка перемотки (Range → 206)

Safari на iPhone не перематывает mp3, если сервер не отдаёт части файла. Проверка:

```bash
curl -s -o /dev/null -D - -H "Range: bytes=0-1" \
  "https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/mp3%20audios/stories/01_weekend_by_the_sea/jenny.mp3" \
  | grep -i -E "^HTTP|cache-control|content-range"
```

Ожидается (проверено): `HTTP/2 206`, `cache-control: public, max-age=604800`, `content-range: bytes 0-1/…`.
`HTTP 200` вместо 206 — части файла не отдаются; `400`/`404` с «Bucket not found» — бакет приватный.

Сверить файл с локальным (проверено — совпадают):

```bash
curl -s "https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/mp3%20audios/stories/01_weekend_by_the_sea/jenny.mp3" | md5
md5 -q audio/stories/01_weekend_by_the_sea/jenny.mp3
```

Каждая такая полная загрузка расходует трафик (лимит 5 ГБ/мес) — не делать массово.

---

## 7. Аккаунты: первый админ и пользователи

Саморегистрации нет, email нет. Аккаунты создаёт админ. Пока **админ-панели и профиля нет** (шаг 5 плана в `HANDOFF.md`),
поэтому все пользователи создаются скриптом + SQL Editor.

Нужен **Node 22.18+** (запускает `.ts` без сборки): `node --version`.

```bash
node tools/create_user.ts            # админ
node tools/create_user.ts --user     # обычный пользователь
```

Скрипт спрашивает имя (латиница, цифры, `_`, 3–32 символа) и пароль дважды (не виден при вводе, ≥ 8 символов)
и печатает SQL вида:

```sql
insert into public.users (username, password_hash, password_salt, password_iterations, role)
values ('<имя>', '<хеш>', '<соль>', 100000, 'admin');
```

Пароля в SQL нет — только хеш PBKDF2-SHA256 (тот же код, что у Worker'а, `web/worker/passwords.ts`).

Дальше:
1. Supabase → **нужный проект** (проверить имя/ref вверху панели!) → **SQL Editor** → New query.
2. Вставить напечатанный SQL → **Run**. Ответ «Success. No rows returned» — готово.
3. Войти на сайте (основной проект) или в `wrangler dev` (тестовый) под этим именем.

Важно:
- **Регистр имени важен:** `Rasul` и `rasul` — разные пользователи. Входить нужно ровно с тем написанием.
- Для каждого проекта аккаунт создаётся **отдельно**. Можно тот же SQL, а можно запустить скрипт ещё раз — хеш получится другой
  (своя случайная соль), это нормально.
- Ошибка `duplicate key value violates unique constraint "users_username_key"` — имя занято.
- Сменить пароль (пока нет админки): создать новый хеш скриптом и выполнить в SQL Editor
  `update public.users set password_hash='…', password_salt='…', password_iterations=100000 where username='<имя>';`
  затем `delete from public.sessions where user_id = (select id from public.users where username='<имя>');` — закрыть старые входы.
- Удалить пользователя: `delete from public.users where username='<имя>';` (сессии и ключи удалятся каскадом).
- 5 неверных паролей подряд → вход закрыт на 15 минут (и по имени, и по IP). Снять блокировку вручную:
  `delete from public.login_attempts where key = 'user:<имя>';`

---

## 8. Безопасность

### Никогда не коммитить и не присылать в чат

| Что | Где лежит |
|---|---|
| Secret key (`sb_secret_…`) / legacy `service_role` | `tools/.env`, `web/.dev.vars`, секреты Cloudflare, менеджер паролей |
| Пароль базы | только менеджер паролей |
| Дампы базы | `backups/` (там хеши паролей и сессии) |
| Пароли пользователей | нигде — только хеши в базе |

`.gitignore` уже содержит `.dev.vars`, `tools/.env`, `backups/`, `supabase/.temp` (через `supabase/.gitignore`).
Перед коммитом: `git status` — ни одного из этих файлов в списке быть не должно.

Ключ утёк (попал в git, чат, скриншот) → Project Settings → API Keys → создать новый secret key, вписать везде (раздел 2),
**удалить старый**. Удалённый из git файл остаётся в истории — поэтому именно отзывать ключ, а не только удалять файл.

### RLS

- RLS включён на **всех** таблицах, политик **нет**. Итог: `anon` (publishable key) и `authenticated` не видят и не меняют ничего —
  проверено на деле (с publishable key база отвечает «permission denied … current role anon»).
- `service_role` (secret key) обходит RLS — поэтому secret key есть только у Worker'а и у скриптов на компьютере.
- Тест миграций проверяет: нет таблиц без RLS, у `anon`/`authenticated` нет прав, `use_quota` вызывает только `service_role`.
- **Не добавлять** политики RLS и `grant` для `anon`/`authenticated`, если на то нет отдельного решения: браузер в базу ходить не должен.

### Storage

Бакет `mp3 audios` публичный — любой, у кого есть адрес, может скачать mp3. Это осознанно (уроки открыты всем).
Ничего личного в этот бакет не класть. Загружать/удалять файлы может только владелец secret key.

---

## 9. Частые ошибки

| Текст ошибки (где) | Причина | Что делать |
|---|---|---|
| `permission denied for table … current role anon` (Worker / `upload_audio.py`) | вместо secret key вставлен **publishable** (`sb_publishable_…`) или legacy `anon`. **Так и было**: в `.dev.vars` оказался publishable | вписать `sb_secret_…` нужного проекта (раздел 2) |
| `permission denied for table login_attempts` … `GRANT SELECT ON public.login_attempts TO service_role` (Worker после первой миграции) | новые проекты Supabase **не дают `service_role` прав на таблицы автоматически** | исправлено миграцией `20261120130000_grant_service_role.sql`. Если видите снова — проверить `migration list --remote`: применена ли она к этому проекту |
| `Target: local stack (127.0.0.1:54322)` … `failed to connect to postgres` … `Make sure Docker is running` … `To use the linked project instead, pass --remote.` (CLI) | CLI 3.x без `--remote` идёт в локальную базу | добавить `--remote` |
| CLI применил миграцию «не туда» | привязан другой проект | всегда смотреть `Target:` и `cat supabase/.temp/project-ref` перед «Yes» |
| CLI просит пароль, пароль не подходит | пароль базы другого проекта или забыт | менеджер паролей; иначе Project Settings → Database → Reset database password (секреты Cloudflare это не затрагивает — там API-ключ, не пароль базы) |
| `Bucket not found` (адрес mp3) | бакет приватный или имя неверное (пробел → `%20`) | Storage → бакет → Edit bucket → Public bucket |
| `Object not found` (адрес mp3) | бакет публичный, но файла нет | `python3 tools/upload_audio.py --dry-run` → загрузить; проверить путь |
| `Нет файла …/tools/.env` / `В … не заданы: …` (`upload_audio.py`) | не создан или не заполнен `tools/.env` | раздел 6.1 |
| `Supabase: POST … → HTTP 4xx` (`upload_audio.py`) | неверный ключ/URL/имя бакета, или файл > 50 МБ | проверить `tools/.env`; ключ — основного проекта |
| `Вход по имени и паролю ещё не настроен на сервере.` (сайт) | у Worker'а нет `SUPABASE_URL`/`SUPABASE_SECRET_KEY` | `docs/SETUP_CLOUDFLARE.md` / `docs/SETUP_LOCAL.md` |
| `База недоступна — попробуйте через минуту.` (сайт) / `База недоступна (нет связи или проект Supabase на паузе).` (лог Worker'а) | нет связи с Supabase или проект **уснул** | панель Supabase → проект: если на паузе — восстановить (кнопка Restore/Resume, название могло измениться); раздел 10 |
| `Неверное имя или пароль.` при правильном пароле | регистр имени; пользователь создан в **другом** проекте (тестовый ↔ основной) | проверить `select username from public.users;` в SQL Editor нужного проекта |
| `Слишком много неверных попыток. Попробуйте через N мин.` | 5 ошибок подряд | подождать 15 мин или раздел 7 (снять блокировку) |
| `npm test` падает на имени миграции | формат имени не `<14 цифр>_<a-z0-9_>.sql` или версия повторяется | переименовать (если миграция ещё **не применена** ни к одному проекту) |
| `npm test` падает «service_role … может читать и писать» | новая таблица создана без прав | проверить, что миграция идёт **после** `20261120130000_…` (default privileges) или добавить `grant` явно |

---

## 10. Лимиты бесплатного плана и «засыпание»

Проверено 2026-11-20 на https://supabase.com/pricing (перепроверять — условия меняются):

| Лимит Free | Значение | У нас |
|---|---|---|
| Файлы Storage | 1 ГБ всего | ~114 МБ (84 mp3) |
| Размер одного файла | ≤ 50 МБ | mp3 ≈ 1–3 МБ |
| Трафик (egress) | 5 ГБ в месяц | ~0.6 ГБ/мес при 5 людях × 3 прослушивания в день (оценка) |
| База | 500 МБ | аккаунты — килобайты |
| Активных проектов | 2 | 2 (основной + тестовый) — третий бесплатно не создать |
| **Пауза** | **проект засыпает после недели без активности** | против этого — `keep-supabase-awake.yml` |

Когда проект спит: **mp3 на сайте не играют, вход не работает** (сайт сам работает — прогресс в браузере).

`.github/workflows/keep-supabase-awake.yml` в понедельник и четверг (06:17 UTC) запрашивает 2 байта mp3 основного проекта
и ждёт `206`. Запустить вручную: GitHub → **Actions** → «Supabase: не засыпать» → **Run workflow**.
**Считается ли такой запрос активностью для Supabase — не проверено.** Тестовый проект этот workflow не будит.

Если mp3 станет больше ~500 МБ — решение пользователя: перенести mp3 на **Backblaze B2** или **Hugging Face** (датасет).
Меняется адрес (`SUPABASE_AUDIO_URL` в `web/src/data/config.ts`) и скрипт загрузки; новое хранилище обязано отдавать `Range` → `206`.

---

## 11. Что ещё не проверено / не сделано

Не проверено:
- считается ли запрос `keep-supabase-awake.yml` к публичному файлу активностью (через неделю посмотреть в панели, не на паузе ли проект);
  тестовый проект ничем не будится и может уснуть — тогда `wrangler dev` не сможет войти (восстановить в панели);
- `npx supabase db dump --remote --data-only` на этом проекте не запускался ни разу; восстановление из дампа не отрабатывалось;
- `db push --remote=<ref>` без `link` (по `--help` должно работать);
- mp3 из Supabase в Safari на iPhone (перемотка, нажатие на предложение) — проверено только в Chrome;
- вход на настоящем сайте после деплоя (на тестовом проекте через `wrangler dev` — работает).

Не сделано (запланировано, `HANDOFF.md` → «План: аккаунты + база прогресса»):
- профиль `#/profile` и админ-панель `#/admin` (шаг 5) — пока пользователи создаются через `tools/create_user.ts` + SQL Editor;
- ключи AI пользователей в `user_ai_keys` — зашифрованные AES-GCM секретом Worker'а `KEYS_SECRET` (шаг 6); таблица уже есть, код — нет;
- дневные лимиты через `use_quota` (5 AI-тестов, озвучка 300 / гость 50) — функция есть, Worker её ещё не вызывает (шаг 6);
- таблицы прогресса (миграция «002_progress» в плане; имя файла — по правилу из 5.1) и синхронизация (шаги 7–8);
- запрос к базе в `keep-supabase-awake.yml` (шаг 9);
- удаление старого входа по кодам `ACCESS_CODES`.

---

## 12. Шпаргалка

```bash
# какой проект привязан
cat supabase/.temp/project-ref; echo

# переключиться
npx supabase link --project-ref llpbzemgndrsupnpbvhp     # тестовый
npx supabase link --project-ref rmbcltczrruvlepsmtwd     # основной

# новая миграция → тест
npx supabase migration new <имя>
cd web && npm test && cd ..

# копия данных → применить → проверить (сначала тестовый, потом основной)
mkdir -p backups
npx supabase db dump --remote --data-only -f backups/main-$(date +%Y-%m-%d).sql
npx supabase db push --remote --dry-run
npx supabase db push --remote
npx supabase migration list --remote

# mp3
python3 tools/upload_audio.py --dry-run
python3 tools/upload_audio.py

# пользователь
node tools/create_user.ts            # админ
node tools/create_user.ts --user     # пользователь  → SQL Editor нужного проекта → Run
```
