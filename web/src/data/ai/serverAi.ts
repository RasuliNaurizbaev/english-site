// AI через сервер сайта (Worker, worker/api.ts): ключи Gemini и Groq хранятся в секретах Worker'а,
// браузер их не знает. Пользоваться могут только вошедшие (имя + пароль или старый код доступа).
// Локально (npm run dev) сервера нет — loadSession() вернёт null, и останутся только свои ключи.
import { AI_SERVICES, AiRequestError, type AiProvider, type AiService, type AiServiceId } from "./aiProvider";

export interface ServerSession {
  user: string | null;            // имя (аккаунт или старый код доступа) или null — гость
  role?: "user" | "admin" | "code" | null;   // code — вошли старым кодом доступа
  services: AiServiceId[];        // для каких сервисов на сервере есть ключ
}

async function api(path: string, body?: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AiRequestError("Нет связи с сервером сайта.", { cause: error });
  }
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new AiRequestError("Сервер сайта недоступен (локальный запуск без Worker'а?).");
  }
  const data = await response.json();
  if (!response.ok) throw new AiRequestError(data?.error ?? `Ошибка сервера ${response.status}`);
  return data;
}

/** Кто вошёл. null — сервера нет (локальный запуск) или он не ответил. */
export async function loadSession(): Promise<ServerSession | null> {
  try { return await api("/api/session"); } catch { return null; }
}

/** Вход по имени и паролю (аккаунт). Имя — с учётом регистра. */
export const loginWithPassword = (username: string, password: string): Promise<ServerSession> => api("/api/login", { username, password });
/** Старый вход по коду доступа — пока не у всех есть аккаунт. */
export const loginWithCode = (code: string): Promise<ServerSession> => api("/api/login", { code });
export const logout = (): Promise<ServerSession> => api("/api/logout", {});

/** Сервис AI, к которому ходит сервер сайта со своим ключом. */
export class ServerAiProvider implements AiProvider {
  constructor(private readonly service: AiService) {}
  get name() { return this.service.label; }
  async complete(system: string, user: string): Promise<string> {
    const data = await api("/api/ai/complete", { service: this.service.id, system, user });
    if (typeof data?.text !== "string" || !data.text.trim()) throw new AiRequestError(`${this.name}: пустой ответ.`);
    return data.text;
  }
}

/** Серверные сервисы в обычном порядке (Gemini, затем Groq) — только для вошедшего пользователя. */
export function serverProviders(session: ServerSession | null): AiProvider[] {
  if (!session?.user) return [];
  return AI_SERVICES.filter(s => session.services.includes(s.id)).map(s => new ServerAiProvider(s));
}
