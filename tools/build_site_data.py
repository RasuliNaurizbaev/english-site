#!/usr/bin/env python3
"""Собирает весь контент в web/public/data/*.json для сайта.

    python3 tools/build_site_data.py

Запускайте после любых изменений в content/ или audio/.
"""
import csv
import json

import content
import paths
from story_words import WordFinder

VOICE_ORDER = ["jenny", "sonia", "andrew"]
VOICE_LABELS = {"jenny": "Jenny 🇺🇸", "sonia": "Sonia 🇬🇧", "andrew": "Andrew 🇺🇸"}


def write_data_file(name, data):
    """Сохраняет данные сайта в web/public/data/<name>."""
    paths.WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (paths.WEB_DATA_DIR / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------- рассказы

def story_audio(story_id, sentence_count):
    """Записи рассказа разными голосами. Тайминги берём, только если они совпадают с текстом.

    Запись = файл <голос>.json (его создаёт make_story_audio.py вместе с <голос>.mp3). mp3 в git нет —
    они в Supabase Storage (upload_audio.py), поэтому ищем по json: данные одинаковы с mp3 на диске и без них.
    """
    tracks = []
    folder = paths.story_audio_dir(story_id)
    for timing_file in sorted(folder.glob("*.json")) if folder.exists() else []:
        mp3 = timing_file.with_suffix(".mp3")
        voice = mp3.stem
        warn_if_missing(mp3)
        timings = None
        segments = json.loads(timing_file.read_text(encoding="utf-8")).get("segments", [])
        if len(segments) == sentence_count + 1:              # заголовок + все предложения
            timings = segments
        tracks.append({"voice": voice, "label": VOICE_LABELS.get(voice, voice.capitalize()),
                       "src": paths.audio_relative(mp3), "timings": timings})
    tracks.sort(key=lambda t: VOICE_ORDER.index(t["voice"]) if t["voice"] in VOICE_ORDER else 99)
    return tracks


def warn_if_missing(mp3):
    """На компьютере (папка audio/ с mp3) — предупредить о забытом mp3. В CI mp3 нет совсем — молчим."""
    if any(paths.AUDIO.rglob("*.mp3")) and not mp3.exists():
        print("⚠ Нет mp3 (на сайте не будет играть): " + paths.audio_relative(mp3))


def mark_words(sentences, finder):
    """Отмечает словарные слова в предложениях.

    Возвращает (words, marks):
      words — словарные записи рассказа [{en, ru, level}, ...]
      marks — [[номер предложения, начало, длина, [номера записей в words]], ...]
              (у формы может быть несколько значений: left → «левый» и «to leave»)
    """
    words, index_of = [], {}
    marks = []
    for number, sentence in enumerate(sentences):
        for start, length, rows in finder.find(sentence):
            meaning_ids = []
            for row in rows:
                key = (row[2], row[0])
                if key not in index_of:
                    index_of[key] = len(words)
                    words.append({"en": row[0].strip(), "ru": row[1].strip(), "level": row[2].strip()})
                meaning_ids.append(index_of[key])
            marks.append([number, start, length, meaning_ids])
    return words, marks


def build_stories():
    finder = WordFinder()
    stories = []
    for story_id in paths.story_ids():
        title, paragraphs = content.read_story(story_id)
        sentences = [s for p in paragraphs for s in p]
        words, marks = mark_words(sentences, finder)
        stories.append({
            "id": story_id,
            "title": title,
            "paragraphs": paragraphs,
            "words": words,
            "marks": marks,
            "audio": story_audio(story_id, len(sentences)),
            "questions": content.read_questions(story_id),
            "wordCount": sum(len(s.split()) for s in sentences),
        })
    write_data_file("stories.json", stories)
    print(f"Рассказы: {len(stories)}")
    for s in stories:
        karaoke = sum(1 for t in s["audio"] if t["timings"])
        print(f"  {s['id']}: {s['wordCount']} слов, из словаря {len(s['words'])} (отметок {len(s['marks'])}), "
              f"голосов {len(s['audio'])} (караоке {karaoke}), вопросы {'да' if s['questions'] else 'нет'}")


# ---------------------------------------------------------------- словари, аудио слов, грамматика

def build_vocabulary():
    vocabulary = {level: [[row[0].strip(), row[1].strip()] for row in content.read_vocabulary(level)]
                  for level in paths.LEVELS if paths.vocabulary_file(level).exists()}
    write_data_file("words.json", vocabulary)
    print("Словари: " + ", ".join(f"{level}={len(words)}" for level, words in vocabulary.items()))


def build_word_audio():
    manifest = {}
    if paths.WORD_AUDIO_MANIFEST.exists():
        manifest = json.loads(paths.WORD_AUDIO_MANIFEST.read_text(encoding="utf-8"))
    for level, parts in manifest.items():
        for part in parts:
            warn_if_missing(paths.WORD_AUDIO_DIR / part["file"])
            part["src"] = paths.audio_relative(paths.WORD_AUDIO_DIR / part["file"])
    write_data_file("audio.json", manifest)
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
    write_data_file("grammar.json", topics)
    print(f"Грамматика: {len(topics)} тем" + (f"; с ошибками (пропущены): {broken}" if broken else ""))


def build_verbs():
    """content/irregular_verbs.csv → verbs.json: [{base, past: [...], participle: [...], ru, level}]"""
    verbs = []
    if paths.IRREGULAR_VERBS.exists():
        with open(paths.IRREGULAR_VERBS, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                verbs.append({
                    "base": row["base"].strip(),
                    "past": [v.strip() for v in row["past"].split("/")],
                    "participle": [v.strip() for v in row["participle"].split("/")],
                    "ru": row["ru"].strip(),
                    "level": row["level"].strip(),
                })
    write_data_file("verbs.json", verbs)
    print(f"Неправильные глаголы: {len(verbs)}")


def build_tests():
    tests = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(paths.TESTS_DIR.glob("*.json"))] if paths.TESTS_DIR.exists() else []
    tests.sort(key=lambda t: (t.get("kind") != "placement", t["id"]))    # тест уровня — первым
    write_data_file("tests.json", tests)
    print(f"Тесты: {len(tests)}")


if __name__ == "__main__":
    build_stories()
    build_vocabulary()
    build_word_audio()
    build_grammar()
    build_verbs()
    build_tests()
