// «Мои ошибки»: упражнения грамматики, где была ошибка, возвращаются для повторения
// через 1 → 3 → 7 → 14 дней. Четыре правильных ответа подряд — ошибка исправлена и убирается.

export const MISTAKE_STEPS = [1, 3, 7, 14];

export interface Mistake {
  topicId: string;
  exercise: number;        // номер упражнения в теме
  step: number;            // сколько раз подряд ответил верно при повторении
  due: number;             // номер дня следующего повторения
}

export const mistakeKey = (topicId: string, exercise: number) => `${topicId}#${exercise}`;

/** Ошибка в теме: повторить завтра (если уже была в списке — начать заново). */
export function recordMistake(topicId: string, exercise: number, today: number): Mistake {
  return { topicId, exercise, step: 0, due: today + MISTAKE_STEPS[0] };
}

/** Ответ при повторении. null — ошибка исправлена, убрать из списка. */
export function reviewMistake(mistake: Mistake, correct: boolean, today: number): Mistake | null {
  if (!correct) return { ...mistake, step: 0, due: today + MISTAKE_STEPS[0] };
  const step = mistake.step + 1;
  if (step >= MISTAKE_STEPS.length) return null;
  return { ...mistake, step, due: today + MISTAKE_STEPS[step] };
}
