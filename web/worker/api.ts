// /api/* — вход и посредник к AI. Ключи Gemini и Groq — только в секретах Worker'а, браузер их не знает.
// Вход: имя + пароль (аккаунты в Supabase, accounts.ts) или — пока не у всех есть аккаунт — старый код доступа (auth.ts).
//   GET  /api/session      → { user, role, services }   кто вошёл и какие AI-сервисы настроены на сервере
//   POST /api/login {username, password} | {code} → { user, role, services }   + cookie (сессия на 30 дней / код)
//   POST /api/logout
//   POST /api/ai/complete { service, system, user } → { text }
//   GET  /api/ai/check     → по каждому сервису: модель и время ответа (или ошибка) — открыть в браузере после входа
//   POST /api/tts { text, voice? } → audio/mpeg   озвучка слова/фразы через edge-tts (см. edgeTts/); mp3 на сервере не хранится
// Порядок сервисов (Gemini → Groq) и проверку теста делает браузер (application/aiTests.ts),
// сервер только отправляет запрос в выбранный сервис со своим ключом.
import {
  AI_SERVICES, AiRequestError, createProvider, pickDefaultModel, type AiService, type AiServiceId,
} from "../src/data/ai/aiProvider";
import { currentUser, loginCookie, logoutCookie, parseAccessCodes, readCookie, userByCode } from "./auth";
import {
  clearSessionCookie, login as accountLogin, logout as accountLogout, sessionCookie, sessionUser,
  SESSION_COOKIE, type AccountsDb, type Role,
} from "./accounts";
import { supabaseFrom } from "./db/supabase";
import { SupabaseAccounts } from "./db/supabaseAccounts";
import { synthesize, TtsError, VOICES, type VoiceId } from "./edgeTts/synthesize";

export interface ApiEnv {
  ACCESS_CODES?: string;        // секрет: "имя:код, имя:код" — старый вход, убрать после перехода на аккаунты
  SUPABASE_URL?: string;        // секрет: https://<ref>.supabase.co — база аккаунтов и прогресса
  SUPABASE_SECRET_KEY?: string; // секрет: секретный ключ Supabase (service_role)
  GEMINI_API_KEY?: string;      // секрет
  GROQ_API_KEY?: string;        // секрет
  GEMINI_MODEL?: string;        // необязательно: модель вручную; иначе выбирается сама (pickDefaultModel)
  GROQ_MODEL?: string;
}

const MAX_PROMPT_CHARS = 30_000;          // задание для теста ~5 000 символов; больше — подозрительно
const MAX_TTS_CHARS = 100;                // озвучиваем слова и короткие фразы

const SETTINGS: Record<AiServiceId, { key: keyof ApiEnv; model: keyof ApiEnv }> = {
  gemini: { key: "GEMINI_API_KEY", model: "GEMINI_MODEL" },
  groq: { key: "GROQ_API_KEY", model: "GROQ_MODEL" },
};

const apiKey = (env: ApiEnv, id: AiServiceId) => env[SETTINGS[id].key]?.trim() ?? "";
const configuredServices = (env: ApiEnv) => AI_SERVICES.filter(s => apiKey(env, s.id)).map(s => s.id);

const json = (data: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
};
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

/** Озвучить слово. mp3 отдаётся браузеру и нигде на сервере не сохраняется. */
async function tts(request: Request): Promise<Response> {
  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const voice = (body?.voice ?? "jenny") as VoiceId;
  if (!text || !/[a-z]/i.test(text) || !(voice in VOICES)) return error("Неверный запрос.", 400);
  if (text.length > MAX_TTS_CHARS) return error("Слишком длинный текст.", 413);
  try {
    const mp3 = await synthesize(text, { voice });
    return new Response(mp3 as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return error(e instanceof TtsError ? e.message : "Озвучка: ошибка на сервере.", 502);
  }
}

/** Зависимости, которые тесты подменяют (база аккаунтов). На сайте — Supabase из секретов. */
export interface ApiDeps { accounts?: AccountsDb | null }

interface Caller { name: string; role: Role | "code" }

/** Кто делает запрос: сессия аккаунта (cookie el_session) или старый код доступа. */
async function whoIs(request: Request, env: ApiEnv, accounts: AccountsDb | null): Promise<Caller | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token && accounts) {
    try {
      const user = await sessionUser(accounts, token);
      if (user) return { name: user.username, role: user.role };
    } catch (e) {
      console.error("session: база", e instanceof Error ? e.message : e);       // как будто не вошли (сайт работает как у гостя)
    }
  }
  const byCode = currentUser(request, env.ACCESS_CODES);
  return byCode ? { name: byCode, role: "code" } : null;
}

const NOT_SIGNED_IN = "Войдите: имя и пароль (или код доступа).";

export async function handleApi(request: Request, env: ApiEnv, deps: ApiDeps = {}): Promise<Response> {
  const { pathname, protocol } = new URL(request.url);
  const secure = protocol === "https:";
  const route = `${request.method} ${pathname}`;
  const db = supabaseFrom(env);
  const accounts = deps.accounts !== undefined ? deps.accounts : db ? new SupabaseAccounts(db) : null;

  if (route === "POST /api/login") {
    const body = await readJson(request);
    if (typeof body?.username === "string" && typeof body.password === "string") {
      if (!accounts) return error("Вход по имени и паролю ещё не настроен на сервере.", 503);
      try {
        const result = await accountLogin(accounts, body.username.trim(), body.password, request.headers.get("CF-Connecting-IP") ?? "local");
        if (!result.ok) return error(result.error, result.status);
        return json({ user: result.user.username, role: result.user.role, services: configuredServices(env) }, 200,
          [sessionCookie(result.token, secure), logoutCookie(secure)]);                     // старый код больше не нужен
      } catch (e) {
        console.error("login: база", e instanceof Error ? e.message : e);       // видно в wrangler dev и в логах Worker'а
        return error("База недоступна — попробуйте через минуту.", 503);
      }
    }
    const code = body?.code;
    const user = typeof code === "string" ? userByCode(parseAccessCodes(env.ACCESS_CODES), code.trim()) : null;
    if (!user) return error("Неверный код доступа.", 401);
    return json({ user, role: "code", services: configuredServices(env) }, 200, [loginCookie((code as string).trim(), secure)]);
  }
  if (route === "POST /api/logout") {
    const token = readCookie(request, SESSION_COOKIE);
    if (token && accounts) await accountLogout(accounts, token).catch(() => {});
    return json({ user: null, role: null, services: [] }, 200, [clearSessionCookie(secure), logoutCookie(secure)]);
  }

  const caller = await whoIs(request, env, accounts);
  if (route === "GET /api/session") return json({ user: caller?.name ?? null, role: caller?.role ?? null, services: caller ? configuredServices(env) : [] });
  if (route === "POST /api/ai/complete") return caller ? complete(request, env) : error(NOT_SIGNED_IN, 401);
  if (route === "GET /api/ai/check") return caller ? check(env) : error(NOT_SIGNED_IN, 401);
  if (route === "POST /api/tts") return caller ? tts(request) : error(NOT_SIGNED_IN, 401);
  return error("Not found", 404);
}
