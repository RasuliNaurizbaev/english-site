// Вход по личному коду доступа (без Cloudflare Access — он требует карту даже на бесплатном тарифе).
// Коды — в секрете Worker'а ACCESS_CODES, формат: "rasul:код1, anna:код2" (через запятую или с новой строки).
// После входа код лежит в cookie (HttpOnly — скрипты сайта его не видят) и проверяется при каждом запросе,
// поэтому чтобы отозвать доступ, достаточно убрать код из секрета.
// Имя перед двоеточием — id пользователя (для лимитов AI и прогресса в будущей базе D1).

export const COOKIE_NAME = "el_access";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;          // год — заново вводить код почти не придётся
export const MIN_CODE_LENGTH = 12;                   // короткие коды игнорируются — их можно подобрать

/** Коды из секрета: код → имя пользователя. Некорректные и слишком короткие строки пропускаются. */
export function parseAccessCodes(raw: string | undefined): Map<string, string> {
  const codes = new Map<string, string>();
  for (const part of (raw ?? "").split(/[,\n]/)) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim();
    const code = part.slice(colon + 1).trim();
    if (name && code.length >= MIN_CODE_LENGTH) codes.set(code, name);
  }
  return codes;
}

/** Сравнение строк за одинаковое время (чтобы по скорости ответа нельзя было угадывать код). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Имя пользователя по коду или null. */
export function userByCode(codes: Map<string, string>, code: string): string | null {
  let user: string | null = null;
  for (const [known, name] of codes) if (safeEqual(known, code)) user = name;
  return user;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Кто делает запрос (по cookie) или null. */
export function currentUser(request: Request, accessCodes: string | undefined): string | null {
  const code = readCookie(request, COOKIE_NAME);
  return code ? userByCode(parseAccessCodes(accessCodes), code) : null;
}

// Secure — только по https. Локально (wrangler dev, http://localhost) Safari не отправляет Secure-cookie → вход не работал бы.
const flags = (secure: boolean) => `Path=/api; HttpOnly;${secure ? " Secure;" : ""} SameSite=Strict`;
export const loginCookie = (code: string, secure = true) =>
  `${COOKIE_NAME}=${encodeURIComponent(code)}; Max-Age=${COOKIE_MAX_AGE}; ${flags(secure)}`;
export const logoutCookie = (secure = true) => `${COOKIE_NAME}=; Max-Age=0; ${flags(secure)}`;
