# English — сайт для изучения английского (A1 → B1)

Личный сайт: рассказы с караоке-аудио, интервальное повторение слов, грамматика с упражнениями,
тесты уровня, диктант, неправильные глаголы, mp3 со словами. Работает без интернета, на компьютере и на телефоне.
Цель — уверенный B1 за год (≈30–40 минут в день).

**Что внутри:**

| Раздел | Объём |
|---|---|
| Словари | A1 — 702, A2 — 906, B1 — 847 слов |
| Рассказы | 40: 01–10 (~430 слов, A2), 11–20 (~1000 слов, A2+/B1−), 21–40 (~1100–1300 слов, B1); у каждого 10 вопросов и план пересказа |
| Аудио рассказов | 01–20 — 3 нейроголоса (Jenny 🇺🇸, Sonia 🇬🇧, Andrew 🇺🇸) с караоке; 21–40 — голос браузера (тоже с караоке) |
| Грамматика | 40 тем: A1 — 12, A2 — 13, B1 — 15; ≈590 упражнений с автопроверкой |
| Тесты | тест уровня (40 вопросов) + 3 пробных экзамена B1 (по 37 вопросов: грамматика, лексика, чтение, аудирование) |
| Неправильные глаголы | 122 глагола |
| Аудио слов | 24 mp3 по ~100 слов (голос Jenny, пауза для повторения) |

**Разделы сайта:** Сегодня (план на день) · Рассказы · Слова · Грамматика · Практика (тесты, мои ошибки, глаголы, диктант) · Аудио.

## Как открыть

Сайт написан на **Vue 3 + TypeScript** (папка `web/`). Нужны Node.js и Python 3.

**Первый запуск** (например, на новом компьютере):
```bash
python3 tools/build_site_data.py   # данные сайта: web/public/data/*.json
cd web
npm install                        # библиотеки
```

**Каждый день:**
```bash
cd web
npm run dev          # режим разработки: изменения видны сразу
```

Vite покажет адреса:
- **Компьютер:** `http://localhost:5173/`
- **Телефон** (та же Wi-Fi сеть или точка доступа с телефона): `Network: http://192.168.x.x:5173/`

Готовая сборка (как на сервере):
```bash
npm run build        # проверка типов + сборка в web/dist/
npm run preview      # открыть сборку (тоже показывает адрес для телефона)
```

> Если сайт открылся пустым и вверху написано «Не загрузилось: данные …» — запустите `python3 tools/build_site_data.py`.

## Проверки

```bash
cd web
npm run typecheck    # типы TypeScript
npm test             # модульные тесты (Vitest): логика без браузера
npm run test:e2e     # тесты в настоящем браузере (Playwright, используется установленный Chrome)
npm run check        # всё вместе: типы → модульные тесты → сборка → тесты в браузере
```
и проверка контента: `python3 tools/validate_content.py`.

**GitHub Actions** (`.github/workflows/check.yml`) запускает всё это при каждом `push`:
проверка контента → сборка данных → `npm run check`. Если тесты в браузере упали, отчёт Playwright сохраняется во вкладке Actions.

## Деплой

- **Сайт** — папка `web/dist/` (≈1–2 МБ, mp3 туда не попадают) → любой статический хостинг (Render, Cloudflare Pages, Netlify…).
- **mp3** — папка `audio/` целиком → файловое хранилище (например, Cloudflare R2), с теми же подпапками `stories/…` и `words/…`.
- Адрес хранилища — в `web/.env.production` (образец: `web/.env.production.example`):
  `VITE_AUDIO_URL=https://<ваш-бакет>…`  → затем `npm run build`.
- Адреса страниц вида `#/story/...` — серверу не нужна особая настройка.

## Структура

```
EL/
├── content/                 ← всё, что пишется руками
│   ├── vocabulary/          A1.csv, A2.csv, B1.csv — словари; backup/ — копии
│   ├── stories/             <id>/story.txt, words.csv, questions.json — рассказы
│   ├── grammar/             A1/, A2/, B1/ — темы грамматики (JSON)
│   ├── tests/               placement.json, b1_mock_1..3.json — тесты
│   └── irregular_verbs.csv  неправильные глаголы
├── audio/                   ← аудио (на сервере — отдельно)
│   ├── stories/             <id>/jenny.mp3 + jenny.json (время предложений), sonia…, andrew…
│   └── words/               A1/part_01.mp3 … + manifest.json
├── web/                     ← сайт: Vue 3 + TypeScript + Vite
├── tools/                   ← Python-скрипты
└── .github/workflows/       ← автоматические проверки
```

### Код сайта (`web/src/`) — clean architecture

Каждый слой зависит только от слоёв выше по списку:

| Папка | Что внутри | Зависит от |
|---|---|---|
| `domain/` | типы и логика **без Vue**: интервальное повторение, текст рассказа по отметкам слов, «вставь слово», диктант (сравнение по словам), глаголы, «мои ошибки», проверка тестов, разбор теории | — |
| `data/` | хранилище (localStorage или память), загрузка контента, прогресс, адрес аудио, `ai/` — подключение AI | domain |
| `application/` | сценарии: очередь повторения, план на день, «мои ошибки», создание тестов с AI | domain, data |
| `presentation/` | Vue: `pages/`, `components/`, `composables/`, `router.ts` | всё выше |

```
web/src/
├── main.ts                    запуск: загрузка контента → сервисы → Vue
├── App.vue                    шапка + текущая страница (в защитной обёртке)
├── domain/                    types, spacedRepetition, storyText, storyTasks, dictation, verbs, mistakes,
│                              testValidation, markdown, text (+ *.test.ts)
├── data/                      storage, contentRepository, progressRepository, config, ai/aiProvider
├── application/               services, wordReview, todayPlan, mistakesService, aiTests (+ *.test.ts)
├── presentation/
│   ├── router.ts              адреса страниц (#/story/…), страницы грузятся отдельно
│   ├── problems.ts            список сбоев + ?break= для проверки
│   ├── pages/                 Today, Review, Stories, Story, Words, GrammarList, GrammarTopic, Practice,
│   │                          Tests, TestRun, Mistakes, Verbs, Dictation, Audio, NotFound
│   ├── components/            SafeSection, StoryAudioPlayer, BrowserVoiceBar, StoryText, StoryTasks, WordPopover,
│   │                          ExerciseList/Item, MarkdownView, AiSettingsPanel, PlanCard, AppHeader…
│   └── composables/           useServices, useReaderSettings, useBrowserReader, useSentenceAudio, useSpeech
└── styles/                    base, components, pages, mobile
web/e2e/                       тесты в браузере (Playwright)
```

**Слова в рассказах** ищет только Python (`tools/story_words.py`, с учётом форм: went → to go) и записывает готовые отметки в данные сайта.
У одной формы может быть несколько значений (*left* — «левый» и «to leave»): при нажатии на слово показываются все.

### AI для новых тестов (заготовка)

Страница **Практика → Тесты → «Новый тест с помощью AI»**. Выберите сервис (Groq, Google Gemini, OpenRouter — у всех есть бесплатный тариф),
впишите модель и свой ключ API. AI каждый раз составляет новый тест, не повторяя вопросы прошлых; сайт строго проверяет тест перед показом.
- Ключ хранится **только в localStorage вашего браузера** — не в коде и не в git. Запрос идёт прямо из браузера, поэтому используйте личный ключ с лимитами.
- Некоторые сервисы не принимают запросы из браузера (CORS) — тогда понадобится небольшой сервер-посредник.
- Код: `web/src/data/ai/aiProvider.ts` (адаптер; чтобы добавить другой сервис, например платный Claude через официальный SDK `@anthropic-ai/sdk`, напишите ещё один класс с методом `complete()`), сценарий — `web/src/application/aiTests.ts`.

### Защита от сбоев

- `SafeSection.vue` — обёртка: если часть внутри упадёт, на её месте сообщение, остальное работает.
  Ей обёрнуты каждая страница и отдельные части (плеер, текст, задания, теория, упражнения, карточки плана, настройки AI).
- Каждый файл данных грузится отдельно; хранилище при запрете браузера работает в памяти.
- **Аудио рассказа:** нет mp3 / не загрузился / сломан плеер → читает **голос браузера** (бесплатно: Safari — голоса Apple без интернета, Chrome — Google). Караоке работает и так.
- Вверху — предупреждение, что именно не загрузилось.
- Проверка: `?break=player` перед `#` (например `http://localhost:5173/?break=player,markdown#/story/01_weekend_by_the_sea`).

### Скрипты (`tools/`)

Запуск — обычным `python3 tools/<скрипт>.py` из папки `EL`.

| Скрипт | Зачем |
|---|---|
| `paths.py` | **все пути проекта** — при переименовании папок меняйте только его |
| `content.py` | чтение словарей, рассказов, грамматики (общий для всех скриптов) |
| `build_site_data.py` | собирает `web/public/data/*.json` (рассказы с отметками слов, словари, грамматику, тесты, глаголы, аудио) — **запускать после любых изменений** |
| `validate_content.py` | проверка грамматики, вопросов, тестов и глаголов (формат описан в файле) |
| `story_words.py` | поиск словарных слов в тексте (все значения формы) |
| `find_story_words.py` | список слов каждого рассказа → `words.csv` |
| `make_story_audio.py` | озвучка рассказов тремя голосами с таймингами для караоке |
| `make_word_audio.py` | mp3 со словами, по 100 слов в файле |
| `tts.py`, `word_forms.py` | озвучка (edge-tts) и формы слов |

Для озвучки нужно: `pip install edge-tts` и `brew install ffmpeg`. Интернет нужен только во время озвучки.

## Как добавить рассказ

1. Создать папку `content/stories/41_my_story/` с файлами:
   - `story.txt` — первая строка заголовок, потом пустая строка, абзацы через пустую строку;
   - `questions.json` — вопросы (формат — в `tools/validate_content.py`).
2. Выполнить:
   ```bash
   python3 tools/find_story_words.py
   python3 tools/validate_content.py
   python3 tools/build_site_data.py
   python3 tools/make_story_audio.py --only 41     # по желанию: mp3 (без него читает голос браузера)
   ```

## Как добавить тему грамматики или тест

- Тема: `content/grammar/B1/16_my_topic.json`; тест: `content/tests/<id>.json` (форматы — в `tools/validate_content.py`).
- Затем: `python3 tools/validate_content.py && python3 tools/build_site_data.py`

## Как изменить словари

1. Отредактировать `content/vocabulary/A1.csv` (или A2, B1). Формат строки: `english,русский,A1,,` (первая строка — заголовок).
   Перед большими правками сделайте копию в `content/vocabulary/backup/`.
2. Выполнить:
   ```bash
   python3 tools/find_story_words.py --force   # обновить слова в рассказах
   python3 tools/build_site_data.py
   python3 tools/make_word_audio.py            # по желанию: перезаписать mp3 со словами (нужен интернет)
   ```

Прогресс повторения хранится по ключу «уровень|слово», поэтому новые слова просто появятся как новые, а выученные останутся выученными.
