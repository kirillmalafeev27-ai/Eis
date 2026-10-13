/** Хранилище серии (13.4): по умолчанию localStorage с префиксом; ошибки доступа — тихо. */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function localStorageWithPrefix(prefix: string): KeyValueStorage {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key.startsWith('series:') ? key : prefix + key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key.startsWith('series:') ? key : prefix + key, value);
      } catch {
        /* приватный режим или квота — игра работает без сохранения */
      }
    },
  };
}

export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

export function readJson<T>(s: KeyValueStorage, key: string, fallback: T): T {
  const raw = s.get(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function writeJson(s: KeyValueStorage, key: string, value: unknown): void {
  s.set(key, JSON.stringify(value));
}
