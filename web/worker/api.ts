// /api/* — вход по коду и посредник к AI. Ключи Gemini и Groq — только в секретах Worker'а,
// браузер их не знает. AI доступен только вошедшим по коду (см. auth.ts).
//   GET  /api/session      → { user, services }   кто вошёл и какие AI-сервисы настроены на сервере
//   POST /api/login {code} → { user, services }   + cookie
//   POST /api/logout
//   POST /api/ai/complete { service, system, user } → { text }
//   GET  /api/ai/check     → по каждому сервису: модель и время ответа (или ошибка) — открыть в браузере после входа
// Порядок сервисов (Gemini → Groq) и проверку теста делает браузер (application/aiTests.ts),
// сервер только отправляет запрос в выбранный сервис со своим ключом.
import {
  AI_SERVICES, AiRequestError, createProvider, pickDefaultModel, type AiService, type AiServiceId,
} from "../src/data/ai/aiProvider";
import { currentUser, loginCookie, logoutCookie, parseAccessCodes, userByCode } from "./auth";

export interface ApiEnv {
  ACCESS_CODES?: string;        // секрет: "имя:код, имя:код"
  GEMINI_API_KEY?: string;      // секрет
  GROQ_API_KEY?: string;        // секрет
  GEMINI_MODEL?: string;        // необязательно: модель вручную; иначе выбирается сама (pickDefaultModel)
  GROQ_MODEL?: string;
}

const MAX_PROMPT_CHARS = 30_000;          // задание для теста ~5 000 символов; больше — подозрительно

const SETTINGS: Record<AiServiceId, { key: keyof ApiEnv; model: keyof ApiEnv }> = {
  gemini: { key: "GEMINI_API_KEY", model: "GEMINI_MODEL" },
  groq: { key: "GROQ_API_KEY", model: "GROQ_MODEL" },
};

const apiKey = (env: ApiEnv, id: AiServiceId) => env[SETTINGS[id].key]?.trim() ?? "";
const configuredServices = (env: ApiEnv) => AI_SERVICES.filter(s => apiKey(env, s.id)).map(s => s.id);

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
const error = (message: string, status: number) => json({ error: message }, status);

/** Модель для сервиса: из настройки Worker'а или по списку моделей ключа (запоминается, пока Worker жив). */
const modelCache = new Map<string, string>();
async function modelFor(service: AiService, env: ApiEnv): Promise<string> {
  const fixed = env[SETTINGS[service.id].model]?.trim();
  if (fixed) return fixed;
  const key = apiKey(env, service.id);
  const cacheKey = service.id + ":" + key.slice(-6);
  const cached = modelCache.get(cacheKey);
  if (cached) return cached;
  const model = pickDefaultModel(service, await createProvider(service.id, { apiKey: key, model: "" }).listModels());
  if (!model) throw new AiRequestError(`${service.label}: по ключу не нашлось ни одной модели.`);
  modelCache.set(cacheKey, model);
  return model;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function complete(request: Request, env: ApiEnv): Promise<Response> {
  const body = await readJson(request);
  const service = AI_SERVICES.find(s => s.id === body?.service);
  const system = body?.system, user = body?.user;
  if (!service || typeof system !== "string" || typeof user !== "string") return error("Неверный запрос.", 400);
  if (system.length + user.length > MAX_PROMPT_CHARS) return error("Слишком длинное задание.", 413);
  const key = apiKey(env, service.id);
  if (!key) return error(`${service.label}: ключ не задан на сервере.`, 503);
  try {
    const text = await createProvider(service.id, { apiKey: key, model: await modelFor(service, env) }).complete(system, user);
    return json({ text });
  } catch (e) {
    return error(e instanceof AiRequestError ? e.message : `${service.label}: ошибка на сервере.`, 502);
  }
}

/** Проверка AI: какая модель выбрана и сколько секунд занимает крошечный запрос (для поиска «почему медленно»). */
async function check(env: ApiEnv): Promise<Response> {
  const seconds = (start: number) => Math.round((Date.now() - start) / 100) / 10;
  const results = await Promise.all(AI_SERVICES.filter(s => apiKey(env, s.id)).map(async service => {
    let start = Date.now();
    try {
      const model = await modelFor(service, env);
      const modelSeconds = seconds(start);
      start = Date.now();
      await createProvider(service.id, { apiKey: apiKey(env, service.id), model }).complete("Reply with JSON only.", 'Return {"ok":true}');
      return { service: service.id, model, modelSeconds, answerSeconds: seconds(start) };
    } catch (e) {
      return { service: service.id, error: e instanceof Error ? e.message : String(e), seconds: seconds(start) };
    }
  }));
  return json(results);
}

export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  const { pathname, protocol } = new URL(request.url);
  const secure = protocol === "https:";
  const route = `${request.method} ${pathname}`;

  if (route === "POST /api/login") {
    const code = (await readJson(request))?.code;
    const user = typeof code === "string" ? userByCode(parseAccessCodes(env.ACCESS_CODES), code.trim()) : null;
    if (!user) return error("Неверный код доступа.", 401);
    return json({ user, services: configuredServices(env) }, 200, { "Set-Cookie": loginCookie((code as string).trim(), secure) });
  }
  if (route === "POST /api/logout") return json({ user: null, services: [] }, 200, { "Set-Cookie": logoutCookie(secure) });

  const user = currentUser(request, env.ACCESS_CODES);
  if (route === "GET /api/session") return json({ user, services: user ? configuredServices(env) : [] });
  if (route === "POST /api/ai/complete") return user ? complete(request, env) : error("Войдите по коду доступа.", 401);
  if (route === "GET /api/ai/check") return user ? check(env) : error("Войдите по коду доступа.", 401);
  return error("Not found", 404);
}
