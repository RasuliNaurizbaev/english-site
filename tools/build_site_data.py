#!/usr/bin/env python3
"""Собирает весь контент в web/public/data/*.json (сайт на Vue) и site/data/*.js (старый сайт).

    python3 tools/build_site_data.py

Запускайте после любых изменений в content/ или audio/.
(Сайт можно открыть и двойным щелчком, без сервера, поэтому данные лежат в .js, а не читаются из файлов.)
"""
import json

import content
import paths

VOICE_ORDER = ["jenny", "sonia", "andrew"]
VOICE_LABELS = {"jenny": "Jenny 🇺🇸", "sonia": "Sonia 🇬🇧", "andrew": "Andrew 🇺🇸"}


def write_data_file(name, variable, data):
    """Пишет данные для обоих сайтов: web/public/data/<name>.json (Vue) и site/data/<name>.js (старый)."""
    paths.WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (paths.WEB_DATA_DIR / name.replace(".js", ".json")).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    old_site_data = json.loads(json.dumps(data))           # копия: старому сайту нужны пути вида ../audio/...
    add_old_site_urls(old_site_data)
    paths.SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    js = (f"// Создано tools/build_site_data.py — не редактируйте вручную.\n"
          f"window.{variable} = {json.dumps(old_site_data, ensure_ascii=False)};\n")
    (paths.SITE_DATA_DIR / name).write_text(js, encoding="utf-8")


def add_old_site_urls(data):
    """В данных хранится путь относительно audio/ — старому сайту нужен ../audio/<путь>."""
    if isinstance(data, dict):
        if "src" in data and isinstance(data["src"], str):
            data["src"] = "../audio/" + data["src"]
        for value in data.values():
            add_old_site_urls(value)
    elif isinstance(data, list):
        for value in data:
            add_old_site_urls(value)


# ---------------------------------------------------------------- рассказы

def story_audio(story_id, sentence_count):
    """Записи рассказа разными голосами. Тайминги берём, только если они совпадают с текстом."""
    tracks = []
    folder = paths.story_audio_dir(story_id)
    for mp3 in sorted(folder.glob("*.mp3")) if folder.exists() else []:
        voice = mp3.stem
        timing_file = mp3.with_suffix(".json")
        timings = None
        if timing_file.exists():
            segments = json.loads(timing_file.read_text(encoding="utf-8")).get("segments", [])
            if len(segments) == sentence_count + 1:          # заголовок + все предложения
                timings = segments
        tracks.append({"voice": voice, "label": VOICE_LABELS.get(voice, voice.capitalize()),
                       "src": paths.audio_relative(mp3), "timings": timings})
    tracks.sort(key=lambda t: VOICE_ORDER.index(t["voice"]) if t["voice"] in VOICE_ORDER else 99)
    return tracks


def build_stories():
    stories = []
    for story_id in paths.story_ids():
        title, paragraphs = content.read_story(story_id)
        sentences = [s for p in paragraphs for s in p]
        stories.append({
            "id": story_id,
            "title": title,
            "paragraphs": paragraphs,
            "words": content.read_word_list(paths.story_dir(story_id) / paths.STORY_WORDS),
            "audio": story_audio(story_id, len(sentences)),
            "questions": content.read_questions(story_id),
            "wordCount": sum(len(s.split()) for s in sentences),
        })
    write_data_file("stories.js", "STORIES", stories)
    print(f"Рассказы: {len(stories)}")
    for s in stories:
        karaoke = sum(1 for t in s["audio"] if t["timings"])
        print(f"  {s['id']}: {s['wordCount']} слов, из словаря {len(s['words'])}, "
              f"голосов {len(s['audio'])} (караоке {karaoke}), вопросы {'да' if s['questions'] else 'нет'}")


# ---------------------------------------------------------------- словари, аудио слов, грамматика

def build_vocabulary():
    vocabulary = {level: [[row[0].strip(), row[1].strip()] for row in content.read_vocabulary(level)]
                  for level in paths.LEVELS if paths.vocabulary_file(level).exists()}
    write_data_file("words.js", "WORDS", vocabulary)
    print("Словари: " + ", ".join(f"{level}={len(words)}" for level, words in vocabulary.items()))


def build_word_audio():
    manifest = {}
    if paths.WORD_AUDIO_MANIFEST.exists():
        manifest = json.loads(paths.WORD_AUDIO_MANIFEST.read_text(encoding="utf-8"))
    for level, parts in manifest.items():
        parts[:] = [p for p in parts if (paths.WORD_AUDIO_DIR / p["file"]).exists()]
        for part in parts:
            part["src"] = paths.audio_relative(paths.WORD_AUDIO_DIR / part["file"])
    write_data_file("audio.js", "AUDIO", manifest)
    print("Аудио слов: " + (", ".join(f"{level}={len(p)} mp3" for level, p in manifest.items()) or "нет"))


def build_grammar():
    topics, broken = [], []
    for path in content.grammar_files():
        try:
            topic = json.loads(path.read_text(encoding="utf-8"))
            topic["id"] = content.grammar_id(path)   # id всегда по имени файла
            topics.append(topic)
        except Exception as error:
            broken.append(f"{path.name}: {error}")
    write_data_file("grammar.js", "GRAMMAR", topics)
    print(f"Грамматика: {len(topics)} тем" + (f"; с ошибками (пропущены): {broken}" if broken else ""))


if __name__ == "__main__":
    build_stories()
    build_vocabulary()
    build_word_audio()
    build_grammar()
