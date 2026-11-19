#!/usr/bin/env python3
"""Находит в рассказах слова из словарей и сохраняет их в content/stories/<id>/words.csv.

    python3 tools/find_story_words.py           # только для рассказов без words.csv
    python3 tools/find_story_words.py --force   # пересоздать все

Учитывает формы слов: went → to go, bought → to buy, flats → flat, stopped → to stop.
Если у формы несколько значений (left — «левый» и «to leave»), в список попадают все.
Не включает служебные слова (I, the, and, in, to be…) и имена (Mark, Mrs Green).
"""
import argparse

import content
import paths
from story_words import WordFinder


def find_words(text, finder):
    """Все словарные записи, найденные в тексте (по одной на запись, в порядке появления)."""
    found, seen = [], set()
    for _start, _length, rows in finder.find(text):
        for row in rows:
            key = (row[2], row[0])
            if key not in seen:
                seen.add(key)
                found.append(row)
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    finder = WordFinder()

    for story_id in paths.story_ids():
        out = paths.story_dir(story_id) / paths.STORY_WORDS
        if out.exists() and not args.force:
            print(f"есть:  {story_id}")
            continue
        text = (paths.story_dir(story_id) / paths.STORY_TEXT).read_text(encoding="utf-8-sig")
        rows = find_words(text, finder)
        content.write_word_list(out, rows)

        by_level = {}
        for row in rows:
            by_level[row[2]] = by_level.get(row[2], 0) + 1
        print(f"готово: {story_id}: {len(text.split())} слов в тексте, из словаря {len(rows)} {by_level}")


if __name__ == "__main__":
    main()
