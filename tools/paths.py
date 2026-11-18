"""Все пути проекта в одном месте.

Если переименовываете папку — меняйте только этот файл.

    EL/
    ├── content/              всё, что пишется руками
    │   ├── vocabulary/       A1.csv, A2.csv, B1.csv (+ backup/)
    │   ├── stories/          <id>/story.txt, words.csv, questions.json
    │   └── grammar/          <LEVEL>/<NN>_<slug>.json
    ├── audio/                всё сгенерированное аудио
    │   ├── stories/          <id>/<voice>.mp3 + <voice>.json (время предложений)
    │   └── words/            <LEVEL>/part_NN.mp3 + manifest.json
    ├── web/                  сайт: Vue + TypeScript (web/public/data — данные)
    ├── site/                 старый сайт (до перехода на Vue)
    └── tools/                эти скрипты
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CONTENT = ROOT / "content"
VOCABULARY_DIR = CONTENT / "vocabulary"
STORIES_DIR = CONTENT / "stories"
GRAMMAR_DIR = CONTENT / "grammar"

AUDIO = ROOT / "audio"
STORY_AUDIO_DIR = AUDIO / "stories"
WORD_AUDIO_DIR = AUDIO / "words"
WORD_AUDIO_MANIFEST = WORD_AUDIO_DIR / "manifest.json"

SITE = ROOT / "site"                     # старый сайт (до перехода на Vue)
SITE_DATA_DIR = SITE / "data"

WEB = ROOT / "web"                       # новый сайт: Vue + TypeScript
WEB_DATA_DIR = WEB / "public" / "data"   # JSON для нового сайта (создаёт build_site_data.py)

LEVELS = ["A1", "A2", "B1"]

# Файлы внутри папки рассказа
STORY_TEXT = "story.txt"
STORY_WORDS = "words.csv"
STORY_QUESTIONS = "questions.json"


def vocabulary_file(level):
    return VOCABULARY_DIR / f"{level}.csv"


def story_ids():
    """Все рассказы по порядку: ['01_weekend_by_the_sea', ...]."""
    return sorted(d.name for d in STORIES_DIR.iterdir() if (d / STORY_TEXT).exists())


def story_dir(story_id):
    return STORIES_DIR / story_id


def story_audio_dir(story_id):
    return STORY_AUDIO_DIR / story_id


def audio_relative(path):
    """Путь к mp3 относительно папки audio/ (например stories/01_x/jenny.mp3) — новый сайт добавляет к нему адрес хранилища."""
    return Path(path).resolve().relative_to(AUDIO).as_posix()


def url_from_site(path):
    """Путь к файлу так, как его видит страница site/index.html (например ../audio/words/A1/part_01.mp3)."""
    return "../" + Path(path).resolve().relative_to(ROOT).as_posix()
