// Склейка mp3 от edge-tts (MPEG-2 Layer III, 24 кГц, 48 кбит/с, моно — кадры по 144 байта = 24 мс)
// с паузами между словами. Пауза — «тихие» кадры: заголовок как у edge-tts + нули (нулевой звук).
// mp3 — просто последовательность кадров, поэтому склеивать можно без перекодирования.

const FRAME_BYTES = 144;
const FRAME_SECONDS = 576 / 24000;                   // 24 мс
const SILENT_FRAME = new Uint8Array(FRAME_BYTES);
SILENT_FRAME.set([0xff, 0xf3, 0x64, 0xc4]);           // заголовок кадра, как в ответах edge-tts

export function silence(seconds: number): Uint8Array {
  const frames = Math.max(0, Math.round(seconds / FRAME_SECONDS));
  const result = new Uint8Array(frames * FRAME_BYTES);
  for (let i = 0; i < frames; i++) result.set(SILENT_FRAME, i * FRAME_BYTES);
  return result;
}

/** Убрать ID3-теги в начале (на всякий случай: edge-tts их не присылает, но склейка с ними сломалась бы). */
function withoutId3(clip: Uint8Array): Uint8Array {
  if (clip[0] !== 0x49 || clip[1] !== 0x44 || clip[2] !== 0x33) return clip;     // "ID3"
  const size = ((clip[6] & 0x7f) << 21) | ((clip[7] & 0x7f) << 14) | ((clip[8] & 0x7f) << 7) | (clip[9] & 0x7f);
  return clip.subarray(10 + size);
}

/** Пауза в начале, затем каждое слово и пауза после него. */
export function joinWithPauses(clips: readonly Uint8Array[], pauseSeconds: number, leadSeconds = 0.5): Uint8Array {
  const pause = silence(pauseSeconds);
  const parts = [silence(leadSeconds), ...clips.flatMap(clip => [withoutId3(clip), pause])];
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

/** Длительность mp3 из одних кадров по 144 байта (как у edge-tts) — без декодирования. */
export const mp3Seconds = (mp3: Uint8Array) => (mp3.length / FRAME_BYTES) * FRAME_SECONDS;
