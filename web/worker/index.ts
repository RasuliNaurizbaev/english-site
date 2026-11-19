// Скрипт Cloudflare Worker'а. Запускается только для адресов из run_worker_first (wrangler.jsonc),
// всё остальное Cloudflare отдаёт как статические файлы, не вызывая этот код.
//   /audio/*  — mp3 с поддержкой перемотки (Range → 206), см. range.ts
//   /api/*    — вход по коду и посредник к AI (ключи в секретах Worker'а), см. api.ts
import { handleApi, type ApiEnv } from "./api";
import { rangeResponse } from "./range";

export interface Env extends ApiEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const AUDIO_CACHE = "public, max-age=604800";        // неделя, как в public/_headers

export async function handleAudio(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const range = request.headers.get("Range");
  // из хранилища берём файл целиком (без Range и условий), часть вырезаем сами
  const full = await env.ASSETS.fetch(new Request(request.url, { method: "GET" }));
  const response = await rangeResponse(full, range);
  if (response.ok) response.headers.set("Cache-Control", AUDIO_CACHE);
  if (request.method === "HEAD") {
    await response.body?.cancel();
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/audio/")) return handleAudio(request, env);
    if (pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
