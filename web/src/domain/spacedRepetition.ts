// Интервальное повторение слов (упрощённый алгоритм SM-2, как в Anki). Только чистые функции.
//
// Оценки после показа перевода:
//   again — не вспомнил: показать ещё раз сегодня
//   hard  — с трудом: новое слово — завтра, дальше интервал растёт чуть-чуть
//   good  — вспомнил: новое слово — через неделю, дальше интервал × лёгкость
//   easy  — легко: новое слово — через 4 недели (сразу «выучено»), дальше интервал растёт сильнее
//   known — «я это уже знаю» для нового слова: следующий показ через 60 дней

/** Карточка изучаемого слова. Короткие имена полей — совместимость с уже сохранённым прогрессом. */
export interface Card {
  i: number;   // интервал, дней
  e: number;   // «лёгкость» — множитель интервала
  d: number;   // номер дня следующего показа
  r: number;   // сколько раз повторено успешно
  l: number;   // сколько раз забыто
  t?: number;  // когда слово изучали последний раз (мс); у карточек до 2026-11-20 нет — см. studiedAtMs
}

export type Rating = "again" | "hard" | "good" | "easy" | "known";
export type WordStatus = "new" | "learning" | "learned";

export const LEARNED_INTERVAL = 21;    // с интервала 21 день слово считаем выученным
export const KNOWN_INTERVAL = 60;
/** Первый показ нового слова: Трудно — завтра, Хорошо — через неделю, Легко — через 4 недели. */
export const FIRST_INTERVALS = { hard: 1, good: 7, easy: 28 } as const;
const MIN_EASE = 1.3;

export function newCard(today: number): Card {
  return { i: 0, e: 2.5, d: today, r: 0, l: 0 };
}

/**
 * Когда слово изучали последний раз (мс) — для списка «последние изученные сверху».
 * У старых карточек без t время восстанавливается из интервала: d − i — день последней оценки (начало дня).
 */
export function studiedAtMs(card: Card): number {
  if (card.t !== undefined) return card.t;
  const day = card.d - card.i;
  return day * 86_400_000 + new Date(day * 86_400_000).getTimezoneOffset() * 60_000;
}

/** Через сколько дней покажем слово при каждой оценке. */
export function nextIntervals(card: Card | undefined): { hard: number; good: number; easy: number } {
  if (!card || (card.r === 0 && card.l === 0)) return { ...FIRST_INTERVALS };
  if (card.i < 1) return { hard: 1, good: 1, easy: 4 };     // после «Снова» (или «учу» в списке) — учим заново, понемногу
  const good = card.i === 1 ? 3 : Math.round(card.i * card.e);
  return {
    hard: Math.max(1, Math.round(card.i * 1.2)),
    good,
    easy: Math.max(good + 1, Math.round(card.i * card.e * 1.3)),
  };
}

/** Новая карточка после оценки. Исходная не меняется. */
export function applyRating(card: Card | undefined, rating: Rating, today: number): Card {
  const next: Card = { ...(card ?? newCard(today)) };
  switch (rating) {
    case "known":
      return { ...next, i: KNOWN_INTERVAL, r: 1, d: today + KNOWN_INTERVAL };
    case "again":
      return { ...next, l: next.l + 1, e: Math.max(MIN_EASE, next.e - 0.2), i: 0, d: today };
    default: {
      const interval = nextIntervals(card)[rating];
      if (rating === "hard") next.e = Math.max(MIN_EASE, next.e - 0.15);
      if (rating === "easy") next.e += 0.15;
      return { ...next, i: interval, r: next.r + 1, d: today + interval };
    }
  }
}

export function statusOf(card: Card | undefined): WordStatus {
  if (!card) return "new";
  return card.i >= LEARNED_INTERVAL ? "learned" : "learning";
}

export function isDue(card: Card, today: number): boolean {
  return card.d <= today;
}
