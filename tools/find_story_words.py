#!/usr/bin/env python3
"""Находит в рассказах слова из словарей и сохраняет их в content/stories/<id>/words.csv.

    python3 tools/find_story_words.py           # только для рассказов без words.csv
    python3 tools/find_story_words.py --force   # пересоздать все

Учитывает формы слов: went → to go, bought → to buy, flats → flat, stopped → to stop.
Не включает служебные слова (I, the, and, in, to be…) и имена (Mark, Mrs Green).
"""
import argparse
import re

import content
import paths
from word_forms import forms_of

# Служебные и самые частые слова — их не отмечаем
SKIP = set("""
i you he she it we they my your his her our their this that these those
in on at to from for of about by into up down over under after before with without between behind
and but or because so who what where when why how which many much some any every other more most less little
everyone something nothing everything someone yes no ok well too only just very also again then now here there
one two three four five six seven eight nine ten first second third can must
""".split()) | {
    "to be", "to have", "to do", "to have to", "to get", "to go", "to come", "to make", "to say", "to let",
    "to take", "to put", "to give", "to look", "to see", "to know", "to think",
    "a lot of", "a little", "a few", "out of", "next to", "in front of", "how much", "how many",
}


def build_form_index():
    """форма слова (lowercase) -> строка словаря. Если форма есть в нескольких уровнях, побеждает более простой."""
    index = {}
    for level in paths.LEVELS:
        for row in content.read_vocabulary(level):
            english = row[0].strip()
            if english.lower() in SKIP:
                continue
            for form in forms_of(english):
                index.setdefault(form.lower(), row)
    return index


def looks_like_name(text, start, match):
    """Слово с заглавной буквы не в начале предложения — скорее всего имя (Mark, Mrs Green)."""
    if not match[0].isupper() or start == 0:
        return False
    before = text[:start].rstrip(' "“')
    return bool(before) and before[-1] not in ".!?\n:"


def find_words(text, index, pattern):
    found, seen = [], set()
    for m in pattern.finditer(text):
        if looks_like_name(text, m.start(), m.group(0)):
            continue
        row = index[m.group(0).lower()]
        if row[0] not in seen:
            seen.add(row[0])
            found.append(row)
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    index = build_form_index()
    longest_first = sorted(index, key=len, reverse=True)
    pattern = re.compile(r"(?<![\w'-])(" + "|".join(map(re.escape, longest_first)) + r")(?![\w'-])", re.IGNORECASE)

    for story_id in paths.story_ids():
        out = paths.story_dir(story_id) / paths.STORY_WORDS
        if out.exists() and not args.force:
            print(f"есть:  {story_id}")
            continue
        text = (paths.story_dir(story_id) / paths.STORY_TEXT).read_text(encoding="utf-8-sig")
        rows = find_words(text, index, pattern)
        content.write_word_list(out, rows)

        by_level = {}
        for row in rows:
            by_level[row[2]] = by_level.get(row[2], 0) + 1
        print(f"готово: {story_id}: {len(text.split())} слов в тексте, из словаря {len(rows)} {by_level}")


if __name__ == "__main__":
    main()
