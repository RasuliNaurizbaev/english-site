// Задание «вставьте пропущенное слово» — строится автоматически по словарным словам рассказа.
import { shuffled } from "./text";
import type { ChoiceExercise, Story, WordMark } from "./types";

/**
 * Выбирает до `count` предложений равномерно по тексту и в каждом прячет одно словарное слово.
 * Лучше прятать слова A2/B1 и не первое слово предложения.
 */
export function buildGapExercises(story: Story, count: number, random: () => number = Math.random): ChoiceExercise[] {
  const sentences = story.paragraphs.flat();
  const marksOf = new Map<number, WordMark[]>();
  for (const mark of story.marks ?? []) marksOf.set(mark[0], [...(marksOf.get(mark[0]) ?? []), mark]);

  const allForms = new Set<string>();
  const candidates: { sentence: string; mark: WordMark }[] = [];

  sentences.forEach((sentence, number) => {
    const marks = (marksOf.get(number) ?? []).filter(m => m[2] > 2);
    marks.forEach(m => allForms.add(sentence.slice(m[1], m[1] + m[2]).toLowerCase()));
    if (sentence.split(" ").length < 5) return;

    const notFirst = marks.filter(m => m[1] > 0);
    const harder = notFirst.filter(m => m[3].some(i => story.words[i]?.level !== "A1"));
    const pool = harder.length ? harder : notFirst;
    if (!pool.length) return;
    candidates.push({ sentence, mark: [...pool].sort((a, b) => b[2] - a[2])[0] });
  });

  // равномерно по тексту и без повторов одного и того же слова
  const step = Math.max(1, candidates.length / count);
  const chosen: typeof candidates = [];
  const used = new Set<string>();
  for (let i = 0; i < candidates.length && chosen.length < count; i += step) {
    const candidate = candidates[Math.floor(i)];
    const [, start, length] = candidate.mark;
    const form = candidate.sentence.slice(start, start + length).toLowerCase();
    if (used.has(form)) continue;
    used.add(form);
    chosen.push(candidate);
  }

  const otherForms = [...allForms];
  return chosen.map(({ sentence, mark: [, start, length, meaningIds] }) => {
    const answer = sentence.slice(start, start + length);
    const wrong = shuffled(otherForms.filter(f => f !== answer.toLowerCase() && Math.abs(f.length - answer.length) < 6), random).slice(0, 3);
    const options = shuffled([answer, ...wrong], random);
    return {
      type: "choice",
      q: sentence.slice(0, start) + "___" + sentence.slice(start + length),
      options,
      answer: options.indexOf(answer),
      hint: "подсказка: " + meaningIds.map(i => story.words[i]?.ru).filter(Boolean).join(" / "),
      explain: "Полностью: " + sentence,
    };
  });
}
