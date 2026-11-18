#!/usr/bin/env python3
"""Записывает mp3 со словами из словарей: по 100 слов в файле.

    python3 tools/make_word_audio.py              # все уровни
    python3 tools/make_word_audio.py --level A1   # только один уровень
    python3 tools/make_word_audio.py --pause 2.5  # пауза после слова (сек)

Как делятся слова: по 100 в файле. Если в конце остаётся ≤ 50 слов —
они добавляются в последний файл, если больше 50 — получается отдельный файл.

В каждом файле: «Level A1. Part 1.», затем: слово → пауза, чтобы повторить вслух.
Результат: audio/words/<LEVEL>/part_NN.mp3 и audio/words/manifest.json
"""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import content
import paths
import tts

VOICE = tts.VOICES["jenny"]


def split_into_parts(words, size=100):
    full_parts, rest = divmod(len(words), size)
    if full_parts == 0:
        return [words] if words else []
    parts = [words[i * size:(i + 1) * size] for i in range(full_parts)]
    if rest:
        tail = words[full_parts * size:]
        if rest <= size // 2:
            parts[-1] = parts[-1] + tail   # маленький остаток — в последний файл
        else:
            parts.append(tail)             # большой остаток — отдельный файл
    return parts


def spoken_text(word):
    return word.replace("...", "").strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--level", choices=paths.LEVELS, help="только этот уровень")
    parser.add_argument("--pause", type=float, default=1.8, help="пауза после слова, сек")
    parser.add_argument("--rate", default="-10%")
    args = parser.parse_args()

    levels = [args.level] if args.level else paths.LEVELS
    manifest = json.loads(paths.WORD_AUDIO_MANIFEST.read_text(encoding="utf-8")) if paths.WORD_AUDIO_MANIFEST.exists() else {}

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        def phrase_file(text):
            return tmp / (hashlib.md5(text.encode()).hexdigest() + ".mp3")

        # 1. План: какие слова в какой файл
        plan = {}
        for level in levels:
            words = [row[0].strip() for row in content.read_vocabulary(level)]
            plan[level] = split_into_parts(words)

        # 2. Озвучиваем все уникальные фразы
        phrases = set()
        for level, parts in plan.items():
            for number, part in enumerate(parts, 1):
                phrases.add(f"Level {level}. Part {number}.")
                phrases.update(spoken_text(w) for w in part)
        print(f"Озвучиваю {len(phrases)} фраз…", flush=True)
        tts.synthesize_many([(p, VOICE, phrase_file(p)) for p in sorted(phrases)], rate=args.rate,
                            on_progress=lambda n, total: n % 250 == 0 and print(f"  {n}/{total}", flush=True))

        # 3. Собираем файлы
        for level, parts in plan.items():
            level_dir = paths.WORD_AUDIO_DIR / level
            level_dir.mkdir(parents=True, exist_ok=True)
            for old in level_dir.glob("part_*.mp3"):
                old.unlink()

            entries, first_number = [], 1
            for number, part in enumerate(parts, 1):
                audio = bytearray(tts.mp3_to_pcm(phrase_file(f"Level {level}. Part {number}.")))
                audio += tts.silence(1.5)
                for word in part:
                    audio += tts.mp3_to_pcm(phrase_file(spoken_text(word)))
                    audio += tts.silence(args.pause)

                mp3 = level_dir / f"part_{number:02d}.mp3"
                tts.save_pcm_as_mp3(audio, mp3, f"{level} part {number}", tmp)
                seconds = tts.pcm_seconds(audio)
                entries.append({
                    "file": mp3.relative_to(paths.WORD_AUDIO_DIR).as_posix(),
                    "part": number,
                    "from": first_number, "to": first_number + len(part) - 1, "count": len(part),
                    "first": part[0], "last": part[-1],
                    "duration": round(seconds),
                })
                print(f"  {level}/{mp3.name}: {len(part)} слов, {int(seconds // 60)}:{int(seconds % 60):02d}", flush=True)
                first_number += len(part)
            manifest[level] = entries

    ordered = {level: manifest[level] for level in paths.LEVELS if level in manifest}
    paths.WORD_AUDIO_MANIFEST.write_text(json.dumps(ordered, ensure_ascii=False, indent=1), encoding="utf-8")
    subprocess.run([sys.executable, str(Path(__file__).parent / "build_site_data.py")], check=True)


if __name__ == "__main__":
    main()
