// Неправильные глаголы: проверка ответа и выбор глаголов для тренировки.
import { normalizeAnswer, shuffled } from "./text";
import type { Level } from "./types";

export interface IrregularVerb {
  base: string;
  past: string[];          // несколько вариантов: learned / learnt
  participle: string[];
  ru: string;
  level: Level;
}

/** Статистика по глаголу: сколько раз ответил верно и с ошибкой. */
export interface VerbStats { right: number; wrong: number }

export function isCorrectForm(typed: string, variants: string[]): boolean {
  const answer = normalizeAnswer(typed);
  return variants.some(v => normalizeAnswer(v) === answer);
}

/**
 * Глаголы для тренировки: сначала те, где чаще ошибались, и те, что ещё не встречались;
 * хорошо выученные — реже. Небольшая случайность, чтобы набор не повторялся.
 */
export function pickVerbsForPractice(
  verbs: IrregularVerb[], stats: Record<string, VerbStats>, count: number, random: () => number = Math.random,
): IrregularVerb[] {
  const priority = (verb: IrregularVerb) => {
    const s = stats[verb.base];
    if (!s) return 2 + random();                              // ещё не встречался
    const errorRate = s.wrong / (s.right + s.wrong);
    const confidence = Math.min(s.right, 5) / 5;               // 5 верных ответов — почти выучен
    return errorRate * 3 + (1 - confidence) + random() * 0.5;
  };
  const ranked = verbs.map(verb => ({ verb, p: priority(verb) })).sort((a, b) => b.p - a.p);
  return shuffled(ranked.slice(0, count).map(r => r.verb), random);
}
