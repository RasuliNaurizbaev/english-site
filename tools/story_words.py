"""Поиск словарных слов в тексте рассказа (с учётом форм: went → to go, flats → flat).

Единственное место, где это делается: сайт получает готовые отметки из build_site_data.py.

У одной формы может быть несколько значений: "left" — это и «левый», и прошедшее время от «to leave».
Поэтому каждое найденное место хранит СПИСОК подходящих словарных записей.
"""
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


class WordFinder:
    """finder.find(text) → [(начало, длина, [строки словаря]), ...]"""

    def __init__(self):
        self.rows_by_form = {}                      # "went" → [строка "to go"], "left" → ["left", "to leave"]
        for level in paths.LEVELS:
            for row in content.read_vocabulary(level):
                english = row[0].strip()
                if english.lower() in SKIP:
                    continue
                for form in forms_of(english):
                    rows = self.rows_by_form.setdefault(form.lower(), [])
                    if row not in rows:
                        rows.append(row)
        longest_first = sorted(self.rows_by_form, key=len, reverse=True)
        self.pattern = re.compile(r"(?<![\w'-])(" + "|".join(map(re.escape, longest_first)) + r")(?![\w'-])", re.IGNORECASE)

    def find(self, text):
        found = []
        for match in self.pattern.finditer(text):
            if looks_like_name(text, match.start(), match.group(0)):
                continue
            found.append((match.start(), len(match.group(0)), self.rows_by_form[match.group(0).lower()]))
        return found


def looks_like_name(text, start, word):
    """Слово с заглавной буквы не в начале предложения — скорее всего имя (Mark, Mrs Green)."""
    if not word[0].isupper() or start == 0:
        return False
    before = text[:start].rstrip(' "“')
    return bool(before) and before[-1] not in ".!?\n:"
