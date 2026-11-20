import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword, passwordProblem, usernameProblem, verifyPassword } from "./passwords";
import { LOCK_MINUTES, MAX_FAILURES, login, logout, sessionUser, type AccountsDb, type LoginAttempt, type StoredUser } from "./accounts";
import { handleApi } from "./api";
import { Supabase, filterValue } from "./db/supabase";
import { SupabaseAccounts } from "./db/supabaseAccounts";

const FAST = 1000;                         // в тестах — мало итераций (быстро); на сайте — 100 000

/** База аккаунтов в памяти — ведёт себя как таблицы users / sessions / login_attempts. */
class MemoryAccounts implements AccountsDb {
  users: StoredUser[] = [];
  sessions = new Map<string, { userId: number; expiresAt: Date }>();
  attempts = new Map<string, LoginAttempt>();
  lastLogin = new Map<number, Date>();
  async addUser(username: string, password: string, role: "user" | "admin" = "user") {
    this.users.push({ id: this.users.length + 1, username, role, password: await hashPassword(password, FAST) });
  }
  async userByUsername(username: string) { return this.users.find(u => u.username === username) ?? null; }
  async createSession(tokenHash: string, userId: number, expiresAt: Date) { this.sessions.set(tokenHash, { userId, expiresAt }); }
  async userBySession(tokenHash: string, now: Date) {
    const s = this.sessions.get(tokenHash);
    const u = s && s.expiresAt > now ? this.users.find(x => x.id === s.userId) : undefined;
    return u ? { id: u.id, username: u.username, role: u.role } : null;
  }
  async deleteSession(tokenHash: string) { this.sessions.delete(tokenHash); }
  async loginAttempt(key: string) { return this.attempts.get(key) ?? null; }
  async saveLoginAttempt(key: string, a: LoginAttempt) { this.attempts.set(key, a); }
  async clearLoginAttempts(keys: string[]) { for (const k of keys) this.attempts.delete(k); }
  async markLogin(userId: number, at: Date) { this.lastLogin.set(userId, at); }
}

async function setup() {
  const db = new MemoryAccounts();
  await db.addUser("Rasul", "correct horse", "admin");
  await db.addUser("rasul", "another pass");
  return db;
}

describe("пароли", () => {
  it("хеш со своей солью: тот же пароль — другой хеш; проверка находит верный пароль", async () => {
    const a = await hashPassword("secret-123", FAST), b = await hashPassword("secret-123", FAST);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toContain("secret");
    expect(await verifyPassword("secret-123", a)).toBe(true);
    expect(await verifyPassword("Secret-123", a)).toBe(false);
  });
  it("по умолчанию 100 000 итераций (максимум Cloudflare Workers)", async () => {
    expect((await hashPassword("x".repeat(8))).iterations).toBe(100_000);
  });
  it("правила имени и пароля (повтор пароля должен совпасть)", () => {
    expect(usernameProblem("Rasul_1")).toBeNull();
    for (const bad of ["ab", "a b", "Расул", "x".repeat(33)]) expect(usernameProblem(bad)).not.toBeNull();
    expect(passwordProblem("12345678", "12345678")).toBeNull();
    expect(passwordProblem("1234567")).toMatch(/не короче 8/);
    expect(passwordProblem("12345678", "12345679")).toMatch(/не совпадают/);
  });
});

describe("вход по имени и паролю", () => {
  it("регистр имени важен: Rasul и rasul — разные аккаунты со своими паролями", async () => {
    const db = await setup();
    const big = await login(db, "Rasul", "correct horse", "1.1.1.1");
    expect(big.ok && big.user).toEqual({ id: 1, username: "Rasul", role: "admin" });
    const small = await login(db, "rasul", "another pass", "1.1.1.1");
    expect(small.ok && small.user.username).toBe("rasul");
    expect((await login(db, "RASUL", "correct horse", "1.1.1.1")).ok).toBe(false);
    expect((await login(db, "rasul", "correct horse", "1.1.1.1")).ok).toBe(false);
  });

  it("сессия: в базе только хеш токена; живёт 30 дней; выход её закрывает", async () => {
    const db = await setup();
    const now = new Date("2026-11-20T10:00:00Z");
    const result = await login(db, "Rasul", "correct horse", "1.1.1.1", now);
    if (!result.ok) throw new Error("не вошли");
    expect([...db.sessions.keys()][0]).not.toBe(result.token);
    expect([...db.sessions.keys()][0]).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt.toISOString()).toBe("2026-12-20T10:00:00.000Z");
    expect(db.lastLogin.get(1)).toEqual(now);
    expect(await sessionUser(db, result.token, new Date("2026-12-19T10:00:00Z"))).toMatchObject({ username: "Rasul" });
    expect(await sessionUser(db, result.token, new Date("2026-12-21T10:00:00Z"))).toBeNull();    // истекла
    await logout(db, result.token);
    expect(await sessionUser(db, result.token, now)).toBeNull();
  });

  it(`перебор: ${MAX_FAILURES} неверных паролей — вход закрыт на ${LOCK_MINUTES} мин даже с верным; потом открыт; успех сбрасывает счётчик`, async () => {
    const db = await setup();
    const t0 = new Date("2026-11-20T10:00:00Z");
    for (let i = 0; i < MAX_FAILURES; i++) expect(await login(db, "Rasul", "wrong", "1.1.1.1", t0)).toMatchObject({ ok: false, status: 401 });
    const locked = await login(db, "Rasul", "correct horse", "2.2.2.2", t0);                       // другой IP — имя всё равно закрыто
    expect(locked).toMatchObject({ ok: false, status: 429 });
    expect(!locked.ok && locked.error).toMatch(/через 15 мин/);
    expect(await login(db, "rasul", "another pass", "1.1.1.1", t0)).toMatchObject({ ok: false, status: 429 });   // и этот IP закрыт
    const later = new Date(t0.getTime() + LOCK_MINUTES * 60_000 + 1000);
    expect((await login(db, "Rasul", "correct horse", "2.2.2.2", later)).ok).toBe(true);
    expect(await db.loginAttempt("user:Rasul")).toBeNull();
  });

  it("несуществующее имя — та же ошибка, что и неверный пароль (нельзя узнать, есть ли имя)", async () => {
    const db = await setup();
    const unknown = await login(db, "nobody", "whatever1", "1.1.1.1");
    const wrong = await login(db, "Rasul", "whatever1", "1.1.1.1");
    expect(unknown).toEqual(wrong);
  });

  it("IP в базе — только как хеш", async () => {
    const db = await setup();
    await login(db, "Rasul", "wrong", "203.0.113.7");
    const keys = [...db.attempts.keys()];
    expect(keys).toContain("user:Rasul");
    expect(keys.some(k => k.includes("203.0.113.7"))).toBe(false);
  });
});

describe("API: /api/login, /api/session, /api/logout с аккаунтами", () => {
  const env = { ASSETS: { fetch: async () => new Response("") }, ACCESS_CODES: "anna:anna-code-7654321", GEMINI_API_KEY: "gem" };
  const call = (db: AccountsDb | null, path: string, body?: unknown, cookie?: string) =>
    handleApi(new Request("https://site.test" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9", ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env, { accounts: db });
  const sessionFrom = (r: Response) => r.headers.getSetCookie().find(c => c.startsWith("el_session="))!.split(";")[0];

  it("вход → cookie сессии (HttpOnly, Secure, 30 дней) → сессия знает имя и роль → выход", async () => {
    const db = await setup();
    const r = await call(db, "/api/login", { username: "Rasul", password: "correct horse" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ user: "Rasul", role: "admin", services: ["gemini"] });
    const cookie = r.headers.getSetCookie().find(c => c.startsWith("el_session="))!;
    expect(cookie).toMatch(/Max-Age=2592000; Path=\/api; HttpOnly; Secure; SameSite=Strict/);
    expect(await (await call(db, "/api/session", undefined, sessionFrom(r))).json()).toEqual({ user: "Rasul", role: "admin", services: ["gemini"] });
    const out = await call(db, "/api/logout", {}, sessionFrom(r));
    expect(out.headers.getSetCookie().every(c => /Max-Age=0/.test(c))).toBe(true);
    expect(await (await call(db, "/api/session", undefined, sessionFrom(r))).json()).toEqual({ user: null, role: null, services: [] });
  });

  it("неверный пароль — 401; перебор — 429; база не настроена — 503; старый код доступа работает", async () => {
    const db = await setup();
    expect((await call(db, "/api/login", { username: "Rasul", password: "nope" })).status).toBe(401);
    for (let i = 0; i < MAX_FAILURES; i++) await call(db, "/api/login", { username: "Rasul", password: "nope" });
    expect((await call(db, "/api/login", { username: "Rasul", password: "correct horse" })).status).toBe(429);
    expect((await call(null, "/api/login", { username: "Rasul", password: "correct horse" })).status).toBe(503);
    const byCode = await call(db, "/api/login", { code: "anna-code-7654321" });
    expect(await byCode.json()).toEqual({ user: "anna", role: "code", services: ["gemini"] });
  });

  it("AI и озвучка: с сессией — можно, без — 401", async () => {
    const db = await setup();
    const r = await call(db, "/api/login", { username: "rasul", password: "another pass" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: "{}" } }] })));
    try {
      expect((await call(db, "/api/ai/complete", { service: "gemini", system: "s", user: "u" })).status).toBe(401);
      const ok = await handleApi(new Request("https://site.test/api/ai/complete", {
        method: "POST", headers: { Cookie: sessionFrom(r) }, body: JSON.stringify({ service: "gemini", system: "s", user: "u" }),
      }), { ...env, GEMINI_MODEL: "g" }, { accounts: db });
      expect(ok.status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("база упала во время проверки сессии — как будто не вошли (сайт работает как у гостя)", async () => {
    const db = await setup();
    const r = await call(db, "/api/login", { username: "Rasul", password: "correct horse" });
    db.userBySession = async () => { throw new Error("down"); };
    expect(await (await call(db, "/api/session", undefined, sessionFrom(r))).json()).toEqual({ user: null, role: null, services: [] });
  });
});

describe("запросы к Supabase (PostgREST)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("значения фильтров экранируются: имя с кавычкой или запятой не ломает запрос", () => {
    expect(filterValue("Rasul_1")).toBe("Rasul_1");
    expect(decodeURIComponent(filterValue('a,b"c'))).toBe('"a,b\\"c"');
  });

  it("секретный ключ в заголовках; только нужные столбцы; сессия — через связь с users", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/users?")) return Response.json([{ id: 7, username: "Rasul", role: "user", password_hash: "h", password_salt: "s", password_iterations: 5 }]);
      if (url.includes("/sessions?") && init.method === "GET") return Response.json([{ user: { id: 7, username: "Rasul", role: "user" } }]);
      return new Response(null, { status: 201 });
    }));
    const db = new SupabaseAccounts(new Supabase({ url: "https://ref.supabase.co/", key: "sb_secret_x" }));
    expect(await db.userByUsername("Rasul")).toEqual({ id: 7, username: "Rasul", role: "user", password: { hash: "h", salt: "s", iterations: 5 } });
    expect(decodeURIComponent(calls[0].url)).toBe("https://ref.supabase.co/rest/v1/users?username=eq.Rasul&select=id,username,role,password_hash,password_salt,password_iterations&limit=1");
    expect(calls[0].init.headers).toMatchObject({ apikey: "sb_secret_x" });
    expect(calls[0].init.headers).not.toHaveProperty("Authorization");                 // новый ключ — только в apikey
    expect(await db.userBySession("abc", new Date("2026-11-20T00:00:00Z"))).toEqual({ id: 7, username: "Rasul", role: "user" });
    expect(calls[1].url).toContain("sessions?token_hash=eq.abc&expires_at=gt.2026-11-20T00%3A00%3A00.000Z&select=user:users(id,username,role)");
    await db.saveLoginAttempt("user:Rasul", { failures: 2, lockedUntil: null, lastFailureAt: new Date(0) });
    expect(calls[2].url).toContain("login_attempts?on_conflict=key");
    expect(calls[2].init.headers).toMatchObject({ Prefer: "resolution=merge-duplicates,return=minimal" });
    await db.clearLoginAttempts(["user:Rasul", "ip:ab"]);
    expect(decodeURIComponent(calls[3].url)).toContain("login_attempts?key=in.(user:Rasul,ip:ab)");
  });

  it("старый ключ service_role (JWT) — и в apikey, и в Authorization", async () => {
    let headers: unknown;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { headers = init.headers; return Response.json([]); }));
    await new SupabaseAccounts(new Supabase({ url: "https://r", key: "eyJhbGciOi.x.y" })).userByUsername("x");
    expect(headers).toMatchObject({ apikey: "eyJhbGciOi.x.y", Authorization: "Bearer eyJhbGciOi.x.y" });
  });

  it("ошибка базы — понятное сообщение", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    await expect(new SupabaseAccounts(new Supabase({ url: "https://r", key: "k" })).userByUsername("x")).rejects.toThrow("База: HTTP 500");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    await expect(new SupabaseAccounts(new Supabase({ url: "https://r", key: "k" })).userByUsername("x")).rejects.toThrow("проект Supabase на паузе");
  });
});
