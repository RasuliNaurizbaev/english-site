// Аккаунты: вход по username + паролю, сессии на 30 дней, защита от перебора паролей.
// Хранилище — интерфейс AccountsDb: на сайте — Supabase (db/supabaseAccounts.ts), в тестах — память.
import { hashPassword, newToken, sha256Hex, verifyPassword, type PasswordHash } from "./passwords";

export type Role = "user" | "admin";
export interface AccountUser { id: number; username: string; role: Role }
export interface StoredUser extends AccountUser { password: PasswordHash }
export interface LoginAttempt { failures: number; lockedUntil: Date | null; lastFailureAt: Date }

export interface AccountsDb {
  userByUsername(username: string): Promise<StoredUser | null>;
  createSession(tokenHash: string, userId: number, expiresAt: Date): Promise<void>;
  userBySession(tokenHash: string, now: Date): Promise<AccountUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  loginAttempt(key: string): Promise<LoginAttempt | null>;
  saveLoginAttempt(key: string, attempt: LoginAttempt): Promise<void>;
  clearLoginAttempts(keys: string[]): Promise<void>;
  markLogin(userId: number, at: Date): Promise<void>;
}

export const SESSION_COOKIE = "el_session";
export const SESSION_DAYS = 30;
export const MAX_FAILURES = 5;                      // столько неверных паролей подряд…
export const LOCK_MINUTES = 15;                     // …и вход закрыт на столько минут (для имени и для IP)
const FAILURE_WINDOW_MINUTES = 60;                  // старые ошибки (час назад) не считаются

export type LoginResult =
  | { ok: true; user: AccountUser; token: string; expiresAt: Date }
  | { ok: false; status: 401 | 429; error: string };

/** Ключи защиты от перебора: имя (регистр важен) и IP (в базе — только хеш). */
async function attemptKeys(username: string, ip: string): Promise<string[]> {
  return ["user:" + username, "ip:" + (await sha256Hex("ip:" + ip)).slice(0, 32)];
}

// Пароль проверяется и для несуществующего имени — по времени ответа нельзя узнать, есть ли такое имя.
let dummyHash: Promise<PasswordHash> | null = null;
const DUMMY = () => (dummyHash ??= hashPassword("dummy-password"));

export async function login(db: AccountsDb, username: string, password: string, ip: string, now = new Date()): Promise<LoginResult> {
  const keys = await attemptKeys(username, ip);
  const attempts = await Promise.all(keys.map(k => db.loginAttempt(k)));
  const lockedUntil = attempts.map(a => a?.lockedUntil).filter((d): d is Date => !!d && d > now).sort((a, b) => b.getTime() - a.getTime())[0];
  if (lockedUntil) {
    const minutes = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000);
    return { ok: false, status: 429, error: `Слишком много неверных попыток. Попробуйте через ${minutes} мин.` };
  }

  const user = await db.userByUsername(username);
  const matches = await verifyPassword(password, user?.password ?? await DUMMY());
  if (!matches || !user) {
    await Promise.all(keys.map(async (key, i) => {
      const previous = attempts[i];
      const recent = previous && now.getTime() - previous.lastFailureAt.getTime() < FAILURE_WINDOW_MINUTES * 60_000;
      const failures = (recent ? previous.failures : 0) + 1;
      await db.saveLoginAttempt(key, {
        failures, lastFailureAt: now,
        lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
      });
    }));
    return { ok: false, status: 401, error: "Неверное имя или пароль." };
  }

  await db.clearLoginAttempts(keys);
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.createSession(await sha256Hex(token), user.id, expiresAt);
  await db.markLogin(user.id, now);
  return { ok: true, user: { id: user.id, username: user.username, role: user.role }, token, expiresAt };
}

export async function sessionUser(db: AccountsDb, token: string, now = new Date()): Promise<AccountUser | null> {
  return token ? db.userBySession(await sha256Hex(token), now) : null;
}

export async function logout(db: AccountsDb, token: string): Promise<void> {
  if (token) await db.deleteSession(await sha256Hex(token));
}

// Secure — только по https (локально Safari не отправляет Secure-cookie по http://localhost).
const flags = (secure: boolean) => `Path=/api; HttpOnly;${secure ? " Secure;" : ""} SameSite=Strict`;
export const sessionCookie = (token: string, secure = true) =>
  `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86_400}; ${flags(secure)}`;
export const clearSessionCookie = (secure = true) => `${SESSION_COOKIE}=; Max-Age=0; ${flags(secure)}`;
