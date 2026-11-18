"""Синтез речи через edge-tts (нейроголоса Microsoft) и простая работа со звуком.

Нужно: pip install edge-tts, ffmpeg. Интернет нужен только во время синтеза.
"""
import asyncio
import subprocess
import wave

import edge_tts

VOICES = {
    "jenny": "en-US-JennyNeural",    # женский, американский
    "sonia": "en-GB-SoniaNeural",    # женский, британский
    "andrew": "en-US-AndrewNeural",  # мужской, американский
}
SAMPLE_RATE = 24000
TIMEOUT_SECONDS = 60     # иногда соединение зависает — тогда пробуем ещё раз
ATTEMPTS = 5


async def synthesize(text, voice, mp3_path, rate="-10%"):
    """Озвучивает одну фразу в mp3. Повторяет попытку при сетевых ошибках."""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            speech = edge_tts.Communicate(text, voice, rate=rate)
            await asyncio.wait_for(speech.save(str(mp3_path)), timeout=TIMEOUT_SECONDS)
            return
        except Exception:
            if attempt == ATTEMPTS:
                raise
            await asyncio.sleep(2 * attempt)


def synthesize_many(jobs, rate="-10%", parallel=6, on_progress=None):
    """jobs = [(text, voice, mp3_path), ...] — озвучивает параллельно."""
    async def run():
        limit = asyncio.Semaphore(parallel)
        done = 0

        async def one(text, voice, path):
            nonlocal done
            if path.exists():
                return
            async with limit:
                await synthesize(text, voice, path, rate)
            done += 1
            if on_progress:
                on_progress(done, len(jobs))

        await asyncio.gather(*(one(*job) for job in jobs))

    asyncio.run(run())


# ---------------------------------------------------------------- звук (PCM)

def mp3_to_pcm(mp3_path):
    """mp3 -> сырые 16-битные сэмплы (моно, SAMPLE_RATE)."""
    wav_path = mp3_path.with_suffix(".wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3_path),
                    "-ac", "1", "-ar", str(SAMPLE_RATE), "-sample_fmt", "s16", str(wav_path)], check=True)
    with wave.open(str(wav_path), "rb") as w:
        return w.readframes(w.getnframes())


def silence(seconds):
    return b"\x00\x00" * int(SAMPLE_RATE * seconds)


def pcm_seconds(pcm):
    return len(pcm) / 2 / SAMPLE_RATE


def save_pcm_as_mp3(pcm, mp3_path, title, work_dir):
    """Сохраняет PCM в mp3 (через временный wav)."""
    wav_path = work_dir / "joined.wav"
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(pcm))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
                    "-codec:a", "libmp3lame", "-q:a", "5", "-metadata", f"title={title}", str(mp3_path)], check=True)
