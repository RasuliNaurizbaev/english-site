// Миграции базы (supabase/migrations/*.sql) на настоящем Postgres в памяти (PGlite): применяются все по порядку,
// затем проверяются правила. Новая миграция → этот тест проверит, что она применяется поверх старых и ничего не ломает.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const MIGRATIONS = readdirSync(DIR).filter(f => f.endsWith(".sql")).sort();

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");   // роли, которые есть в Supabase
  for (const file of MIGRATIONS) await db.exec(readFileSync(DIR + file, "utf8"));
});

const fails = async (sql: string) => { try { await db.exec(sql); return false; } catch { return true; } };
const addUser = (username: string) =>
  db.query("insert into users (username, password_hash, password_salt, password_iterations) values ($1, 'h', 's', 1000) returning id", [username]);
const quota = async (amount: number, limit: number, subject = "user:1", kind = "ai_test") =>
  (await db.query<{ v: number | null }>("select public.use_quota($1, 100, $2, $3, $4) as v", [subject, kind, amount, limit])).rows[0].v;

describe("миграции базы", () => {
  it("имена файлов: <ГГГГММДДччммсс>_<имя>.sql (так требует Supabase CLI), без повторов версии", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    for (const file of MIGRATIONS) expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(new Set(MIGRATIONS.map(f => f.slice(0, 14))).size).toBe(MIGRATIONS.length);
  });

  it("username: с учётом регистра (Rasul ≠ rasul), без повторов, только латиница/цифры/_ 3–32", async () => {
    await addUser("Rasul");
    expect(await fails("insert into users (username, password_hash, password_salt, password_iterations) values ('rasul', 'h', 's', 1)")).toBe(false);
    expect(await fails("insert into users (username, password_hash, password_salt, password_iterations) values ('Rasul', 'h', 's', 1)")).toBe(true);
    for (const bad of ["a b", "ab", "Расул", "x".repeat(33)]) {
      expect(await fails(`insert into users (username, password_hash, password_salt, password_iterations) values ('${bad}', 'h', 's', 1)`), bad).toBe(true);
    }
    expect(await fails("update users set role = 'boss'")).toBe(true);
  });

  it("updated_at обновляется сам", async () => {
    await addUser("Rasul");
    const before = (await db.query<{ t: Date }>("select updated_at t from users")).rows[0].t;
    await new Promise(r => setTimeout(r, 20));
    await db.exec("update users set role = 'admin'");
    expect((await db.query<{ t: Date }>("select updated_at t from users")).rows[0].t.getTime()).toBeGreaterThan(before.getTime());
  });

  it("ключи AI: own — только с зашифрованным ключом, shared — без ключа", async () => {
    await addUser("Rasul");
    expect(await fails("insert into user_ai_keys (user_id, service, mode, set_by) values (1, 'groq', 'own', 'admin')")).toBe(true);
    expect(await fails("insert into user_ai_keys (user_id, service, mode, key_encrypted, set_by) values (1, 'groq', 'shared', 'x', 'admin')")).toBe(true);
    expect(await fails("insert into user_ai_keys (user_id, service, mode, key_encrypted, key_hint, set_by) values (1, 'gemini', 'own', 'enc', 'a1B9', 'user')")).toBe(false);
    expect(await fails("insert into user_ai_keys (user_id, service, mode, set_by) values (1, 'groq', 'shared', 'admin')")).toBe(false);
  });

  it("лимиты атомарны: 5 AI-тестов, шестой — нет; пачка, не влезающая в лимит, не тратит ничего", async () => {
    const used = [];
    for (let i = 0; i < 6; i++) used.push(await quota(1, 5));
    expect(used).toEqual([1, 2, 3, 4, 5, null]);
    expect(await quota(40, 50, "guest:abc", "tts")).toBe(40);
    expect(await quota(20, 50, "guest:abc", "tts")).toBeNull();
    expect(await quota(10, 50, "guest:abc", "tts")).toBe(50);
    expect(await quota(60, 50, "guest:new", "tts")).toBeNull();
    expect((await db.query<{ c: number }>("select count(*)::int c from usage where subject = 'guest:new'")).rows[0].c).toBe(0);
    expect(await fails("select public.use_quota('user:1', 100, 'other', 1, 5)")).toBe(true);
  });

  it("удаление пользователя удаляет его сессии и ключи", async () => {
    await addUser("Rasul");
    await db.exec("insert into sessions (token_hash, user_id, expires_at) values ('t1', 1, now() + interval '30 days')");
    await db.exec("insert into user_ai_keys (user_id, service, mode, set_by) values (1, 'groq', 'shared', 'admin')");
    await db.exec("delete from users");
    const left = (await db.query<{ s: number; k: number }>("select (select count(*) from sessions)::int s, (select count(*) from user_ai_keys)::int k")).rows[0];
    expect(left).toEqual({ s: 0, k: 0 });
  });

  it("доступ: RLS на всех таблицах, у anon/authenticated нет прав, use_quota — только service_role", async () => {
    const withoutRls = await db.query("select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity");
    expect(withoutRls.rows).toEqual([]);
    const grants = await db.query<{ c: number }>("select count(*)::int c from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_schema = 'public'");
    expect(grants.rows[0].c).toBe(0);
    const fn = "public.use_quota(text, integer, text, integer, integer)";
    const rights = (await db.query<{ a: boolean; s: boolean }>(`select has_function_privilege('anon', '${fn}', 'execute') a, has_function_privilege('service_role', '${fn}', 'execute') s`)).rows[0];
    expect(rights).toEqual({ a: false, s: true });
  });

  it("service_role (Worker) может читать и писать во все таблицы — и в будущие тоже", async () => {
    await db.exec("create table public.future_table (id int primary key)");      // как будто таблица из следующей миграции
    const missing = await db.query<{ t: string; p: string }>(`
      select c.relname t, p.p from pg_class c
      cross join (values ('select'), ('insert'), ('update'), ('delete')) p(p)
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        and not has_table_privilege('service_role', c.oid, p.p)`);
    expect(missing.rows).toEqual([]);
  });
});
