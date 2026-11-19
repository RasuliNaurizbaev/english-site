import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAccessCodes } from "./auth";
import worker from "./index";

const CODE = "rasul-code-1234567";
const env = {
  ASSETS: { fetch: async () => new Response("asset") },
  ACCESS_CODES: `rasul:${CODE}, anna:anna-code-7654321, bad:short`,
  GEMINI_API_KEY: "gem-key",
  GROQ_API_KEY: "",
};
const call = (path: string, body?: unknown, cookie?: string, e: object = env) =>
  worker.fetch(new Request("https://site.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), e as typeof env);
const loggedIn = `other=1; el_access=${CODE}`;

afterEach(() => vi.unstubAllGlobals());

describe("Вход по коду", () => {
  it("разбор секрета ACCESS_CODES: короткие и без имени пропускаются", () => {
    const codes = parseAccessCodes(`rasul:${CODE}\nanna:anna-code-7654321, bad:short, :no-name-code-123, junk`);
    expect([...codes.values()]).toEqual(["rasul", "anna"]);
  });

  it("верный код — имя и cookie; неверный — 401", async () => {
    const ok = await call("/api/login", { code: ` ${CODE} ` });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ user: "rasul", services: ["gemini"] });
    expect(ok.headers.get("Set-Cookie")).toMatch(/^el_access=rasul-code-1234567;.*HttpOnly; Secure; SameSite=Strict/);
    expect((await call("/api/login", { code: "short" })).status).toBe(401);
    expect((await call("/api/login", { code: CODE + "x" })).status).toBe(401);
  });

  it("сессия: без cookie — никто, с cookie — пользователь; выход стирает cookie", async () => {
    expect(await (await call("/api/session")).json()).toEqual({ user: null, services: [] });
    expect(await (await call("/api/session", undefined, loggedIn)).json()).toEqual({ user: "rasul", services: ["gemini"] });
    expect((await call("/api/logout", {})).headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
  });

  it("код убрали из секрета — cookie больше не действует", async () => {
    const revoked = { ...env, ACCESS_CODES: "anna:anna-code-7654321" };
    expect(await (await call("/api/session", undefined, loggedIn, revoked)).json()).toEqual({ user: null, services: [] });
  });
});

describe("AI-посредник", () => {
  it("без входа — 401, в сервис ничего не уходит", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await call("/api/ai/complete", { service: "gemini", system: "s", user: "u" })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ключ сервера уходит в Gemini, модель выбирается сама, ответ — текст", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer gem-key");
      if (url.endsWith("/models")) return Response.json({ data: [{ id: "models/gemini-2.5-flash" }, { id: "models/gemini-2.5-pro" }] });
      expect(JSON.parse(String(init?.body)).model).toBe("gemini-2.5-flash");
      return Response.json({ choices: [{ message: { content: '{"title":"T"}' } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await call("/api/ai/complete", { service: "gemini", system: "s", user: "u" }, loggedIn);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ text: '{"title":"T"}' });
  });

  it("нет ключа сервиса, плохой запрос, ошибка сервиса — понятные ошибки", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("limit", { status: 429 })));
    const noKey = await call("/api/ai/complete", { service: "groq", system: "s", user: "u" }, loggedIn);
    expect(noKey.status).toBe(503);
    expect((await call("/api/ai/complete", { service: "x", system: "s", user: "u" }, loggedIn)).status).toBe(400);
    expect((await call("/api/ai/complete", { service: "gemini", system: "s", user: "u".repeat(40_000) }, loggedIn)).status).toBe(413);
    const limited = await call("/api/ai/complete", { service: "gemini", system: "s", user: "u" }, loggedIn, { ...env, GEMINI_MODEL: "gemini-x" });
    expect(limited.status).toBe(502);
    expect((await limited.json()).error).toMatch(/лимит/);
  });

  it("неизвестный адрес /api — 404 JSON, остальное — статические файлы", async () => {
    expect((await call("/api/nope")).status).toBe(404);
    expect(await (await call("/index.html")).text()).toBe("asset");
  });
});
