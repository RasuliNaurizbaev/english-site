// Маленькие функции для текста и чисел. Без зависимостей.

/** Номер сегодняшнего дня по местному времени — дни удобно сравнивать числами. */
export function dayNumber(date: Date = new Date()): number {
  const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return Math.floor(localMs / 86_400_000);
}

/** Перемешанная копия массива. random можно подменить в тестах. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Русское склонение: plural(5, "день", "дня", "дней") → "дней". */
export function plural(n: number, one: string, few: string, many: string): string {
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit === 1 && lastTwo !== 11) return one;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 10 || lastTwo >= 20)) return few;
  return many;
}

/** 125 → "2:05" */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds || 0);
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

/** Для сравнения ответов: без регистра, лишних пробелов и точки в конце; ’ → '. */
export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
