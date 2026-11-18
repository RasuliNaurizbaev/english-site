import { fileURLToPath } from "node:url";
import { type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import sirv from "sirv";

const audioDir = fileURLToPath(new URL("../audio", import.meta.url));

/**
 * Локально mp3 раздаются прямо из папки EL/audio по адресу /audio/...
 * (с поддержкой перемотки). В сборку (dist/) они НЕ копируются —
 * на сервере аудио лежит отдельно, его адрес задаёт VITE_AUDIO_URL (см. .env.production.example).
 */
function serveLocalAudio(): Plugin {
  const serve = sirv(audioDir, { dev: true });
  const mount = (middlewares: { use: (path: string, handler: typeof serve) => void }) => middlewares.use("/audio", serve);
  return {
    name: "serve-local-audio",
    // Важно: ничего не возвращать — функцию, которую вернули, Vite вызвал бы позже как «отложенный» хук
    configureServer(server) { mount(server.middlewares); },
    configurePreviewServer(server) { mount(server.middlewares); },
  };
}

export default defineConfig({
  base: "./",                       // относительные пути — сайт работает в любой папке и на любом хостинге
  plugins: [vue(), serveLocalAudio()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
