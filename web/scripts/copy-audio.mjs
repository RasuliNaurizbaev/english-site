// Сборка для хостинга (Cloudflare Pages): кладёт mp3 рядом с сайтом — EL/audio → web/dist/audio.
// Сайт по умолчанию ищет аудио по относительному адресу "audio/" (см. src/data/config.ts),
// поэтому VITE_AUDIO_URL на хостинге задавать не нужно.
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../audio", import.meta.url));
const to = fileURLToPath(new URL("../dist/audio", import.meta.url));

if (!existsSync(from)) {
  console.error("Нет папки с аудио: " + from);
  process.exit(1);
}
cpSync(from, to, {
  recursive: true,
  filter: path => !basename(path).startsWith("."),        // без .DS_Store и прочего мусора
});

let files = 0, bytes = 0;
const walk = dir => readdirSync(dir).forEach(name => {
  const path = dir + "/" + name;
  if (statSync(path).isDirectory()) walk(path);
  else { files++; bytes += statSync(path).size; }
});
walk(to);
console.log(`Аудио скопировано в dist/audio: ${files} файлов, ${(bytes / 1048576).toFixed(1)} МБ`);
