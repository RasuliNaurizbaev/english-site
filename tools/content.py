"""Чтение контента: словари, рассказы, грамматика.

Используется всеми скриптами, чтобы формат файлов разбирался одинаково.
"""
import csv
import json
import re

import paths

# Заголовок CSV-словарей (формат приложения-карточек: лицо, оборот, комментарий)
CSV_HEADER = ["表", "裏", "コメント", "", ""]


# ---------------------------------------------------------------- словари

def read_vocabulary(level):
    """-> список строк [english, russian, level, '', ''] из content/vocabulary/<level>.csv"""
    with open(paths.vocabulary_file(level), encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))[1:]          # первая строка — заголовок
    return [row for row in rows if row and row[0].strip()]


def write_word_list(path, rows):
    """Сохраняет список слов в том же формате, что и словари."""
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, lineterminator="\r\n")
        writer.writerow(CSV_HEADER)
        for row in rows:
            writer.writerow((list(row) + ["", ""])[:5])


def read_word_list(path):
    """-> [{'en','ru','level'}] из words.csv рассказа."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))[1:]
    return [{"en": r[0].strip(), "ru": r[1].strip(), "level": r[2].strip()}
            for r in rows if len(r) >= 3 and r[0].strip()]


# ---------------------------------------------------------------- рассказы

def read_story(story_id):
    """-> (title, paragraphs), где paragraphs = [[предложение, ...], ...].

    Формат story.txt: первая строка — заголовок, абзацы разделены пустой строкой.
    Эту же разбивку на предложения использует запись аудио (тайминги караоке),
    поэтому менять её нужно только здесь.
    """
    text = (paths.story_dir(story_id) / paths.STORY_TEXT).read_text(encoding="utf-8-sig")
    blocks = [b.strip().replace("\n", " ") for b in text.replace("\r\n", "\n").split("\n\n") if b.strip()]
    title, body = blocks[0], blocks[1:]
    return title, [split_sentences(paragraph) for paragraph in body]


SPEECH_VERBS = r"(said|asked|answered|shouted|whispered|wrote|thought|replied|laughed|smiled|cried|called)"


def split_sentences(paragraph):
    """Делит абзац на предложения.

    Конец предложения: . ! ? (возможно, с закрывающей кавычкой), затем пробел и заглавная буква или кавычка.
    Короткие ремарки после реплики ("Kate said.") присоединяются к реплике.
    """
    pieces = re.split(r'(?<=[.!?])("?)\s+(?=["A-Z])', paragraph)
    # re.split возвращает [текст, кавычка, текст, кавычка, ...] — склеиваем текст с его кавычкой
    sentences = []
    for i in range(0, len(pieces), 2):
        quote = pieces[i + 1] if i + 1 < len(pieces) else ""
        sentences.append((pieces[i] + quote).strip())

    merged = []
    for sentence in sentences:
        is_remark = len(sentence.split()) <= 4 and re.search(rf"\b{SPEECH_VERBS}\b", sentence, re.I)
        if merged and is_remark and merged[-1].endswith(('"', "!", "?")):
            merged[-1] += " " + sentence
        else:
            merged.append(sentence)
    return [s for s in merged if s]


def read_questions(story_id):
    path = paths.story_dir(story_id) / paths.STORY_QUESTIONS
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


# ---------------------------------------------------------------- грамматика

def grammar_files():
    """Все файлы тем по порядку: A1/01_..., A1/02_..., ..., B1/15_..."""
    return sorted(paths.GRAMMAR_DIR.glob("*/*.json"))


def grammar_id(path):
    """content/grammar/A2/05_present_perfect.json -> 'A2_05_present_perfect'"""
    return f"{path.parent.name}_{path.stem}"
