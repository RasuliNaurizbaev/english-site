#!/usr/bin/env python3
"""Проверяет грамматику, вопросы к рассказам, тесты и список неправильных глаголов.

    python3 tools/validate_content.py

ФОРМАТ ТЕМЫ ГРАММАТИКИ — content/grammar/<LEVEL>/<NN>_<slug>.json
{
  "id": "A2_05_present_perfect",     # <LEVEL>_<имя файла>
  "level": "A2", "order": 5,         # order = NN
  "title": "Present Perfect",        # английское название
  "titleRu": "…",                    # русское название
  "summary": "Одно предложение: что изучаем.",
  "theory": "<мини-markdown, см. ниже>",
  "exercises": [ ≥10 упражнений ]
}

Мини-markdown в "theory":
  ## Заголовок   ### Подзаголовок   пустая строка — новый абзац   - пункт списка
  | таблица | ... |  (вторая строка |---|---|)
  > English example — русский перевод
  !! совет        ⚠ ошибка → правильно        **жирный**  *курсив*

Упражнения:
  {"type":"choice", "q":"She ___ a doctor.", "options":["am","is","are"], "answer":1, "explain":"…"}
  {"type":"input",  "q":"I ___ (go) there yesterday.", "answer":["went"], "explain":"…"}   # ровно один ___
  {"type":"order",  "q":"Составьте вопрос", "answer":"Where do you live?", "explain":"…"}

ФОРМАТ ВОПРОСОВ — content/stories/<id>/questions.json
{
  "questions": [
    {"type":"tf", "q":"…", "answer": true, "explain":"…"},
    {"type":"choice", "q":"…", "options":["…","…","…"], "answer": 0, "explain":"…"}
  ],
  "retell": ["Who is …?", "What happened …?"]
}
"""
import json
import re
import sys

import content
import paths


def check_exercise(ex, where, errors):
    kind = ex.get("type")
    if kind not in ("choice", "input", "order", "tf"):
        errors.append(f"{where}: неизвестный type {kind!r}")
        return
    if not str(ex.get("q", "")).strip():
        errors.append(f"{where}: пустой q")

    if kind == "tf" and not isinstance(ex.get("answer"), bool):
        errors.append(f"{where}: answer должен быть true/false")
    elif kind == "choice":
        options = ex.get("options")
        if not isinstance(options, list) or len(options) < 2 or len(set(options)) != len(options):
            errors.append(f"{where}: options — список из ≥2 разных строк")
            return
        answer = ex.get("answer")
        if not isinstance(answer, int) or isinstance(answer, bool) or not 0 <= answer < len(options):
            errors.append(f"{where}: answer — номер правильного варианта (с 0)")
    elif kind == "input":
        answer = ex.get("answer")
        if not isinstance(answer, list) or not answer or not all(str(a).strip() for a in answer):
            errors.append(f"{where}: answer — непустой список вариантов")
        if ex.get("q", "").count("___") != 1:
            errors.append(f"{where}: в q должен быть ровно один ___")
    elif kind == "order" and len(str(ex.get("answer", "")).split()) < 3:
        errors.append(f"{where}: answer — предложение минимум из 3 слов")


def check_grammar_topic(path, errors):
    name = f"{path.parent.name}/{path.name}"
    try:
        topic = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        errors.append(f"{name}: не JSON: {error}")
        return
    match = re.match(r"^(\d\d)_[a-z0-9_]+$", path.stem)
    if path.parent.name not in paths.LEVELS or not match:
        errors.append(f"{name}: путь должен быть <LEVEL>/<NN>_<slug>.json")
        return
    missing = [k for k in ("level", "order", "title", "titleRu", "summary", "theory", "exercises") if k not in topic]
    if missing:
        errors.append(f"{name}: нет полей {missing}")
        return
    if topic["level"] != path.parent.name or topic["order"] != int(match.group(1)):
        errors.append(f"{name}: level/order не совпадают с путём файла")
    if len(topic["theory"]) < 1500:
        errors.append(f"{name}: theory слишком короткая ({len(topic['theory'])} символов)")
    if len(topic["exercises"]) < 10:
        errors.append(f"{name}: нужно ≥10 упражнений")
    for i, ex in enumerate(topic["exercises"], 1):
        if ex.get("type") == "tf":
            errors.append(f"{name} #{i}: tf только для вопросов к рассказам")
        check_exercise(ex, f"{name} #{i}", errors)


def check_story_questions(story_id, errors):
    data = content.read_questions(story_id)
    if data is None:
        return
    questions = data.get("questions")
    if not isinstance(questions, list) or len(questions) < 6:
        errors.append(f"{story_id}: нужно ≥6 вопросов")
        return
    for i, q in enumerate(questions, 1):
        if q.get("type") not in ("tf", "choice"):
            errors.append(f"{story_id} #{i}: type должен быть tf или choice")
        else:
            check_exercise(q, f"{story_id} #{i}", errors)
    retell = data.get("retell")
    if not isinstance(retell, list) or len(retell) < 3:
        errors.append(f"{story_id}: retell — список из ≥3 вопросов")


def check_test(path, errors):
    """content/tests/<id>.json — тест уровня или пробный экзамен."""
    name = f"tests/{path.name}"
    try:
        test = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        errors.append(f"{name}: не JSON: {error}")
        return
    if test.get("id") != path.stem:
        errors.append(f"{name}: id должен совпадать с именем файла")
    for key in ("kind", "title", "titleRu", "sections", "bands"):
        if key not in test:
            errors.append(f"{name}: нет поля {key}")
    for s, section in enumerate(test.get("sections", []), 1):
        where = f"{name} раздел {s}"
        if section.get("kind") not in ("grammar", "vocabulary", "reading", "listening"):
            errors.append(f"{where}: kind")
        if section.get("kind") == "reading" and not section.get("text"):
            errors.append(f"{where}: нет text")
        if section.get("kind") == "listening" and not section.get("script"):
            errors.append(f"{where}: нет script")
        for i, ex in enumerate(section.get("exercises", []), 1):
            check_exercise(ex, f"{where} #{i}", errors)


def check_verbs(errors):
    """content/irregular_verbs.csv: base,past,participle,ru,level"""
    if not paths.IRREGULAR_VERBS.exists():
        return 0
    import csv
    with open(paths.IRREGULAR_VERBS, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    seen = set()
    for n, row in enumerate(rows, 2):
        if not all((row.get(k) or "").strip() for k in ("base", "past", "participle", "ru", "level")):
            errors.append(f"irregular_verbs.csv строка {n}: пустое поле")
        if row.get("level") not in paths.LEVELS:
            errors.append(f"irregular_verbs.csv строка {n}: level {row.get('level')!r}")
        if row.get("base") in seen:
            errors.append(f"irregular_verbs.csv строка {n}: повтор {row.get('base')}")
        seen.add(row.get("base"))
    return len(rows)


def main():
    errors = []
    topics = content.grammar_files()
    for path in topics:
        check_grammar_topic(path, errors)
    stories = paths.story_ids()
    for story_id in stories:
        check_story_questions(story_id, errors)
    tests = sorted(paths.TESTS_DIR.glob("*.json")) if paths.TESTS_DIR.exists() else []
    for path in tests:
        check_test(path, errors)
    verbs = check_verbs(errors)
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print(f"OK: тем грамматики {len(topics)}, рассказов {len(stories)}, тестов {len(tests)}, глаголов {verbs} — ошибок нет")


if __name__ == "__main__":
    main()
