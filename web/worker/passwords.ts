// Пароли: только хеш PBKDF2-SHA256 со своей солью у каждого пользователя (WebCrypto — есть и в Worker'е, и в Node).
// Сам пароль нигде не хранится. Число итераций хранится у каждого пользователя — его можно поднять позже,
// не ломая старые пароли (новый хеш запишется при следующей смене пароля).

/** Cloudflare Workers не разрешает больше 100 000 итераций PBKDF2. */
export const PBKDF2_ITERATIONS = 100_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,32}$/;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

export interface PasswordHash { hash: string; salt: string; iterations: number }

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return { hash: toBase64(await derive(password, salt, iterations)), salt: toBase64(salt), iterations };
}

/** Сравнение за одинаковое время — по скорости ответа нельзя угадывать хеш. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const derived = await derive(password, fromBase64(stored.salt), stored.iterations);
  return sameBytes(derived, fromBase64(stored.hash));
}

/** Текст ошибки или null. Регистр важен: Rasul и rasul — разные имена. */
export function usernameProblem(username: string): string | null {
  return USERNAME_RULE.test(username) ? null : "Имя: 3–32 символа — латинские буквы, цифры и _.";
}

export function passwordProblem(password: string, repeat?: string): string | null {
  if (password.length < MIN_PASSWORD) return `Пароль — не короче ${MIN_PASSWORD} символов.`;
  if (password.length > MAX_PASSWORD) return `Пароль — не длиннее ${MAX_PASSWORD} символов.`;
  if (repeat !== undefined && repeat !== password) return "Пароли не совпадают.";
  return null;
}

/** SHA-256 в hex: токены сессий и IP хранятся в базе только так. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Случайный токен сессии (32 байта, base64url). */
export function newToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
