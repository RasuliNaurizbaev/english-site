// Настройки, зависящие от места запуска (локально / на сервере).
//
// VITE_AUDIO_URL — где лежат mp3:
//   локально:          /audio (Vite раздаёт папку EL/audio, см. vite.config.ts)
//   Cloudflare Pages:  не задаётся — mp3 лежат рядом с сайтом в audio/ (npm run build:pages)
//   отдельное хранилище: его адрес, например https://<bucket>.r2.dev  (файл .env.production)

const audioBase = (import.meta.env.VITE_AUDIO_URL ?? "audio").replace(/\/$/, "");

/** stories/01_x/jenny.mp3 → полный адрес файла */
export function audioUrl(relativePath: string): string {
  return audioBase + "/" + relativePath.replace(/^\//, "");
}

/** Адрес JSON-данных сайта (лежат рядом с сайтом, в public/data). */
export function dataUrl(name: string): string {
  return import.meta.env.BASE_URL + "data/" + name;
}
