# English — сайт для изучения английского (A1 → B1)

Личный сайт: рассказы с караоке-аудио, интервальное повторение слов, грамматика с упражнениями, mp3 со словами.
Работает без интернета, на компьютере и на телефоне. Цель — уверенный B1 за год (≈30–40 минут в день).

**Что внутри:**

| Раздел | Объём |
|---|---|
| Словари | A1 — 702, A2 — 906, B1 — 847 слов |
| Рассказы | 20: 01–10 (~430 слов, A2), 11–20 (~1000 слов, A2+/B1−); у каждого 10 вопросов и план пересказа |
| Аудио рассказов | 3 голоса (Jenny 🇺🇸, Sonia 🇬🇧, Andrew 🇺🇸) с караоке-подсветкой предложений |
| Грамматика | 40 тем: A1 — 12, A2 — 13, B1 — 15; ≈590 упражнений с автопроверкой |
| Аудио слов | 24 mp3 по ~100 слов (голос Jenny, пауза для повторения) |

## Как открыть

Сайт написан на **Vue 3 + TypeScript** (папка `web/`). Нужны Node.js и Python 3.

**Первый запуск** (например, на новом компьютере):
```bash
python3 tools/build_site_data.py   # данные сайта: web/public/data/*.json (в git не хранятся)
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
- **Телефон** (та же Wi-Fi сеть): `Network: http://192.168.x.x:5173/`

Готовая сборка (как на сервере):
```bash
npm run build        # проверка типов + сборка в web/dist/
npm run preview      # открыть сборку (тоже показывает адрес для телефона)
```

Проверки: `npm run typecheck` (типы), `npm test` (модульные тесты).

> Если сайт открылся пустым и вверху написано «Не загрузилось: данные …» — запустите `python3 tools/build_site_data.py`.

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
│   └── grammar/             A1/, A2/, B1/ — темы грамматики (JSON)
├── audio/                   ← сгенерированное аудио (на сервере — отдельно)
│   ├── stories/             <id>/jenny.mp3 + jenny.json (время предложений), sonia…, andrew…
│   └── words/               A1/part_01.mp3 … + manifest.json
├── web/                     ← сайт: Vue 3 + TypeScript + Vite
├── site/                    ← старая версия сайта (без сборки) — можно удалить после перехода
└── tools/                   ← Python-скрипты
```

### Код сайта (`web/src/`) — clean architecture

Каждый слой зависит только от слоёв выше по списку:

| Папка | Что внутри | Зависит от |
|---|---|---|
| `domain/` | типы и логика **без Vue**: интервальное повторение, формы слов (went → to go), задание «вставь слово», разбор теории | — |
| `data/` | хранилище (localStorage или память), загрузка контента, прогресс пользователя, адрес аудио | domain |
| `application/` | сценарии: очередь повторения, план на день | domain, data |
| `presentation/` | Vue: `pages/` (страницы), `components/`, `composables/`, `router.ts` | всё выше |

Тесты лежат рядом с кодом (`*.test.ts`) и проверяют domain и application без браузера.

```
web/src/
├── main.ts                    запуск: загрузка контента → сервисы → Vue
├── App.vue                    шапка + текущая страница (в защитной обёртке)
├── domain/                    types, spacedRepetition, wordForms, storyTasks, markdown, text (+ domain.test.ts)
├── data/                      storage, contentRepository, progressRepository, config (адрес аудио)
├── application/               wordReview, todayPlan, services (+ application.test.ts)
├── presentation/
│   ├── router.ts              адреса страниц (#/story/…), страницы грузятся отдельно
│   ├── problems.ts            список сбоев + ?break= для проверки
│   ├── pages/                 Today, Review, Stories, Story, Words, GrammarList, GrammarTopic, Audio, NotFound
│   ├── components/            SafeSection, StoryAudioPlayer, BrowserVoiceBar, StoryText, StoryTasks,
│   │                          ExerciseList/Item, MarkdownView, WordPopover, PlanCard, AppHeader…
│   └── composables/           useServices, useReaderSettings, useBrowserReader, useSpeech
└── styles/                    base, components, pages, mobile
```

### Защита от сбоев

- `SafeSection.vue` — обёртка: если часть внутри упадёт, на её месте сообщение, остальное работает.
  Ей обёрнуты каждая страница и отдельные части (плеер, текст, задания, теория, упражнения, карточки плана).
- Каждый файл данных грузится отдельно; хранилище при запрете браузера работает в памяти.
- **Аудио рассказа:** нет mp3 / не загрузился / сломан плеер → читает **голос браузера** (бесплатно: Safari — голоса Apple без интернета, Chrome — Google). Караоке работает и так.
- Вверху — предупреждение, что именно не загрузилось.
- Проверка: `?break=player` перед `#` (например `http://localhost:5173/?break=player,markdown#/story/01_weekend_by_the_sea`).

### Скрипты (`tools/`)

| Скрипт | Зачем |
|---|---|
| `paths.py` | **все пути проекта** — при переименовании папок меняйте только его |
| `content.py` | чтение словарей, рассказов, грамматики (общий для всех скриптов) |
| `build_site_data.py` | собирает `web/public/data/*.json` (и данные старого сайта) — **запускать после любых изменений** |
| `validate_content.py` | проверка формата грамматики и вопросов (формат описан в файле) |
| `find_story_words.py` | находит слова из словарей в рассказах → `words.csv` |
| `make_story_audio.py` | озвучка рассказов тремя голосами с таймингами для караоке |
| `make_word_audio.py` | mp3 со словами, по 100 слов в файле |
| `serve.py` | сервер для старого сайта (`site/`); для нового — `npm run dev` |
| `tts.py`, `word_forms.py` | озвучка (edge-tts) и формы слов |

Запуск — обычным `python3 tools/<скрипт>.py` из папки `EL`.
Для озвучки нужно: `pip install edge-tts` и `brew install ffmpeg`. Интернет нужен только во время озвучки.

## Как добавить рассказ

1. Создать папку `content/stories/21_my_story/` с файлами:
   - `story.txt` — первая строка заголовок, потом пустая строка, абзацы через пустую строку;
   - `questions.json` — вопросы (формат — в `tools/validate_content.py`).
2. Выполнить:
   ```bash
   python3 tools/find_story_words.py
   python3 tools/validate_content.py
   python3 tools/make_story_audio.py      # сам запустит build_site_data.py
   ```

## Как добавить тему грамматики

Положить `content/grammar/B1/16_my_topic.json` (формат — в `tools/validate_content.py`), затем:
```bash
python3 tools/validate_content.py && python3 tools/build_site_data.py
```

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
