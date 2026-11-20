// AccountsDb на Supabase: таблицы users, sessions, login_attempts (миграция 20261120120000_users.sql).
// Выбираются только нужные столбцы — новые столбцы в будущих миграциях этот код не ломают.
import type { AccountsDb, AccountUser, LoginAttempt, Role, StoredUser } from "../accounts";
import { filterValue, inList, type Supabase } from "./supabase";

interface UserRow { id: number; username: string; role: Role; password_hash: string; password_salt: string; password_iterations: number }
interface AttemptRow { failures: number; locked_until: string | null; last_failure_at: string }

export class SupabaseAccounts implements AccountsDb {
  constructor(private readonly db: Supabase) {}

  async userByUsername(username: string): Promise<StoredUser | null> {
    const rows = await this.db.rest<UserRow[]>("GET",
      `users?username=eq.${filterValue(username)}&select=id,username,role,password_hash,password_salt,password_iterations&limit=1`);
    const row = rows[0];
    return row ? {
      id: row.id, username: row.username, role: row.role,
      password: { hash: row.password_hash, salt: row.password_salt, iterations: row.password_iterations },
    } : null;
  }

  async createSession(tokenHash: string, userId: number, expiresAt: Date): Promise<void> {
    await this.db.rest("POST", "sessions", { token_hash: tokenHash, user_id: userId, expires_at: expiresAt.toISOString() }, "return=minimal");
  }

  async userBySession(tokenHash: string, now: Date): Promise<AccountUser | null> {
    const rows = await this.db.rest<{ user: AccountUser | null }[]>("GET",
      `sessions?token_hash=eq.${filterValue(tokenHash)}&expires_at=gt.${filterValue(now.toISOString())}&select=user:users(id,username,role)&limit=1`);
    return rows[0]?.user ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.rest("DELETE", `sessions?token_hash=eq.${filterValue(tokenHash)}`, undefined, "return=minimal");
  }

  async loginAttempt(key: string): Promise<LoginAttempt | null> {
    const rows = await this.db.rest<AttemptRow[]>("GET", `login_attempts?key=eq.${filterValue(key)}&select=failures,locked_until,last_failure_at`);
    const row = rows[0];
    return row ? { failures: row.failures, lockedUntil: row.locked_until ? new Date(row.locked_until) : null, lastFailureAt: new Date(row.last_failure_at) } : null;
  }

  async saveLoginAttempt(key: string, attempt: LoginAttempt): Promise<void> {
    await this.db.rest("POST", "login_attempts?on_conflict=key", {
      key, failures: attempt.failures,
      last_failure_at: attempt.lastFailureAt.toISOString(), locked_until: attempt.lockedUntil?.toISOString() ?? null,
    }, "resolution=merge-duplicates,return=minimal");
  }

  async clearLoginAttempts(keys: string[]): Promise<void> {
    await this.db.rest("DELETE", `login_attempts?key=in.${inList(keys)}`, undefined, "return=minimal");
  }

  async markLogin(userId: number, at: Date): Promise<void> {
    await this.db.rest("PATCH", `users?id=eq.${userId}`, { last_login_at: at.toISOString() }, "return=minimal");
  }
}
