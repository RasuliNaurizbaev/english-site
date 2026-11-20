# Смена адреса сайта (Cloudflare) или проекта Supabase — что делать

Документ для случаев «поменялся адрес сайта», «переименовали Worker», «нужен свой домен»,
«переименовали проект Supabase», «переезжаем на другой проект Supabase», «нужен другой бакет».
Общая настройка — в [SETUP_CLOUDFLARE.md](SETUP_CLOUDFLARE.md), [SETUP_SUPABASE.md](SETUP_SUPABASE.md), [SETUP_LOCAL.md](SETUP_LOCAL.md).

> Места в панелях Cloudflare и Supabase, в которых нет уверенности, помечены «(название пункта могло измениться)» —
> интерфейс сервисов меняется. Пункты «не проверялось» — сначала пробуйте на тестовом проекте.

---

## 0. Главное, что нужно знать заранее

### Прогресс и вход привязаны к адресу сайта
Браузер хранит данные **отдельно для каждого адреса** (origin = протокол + домен). На новом адресе браузер «не знает» старых данных:

| Что | Где хранится | Что будет на новом адресе |
|---|---|---|
| Прогресс (карточки слов, рассказы, грамматика, «Мои слова», настройки) | localStorage браузера | **пусто** — перенести резервной копией (ниже) |
| mp3 «Моих слов» | IndexedDB браузера | **пусто** — пересоздать кнопкой «🎙 Сделать mp3» (в резервную копию не входят) |
| Свои ключи AI гостя | localStorage | **пусто** — ввести заново |
| Вход (cookie `el_session`, старый код — `el_access`) | cookie сайта | **не вошли** — войти заново (аккаунт и пароль те же — они в Supabase) |
| Аккаунты, пароли | Supabase (база) | не меняются |
| mp3 рассказов и слов | Supabase Storage | не меняются |

Пока прогресс не переехал в базу (план в HANDOFF), **смена адреса сайта = каждый переносит прогресс файлом**:

1. **На СТАРОМ адресе:** «Сегодня» → «💾 Резервная копия прогресса» → «Сохранить в файл».
2. **На НОВОМ адресе:** то же место → «Загрузить из файла» → выбрать файл → подтвердить.

Поэтому старый адрес **не выключать сразу** — дайте людям время сохранить файл (см. способ Б ниже).

### Что от чего зависит

| Идентификатор | Пример | Где зашит |
|---|---|---|
| Имя Worker'а | `open-english-for-beginner` | `web/wrangler.jsonc` (`"name"`) — **должно совпадать** с именем Worker'а в Cloudflare, иначе сборка из GitHub падает; тексты README/HANDOFF/docs |
| Поддомен аккаунта Cloudflare | `rasuli-naurizbaev` | нигде в коде; только тексты README/HANDOFF/docs |
| Адрес сайта | `https://<имя Worker'а>.<поддомен>.workers.dev` | нигде в коде (сайт использует относительные адреса `/api`, `data/…`) |
| Ref основного проекта Supabase | `rmbcltczrruvlepsmtwd` | `web/src/data/config.ts` (`SUPABASE_AUDIO_URL`), `.github/workflows/keep-supabase-awake.yml`, `web/e2e/learning.spec.ts` (проверка адреса mp3), `tools/.env.example`, `web/wrangler.jsonc` (комментарий), секрет Cloudflare `SUPABASE_URL`, свой `tools/.env`, тексты |
| Ref тестового проекта | `llpbzemgndrsupnpbvhp` | только свой `web/.dev.vars`, комментарий `web/wrangler.jsonc`, тексты |
| Имя бакета | `mp3 audios` (в адресе `mp3%20audios`) | те же файлы, что ref основного + `tools/upload_audio.py` (пример в шапке), свой `tools/.env` (`SUPABASE_BUCKET`) |
| Название проекта Supabase | «english-test» | **нигде** — только подпись в панели |

Найти все упоминания перед любой сменой (из папки `EL`):
```bash
grep -rn "open-english-for-beginner\|rasuli-naurizbaev" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
grep -rn "rmbcltczrruvlepsmtwd\|llpbzemgndrsupnpbvhp\|mp3%20audios\|mp3 audios" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git .
```

---

## 1. Cloudflare: сменился адрес сайта

### Случай 1.1. Сменили поддомен аккаунта (`rasuli-naurizbaev.workers.dev` → другой)
Поддомен общий для всех Worker'ов аккаунта; меняется в панели: Workers & Pages → раздел с поддоменом `workers.dev` → Change
(название пункта могло измениться). Код и `wrangler.jsonc` **не меняются**.

1. **До смены** — предупредить всех: сохранить резервную копию прогресса (раздел 0). После смены старый адрес перестанет открываться сразу.
2. Сменить поддомен в панели. Новый адрес: `https://open-english-for-beginner.<новый-поддомен>.workers.dev`.
3. Проверить новый адрес по чек-листу [SETUP_CLOUDFLARE.md → «Проверка после деплоя»](SETUP_CLOUDFLARE.md).
4. Всем: открыть новый адрес → загрузить резервную копию → войти заново (👤).
5. Обновить тексты (адрес): `README.md`, `HANDOFF.md`, `docs/*.md` (команда `grep` из раздела 0) → коммит.

### Случай 1.2. Сменить имя Worker'а (`open-english-for-beginner` → другое)
Адрес станет `https://<новое-имя>.<поддомен>.workers.dev`. Два способа.

**Способ А — переименовать существующий Worker** (проще; старый адрес перестаёт работать сразу):
1. Всех предупредить: резервная копия прогресса на старом адресе.
2. Панель Cloudflare → Worker → Settings → General → Name → новое имя (название пункта могло измениться;
   если переименования нет — используйте способ Б). Секреты, переменные и подключение к GitHub остаются у Worker'а.
3. Сразу же в репозитории `web/wrangler.jsonc`: `"name": "<новое-имя>"` (+ комментарий с адресом) → коммит → push → PR → merge.
   Пока имя в `wrangler.jsonc` не совпадает с именем в Cloudflare, **сборка из GitHub падает** (поэтому шаги 2 и 3 — подряд).
4. Проверить новый адрес (чек-лист), обновить тексты.

**Способ Б — новый Worker рядом со старым** (старый адрес какое-то время работает — люди успеют сохранить прогресс):
1. В репозитории: `web/wrangler.jsonc` → `"name": "<новое-имя>"` → коммит → push в `development` (в `main` пока не сливать).
2. Cloudflare → Create → Worker → Import a repository → тот же репозиторий; настройки сборки — как в
   [SETUP_CLOUDFLARE.md → «Настройка с нуля»](SETUP_CLOUDFLARE.md) (Root `web`, Build `npm run build:pages`, ветка `main`), имя — новое.
3. **Задать новому Worker'у все секреты заново** — секреты принадлежат Worker'у и не копируются:
   `GEMINI_API_KEY`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, (`ACCESS_CODES`, пока он есть), необязательные `GEMINI_MODEL`, `GROQ_MODEL`.
   Значения — из менеджера паролей (Cloudflare их назад не показывает). Команды — из папки `web` в **обычном Терминале**:
   ```bash
   npx wrangler secret put GEMINI_API_KEY --name <новое-имя>
   npx wrangler secret put GROQ_API_KEY --name <новое-имя>
   npx wrangler secret put SUPABASE_URL --name <новое-имя>
   npx wrangler secret put SUPABASE_SECRET_KEY --name <новое-имя>
   npx wrangler secret list --name <новое-имя>       # только имена — проверить, что все на месте
   ```
4. Слить в `main` → новый Worker собирается и деплоится. **Старый Worker перестанет собираться** (имя в `wrangler.jsonc` уже другое) —
   это нормально: он «заморожен» на последней версии и продолжает работать. Чтобы в нём не копились красные сборки —
   отключить у старого Worker'а подключение к GitHub: Settings → Build → Disconnect (название пункта могло измениться).
5. Проверить новый адрес (чек-лист). Всем: перенести прогресс файлом, войти заново.
6. Через 1–2 недели старый Worker удалить (Settings → Delete) или заменить страницей «Сайт переехал на <новый адрес>».
7. Обновить тексты (адрес и имя): README, HANDOFF, docs.

### Случай 1.3. Свой домен (например, `english.example.com`)
Нужен домен, добавленный в Cloudflare (DNS на Cloudflare). Регистрация домена — платная, у регистратора.
1. Cloudflare → Add a domain → следовать мастеру (сменить NS-серверы у регистратора) — пока домен не «Active», дальше не идти.
2. Worker → Settings → Domains & Routes → Add → Custom domain → `english.example.com` (название пункта могло измениться).
   Сертификат https выдаётся сам. Адрес `*.workers.dev` при этом **продолжает работать** — это другой адрес (свой localStorage).
3. Решить, какой адрес главный, и **перенести прогресс один раз** (раздел 0). Не пользоваться двумя адресами вперемешку — прогресс разъедется.
4. Код менять не нужно (cookie без `Domain`, адреса относительные; `Secure` включается сам по https).
   По желанию — отключить `workers.dev`: Settings → Domains & Routes → workers.dev → Disable.
5. Обновить тексты (адрес), README → «Деплой».

### После любой смены адреса (Cloudflare) — проверить
- [ ] новый адрес открывается; `…/api/session` отвечает JSON
- [ ] вход 👤 по имени и паролю; «Выйти»
- [ ] рассказ 01: mp3 играет и перематывается (mp3 из Supabase — от адреса сайта не зависят)
- [ ] «✨ Создать тест»; «Аудио → Мои» → «🎙 Сделать mp3»
- [ ] резервная копия загружается на новом адресе
- [ ] предпросмотр веток: адрес тоже сменился (`<ветка>-<имя Worker'а>.<поддомен>.workers.dev`)
- [ ] тексты: README, HANDOFF, docs — без старого адреса (команда `grep` из раздела 0)

---

## 2. Supabase: сменились проект, бакет или имя

### Случай 2.1. Переименовали проект в панели (Project name, например «english-test» → «english-staging»)
**Ничего делать не нужно.** Название — только подпись. Ref (`llpbzemgndrsupnpbvhp`), адрес `https://<ref>.supabase.co`,
ключи, база и файлы — те же. По желанию — поправить название в документах.

### Случай 2.2. Ref и адрес `https://<ref>.supabase.co`
**Ref поменять нельзя** — он выдаётся при создании проекта. Новый ref = новый проект (случай 2.4).
Свой домен для Supabase (`db.example.com`) — платная функция (проверьте на supabase.com/pricing); на бесплатном плане — нет.

### Случай 2.3. Другой бакет для mp3 (новое имя, например `mp3-audios` без пробела)
Переименовать бакет в Supabase нельзя (на 2026-11; проверьте в панели) — создаётся новый, mp3 загружаются заново.
1. Supabase (основной проект) → Storage → New bucket → имя → **Public bucket** → Create.
   Проверка: `curl -s "https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/<бакет>/x.mp3"` → «Object not found» (а не «Bucket not found»).
2. `tools/.env` → `SUPABASE_BUCKET=<новый бакет>`; загрузить:
   ```bash
   python3 tools/upload_audio.py --dry-run     # «Загрузить: 84 …»
   python3 tools/upload_audio.py               # в конце — новый адрес для сайта (VITE_AUDIO_URL)
   ```
   Нужна полная папка `audio/` с mp3 (после свежего clone — см. SETUP_LOCAL.md → «mp3 после clone»).
3. Поменять адрес в репозитории (пробел в имени = `%20`):
   - `web/src/data/config.ts` → `SUPABASE_AUDIO_URL`
   - `.github/workflows/keep-supabase-awake.yml` → `url=…`
   - `web/e2e/learning.spec.ts` → регулярное выражение с адресом mp3 (тест караоке)
   - `tools/.env.example` → `SUPABASE_BUCKET`
   - тексты: README, HANDOFF, docs
4. `cd web && npm run check` → коммит → push → PR → merge. Проверить рассказ 01 (mp3, перемотка `Range` → `206`).
5. Когда сайт работает с новым бакетом — старый удалить (Storage → бакет → Delete), чтобы не занимать 1 ГБ.

### Случай 2.4. Переезд на НОВЫЙ проект Supabase (новый ref)
Когда: старый проект удалён/сломан, нужен другой регион или другой аккаунт.

⚠ **Бесплатно — 2 активных проекта.** Если заняты основным и тестовым: временно приостановить тестовый
(Project Settings → General → Pause project, название пункта могло измениться) или удалить его и создать тестовый заново позже.

**Сначала — репетиция на тестовом проекте** (не проверялось на деле — порядок ниже выверен по документации, но не пройден).

1. **Новый проект:** supabase.com/dashboard → New project → имя, **пароль базы — сразу в менеджер паролей**, регион, Free.
   Записать новый ref (из адреса страницы `…/project/<ref>`). Ключи: Project Settings → API Keys → Secret key (`sb_secret_…`).
2. **Структура базы** (все миграции, включая права для `service_role`):
   ```bash
   cd ~/Desktop/work/learn/CT/EL
   npx supabase link --project-ref <новый ref>
   npx supabase db push --remote          # строка Target: — новый проект!
   npx supabase migration list --remote   # у всех миграций заполнены Local и Remote
   ```
3. **Данные базы** (аккаунты; дальше — и прогресс). Два пути:
   - **Мало пользователей (сейчас так) — проще:** заново создать админа и пользователей: `node tools/create_user.ts` (`--user`) →
     SQL Editor **нового** проекта. Пароли можно задать те же. Сессии не переносятся — все войдут заново.
   - **Перенести всё** (не проверялось): со старого проекта
     ```bash
     npx supabase link --project-ref <старый ref>
     npx supabase db dump --remote --data-only -f backups/move-$(date +%F).sql
     ```
     затем загрузить в новый через `psql` (установить: `brew install libpq` → `brew link --force libpq`; строка подключения —
     кнопка Connect в панели нового проекта, название могло измениться):
     ```bash
     psql "<строка подключения нового проекта>" -f backups/move-YYYY-MM-DD.sql
     psql "<строка подключения нового проекта>" -c "select setval(pg_get_serial_sequence('public.users','id'), coalesce((select max(id) from public.users), 1));"
     ```
     Вторая команда — чтобы новые пользователи не получили занятый `id`. Таблицы в новом проекте должны быть пустыми.
     Папка `backups/` не попадает в git (там хеши паролей) — после переезда удалить.
4. **Storage:** в новом проекте создать публичный бакет (случай 2.3, шаг 1) и загрузить mp3: в `tools/.env` новые
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (и `SUPABASE_BUCKET`) → `python3 tools/upload_audio.py --dry-run` → без `--dry-run`.
5. **Секреты Cloudflare** (основной Worker, из папки `web`, обычный Терминал):
   ```bash
   npx wrangler secret put SUPABASE_URL           # https://<новый ref>.supabase.co
   npx wrangler secret put SUPABASE_SECRET_KEY    # sb_secret_… нового проекта (НЕ publishable)
   ```
   Секрет меняется сразу — **с этого момента сайт входит через новую базу**, поэтому шаги 2–3 должны быть уже сделаны.
6. **Репозиторий** — новый ref в: `web/src/data/config.ts` (`SUPABASE_AUDIO_URL`), `.github/workflows/keep-supabase-awake.yml`,
   `web/e2e/learning.spec.ts`, `tools/.env.example`, комментарий `web/wrangler.jsonc`, README, HANDOFF, docs →
   `cd web && npm run check` → коммит → push → PR → merge (иначе mp3 будут браться из старого проекта).
7. **Проверка:** вход 👤, рассказ 01 (mp3 + перемотка), «✨ Создать тест», «🎙 Сделать mp3»; GitHub → Actions →
   «Supabase: не засыпать» → Run workflow → зелёный (теперь «будит» новый проект).
8. **Старый проект** не удалять 1–2 недели (на случай отката: вернуть секреты Cloudflare и адрес в `config.ts`).
   Потом: Project Settings → General → Delete project. Перед удалением — последний бэкап `db dump --remote` в `backups/`.

### Случай 2.5. Новый тестовый проект (ref тестового сменился)
Тестовый используется только локально (`wrangler dev`) и для репетиции миграций:
1. Создать проект, `link` → `db push --remote`, создать себе админа (`create_user.ts` → SQL Editor).
2. `web/.dev.vars` → `SUPABASE_URL=https://<новый ref>.supabase.co`, `SUPABASE_SECRET_KEY=<секретный ключ>`.
3. Обновить ref в комментарии `web/wrangler.jsonc` и документах. На сайт это не влияет.

### Случай 2.6. Ключи Supabase сменились (утечка, новый secret key)
Ref и адрес те же — менять только значения:
- основной проект: секрет Cloudflare `SUPABASE_SECRET_KEY`, свой `tools/.env`;
- тестовый: `web/.dev.vars`.
Затем старый ключ удалить в панели (Project Settings → API Keys). Новое значение — в менеджер паролей.

---

## 3. Шпаргалка «что поменять» по случаям

| Случай | `wrangler.jsonc` | секреты Cloudflare | `config.ts` | keep-alive | e2e тест | `tools/.env(.example)` | `.dev.vars` | данные / mp3 | люди |
|---|---|---|---|---|---|---|---|---|---|
| 1.1 поддомен Cloudflare | — | — | — | — | — | — | — | — | резервная копия, вход заново |
| 1.2 имя Worker'а | `name` | А: остаются; Б: **все заново** | — | — | — | — | — | — | резервная копия, вход заново |
| 1.3 свой домен | — | — | — | — | — | — | — | — | резервная копия, вход заново |
| 2.1 название проекта Supabase | — | — | — | — | — | — | — | — | — |
| 2.3 новый бакет | — | — | адрес | адрес | адрес | `SUPABASE_BUCKET` | — | mp3 заново | — |
| 2.4 новый основной проект | комментарий | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | адрес | адрес | адрес | всё | — | миграции + аккаунты + mp3 | вход заново |
| 2.5 новый тестовый | комментарий | — | — | — | — | — | URL + ключ | миграции + админ | — |
| 2.6 новые ключи | — | `SUPABASE_SECRET_KEY` | — | — | — | ключ | ключ | — | — |

Всегда в конце: `grep` из раздела 0 (старые значения не должны остаться), `cd web && npm run check`, коммит, чек-лист после деплоя.
