// Доступ Worker'а к базе Supabase через её REST API (PostgREST) с секретным ключом (роль service_role, обходит RLS).
// Секреты Worker'а: SUPABASE_URL (https://<ref>.supabase.co), SUPABASE_SECRET_KEY. Браузер в базу не ходит.

export class DbError extends Error {}

export interface SupabaseConfig { url: string; key: string }

/** Значение для фильтра PostgREST (?username=eq.<значение>): в кавычках, если есть спецсимволы. */
export const filterValue = (value: string | number) => {
  const text = String(value);
  return encodeURIComponent(/^[A-Za-z0-9_.:@-]*$/.test(text) ? text : `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
};
export const inList = (values: (string | number)[]) =>
  "(" + values.map(v => filterValue(v)).join(",") + ")";

export class Supabase {
  constructor(private readonly config: SupabaseConfig) {}

  /** Запрос к /rest/v1/<path>. Ответ — JSON (или null для return=minimal). */
  async rest<T = unknown>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.config.url.replace(/\/$/, "") + "/rest/v1/" + path, {
        method,
        headers: {
          apikey: this.config.key,
          // старый ключ service_role — это JWT (eyJ…), его шлют и в Authorization; новый sb_secret_… — только в apikey
          ...(this.config.key.startsWith("eyJ") ? { Authorization: "Bearer " + this.config.key } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new DbError("База недоступна (нет связи или проект Supabase на паузе).", { cause: error });
    }
    const text = await response.text();
    if (!response.ok) throw new DbError(`База: HTTP ${response.status} ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Вызов функции базы: rpc/<имя>. */
  rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    return this.rest<T>("POST", "rpc/" + name, args);
  }
}

export function supabaseFrom(env: { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string }): Supabase | null {
  const url = env.SUPABASE_URL?.trim(), key = env.SUPABASE_SECRET_KEY?.trim();
  return url && key ? new Supabase({ url, key }) : null;
}
