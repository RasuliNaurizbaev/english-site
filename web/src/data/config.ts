// Настройки, зависящие от места запуска (локально / на сервере).
//
// Где лежат mp3 (рассказы и слова):
//   на сайте (сборка):  публичный бакет Supabase Storage — SUPABASE_AUDIO_URL ниже (загрузка: python3 tools/upload_audio.py)
//   локально (npm run dev): VITE_AUDIO_URL=/audio из web/.env.development — Vite раздаёт папку EL/audio (vite.config.ts)
//   вернуть mp3 рядом с сайтом: VITE_AUDIO_URL=audio при сборке + node scripts/copy-audio.mjs (README → «Деплой»)

export const SUPABASE_AUDIO_URL = "https://rmbcltczrruvlepsmtwd.supabase.co/storage/v1/object/public/mp3%20audios";
const audioBase = (import.meta.env.VITE_AUDIO_URL ?? SUPABASE_AUDIO_URL).replace(/\/$/, "");

/** stories/01_x/jenny.mp3 → полный адрес файла */
export function audioUrl(relativePath: string): string {
  return audioBase + "/" + relativePath.replace(/^\//, "");
}

/** Адрес JSON-данных сайта (лежат рядом с сайтом, в public/data). */
export function dataUrl(name: string): string {
  return import.meta.env.BASE_URL + "data/" + name;
}
