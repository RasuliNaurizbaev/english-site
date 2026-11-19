// Хранилище «ключ → значение». Обычно localStorage; если он недоступен (приватный режим,
// запрет браузера) — память: сайт работает, просто прогресс не сохранится после перезагрузки.

export interface KeyValueStorage {
  get<T>(key: string, defaultValue: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  /** Все сохранённые ключи (без префикса). */
  keys(): string[];
  readonly persistent: boolean;
}

// Префикс «es.» — совместимость с прогрессом, сохранённым старой версией сайта
const PREFIX = "es.";

export function createMemoryStorage(): KeyValueStorage {
  const memory = new Map<string, unknown>();
  return {
    persistent: false,
    get: <T>(key: string, defaultValue: T) => (memory.has(key) ? (memory.get(key) as T) : defaultValue),
    set: (key, value) => { memory.set(key, value); },
    remove: key => { memory.delete(key); },
    keys: () => [...memory.keys()],
  };
}

export function createBrowserStorage(): KeyValueStorage {
  try {
    const probe = PREFIX + "__probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
  } catch {
    return createMemoryStorage();
  }
  return {
    persistent: true,
    get<T>(key: string, defaultValue: T): T {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? defaultValue : (JSON.parse(raw) as T);
      } catch {
        return defaultValue;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // места нет / запрещено — не сохраняем, но и не падаем
      }
    },
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch { /* запрещено — ничего не делаем */ }
    },
    keys() {
      try {
        return Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length));
      } catch {
        return [];
      }
    },
  };
}
