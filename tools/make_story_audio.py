#!/usr/bin/env python3
"""Записывает аудио рассказов тремя голосами (для караоке на сайте).

    python3 tools/make_story_audio.py                    # только то, чего ещё нет
    python3 tools/make_story_audio.py --only 03          # один рассказ (по началу id)
    python3 tools/make_story_audio.py --voices jenny     # только один голос
    python3 tools/make_story_audio.py --force            # перезаписать всё

Результат для каждого рассказа и голоса:
    audio/stories/<id>/<voice>.mp3     — сам рассказ
    audio/stories/<id>/<voice>.json    — когда начинается и заканчивается каждое предложение

Каждое предложение озвучивается отдельно, поэтому время предложений известно точно.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import content
import paths
import tts

PAUSE_AFTER_TITLE = 1.2
PAUSE_AFTER_SENTENCE = 0.35
PAUSE_AFTER_PARAGRAPH = 0.8


def record_story(story_id, voice_key, rate):
    """Записывает один рассказ одним голосом. Возвращает длительность в секундах."""
    title, paragraphs = content.read_story(story_id)
    out_dir = paths.story_audio_dir(story_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. Список фраз: заголовок, затем все предложения. После каждой — своя пауза.
    phrases = [(title, PAUSE_AFTER_TITLE)]
    for paragraph in paragraphs:
        for i, sentence in enumerate(paragraph):
            is_last_in_paragraph = i == len(paragraph) - 1
            phrases.append((sentence, PAUSE_AFTER_PARAGRAPH if is_last_in_paragraph else PAUSE_AFTER_SENTENCE))

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        voice = tts.VOICES[voice_key]

        # 2. Озвучиваем все фразы (параллельно)
        jobs = [(text, voice, tmp / f"{i:04d}.mp3") for i, (text, _) in enumerate(phrases)]
        tts.synthesize_many(jobs, rate=rate)

        # 3. Склеиваем по порядку и запоминаем время каждой фразы
        audio = bytearray()
        timings = []
        for i, (_, pause) in enumerate(phrases):
            start = tts.pcm_seconds(audio)
            audio += tts.mp3_to_pcm(tmp / f"{i:04d}.mp3")
            timings.append([round(start, 2), round(tts.pcm_seconds(audio), 2)])
            audio += tts.silence(pause)

        tts.save_pcm_as_mp3(audio, out_dir / f"{voice_key}.mp3", title, tmp)

    timing_file = out_dir / f"{voice_key}.json"
    timing_file.write_text(json.dumps({"voice": voice, "segments": timings}), encoding="utf-8")
    return tts.pcm_seconds(audio)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--voices", default=",".join(tts.VOICES), help="через запятую: " + ", ".join(tts.VOICES))
    parser.add_argument("--rate", default="-10%", help="скорость: -20%% медленнее, +0%% обычная")
    parser.add_argument("--only", help="только рассказы, чей id начинается с этого (например 03)")
    parser.add_argument("--force", action="store_true", help="перезаписать существующие")
    args = parser.parse_args()

    voices = [v.strip() for v in args.voices.split(",") if v.strip()]
    created = 0
    for story_id in paths.story_ids():
        if args.only and not story_id.startswith(args.only):
            continue
        for voice_key in voices:
            out_dir = paths.story_audio_dir(story_id)
            already_done = (out_dir / f"{voice_key}.mp3").exists() and (out_dir / f"{voice_key}.json").exists()
            if already_done and not args.force:
                print(f"есть:     {story_id} / {voice_key}", flush=True)
                continue
            seconds = record_story(story_id, voice_key, args.rate)
            print(f"записано: {story_id} / {voice_key}  {int(seconds // 60)}:{int(seconds % 60):02d}", flush=True)
            created += 1

    print(f"Новых записей: {created}. Обновляю данные сайта…")
    subprocess.run([sys.executable, str(Path(__file__).parent / "build_site_data.py")], check=True)


if __name__ == "__main__":
    main()
