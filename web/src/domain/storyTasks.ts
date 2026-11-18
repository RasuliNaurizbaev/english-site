// Задание «вставьте пропущенное слово» — строится автоматически из словарных слов рассказа.
import { shuffled } from "./text";
import type { ChoiceExercise, Story } from "./types";
import type { WordFinder, WordMatch } from "./wordForms";

/**
 * Выбирает до `count` предложений равномерно по тексту и в каждом прячет одно словарное слово.
 * Лучше прятать слова A2/B1 и не первое слово предложения.
 */
export function buildGapExercises(story: Story, finder: WordFinder, count: number, random: () => number = Math.random): ChoiceExercise[] {
  const candidates: { sentence: string; match: WordMatch }[] = [];
  const allForms = new Set<string>();

  for (const sentence of story.paragraphs.flat()) {
    const matches = finder.find(sentence).filter(m => m.text.length > 2);
    matches.forEach(m => allForms.add(m.text.toLowerCase()));
    if (sentence.split(" ").length < 5) continue;

    const notFirst = matches.filter(m => m.index > 0);
    const harder = notFirst.filter(m => m.word.level !== "A1");
    const pool = harder.length ? harder : notFirst;
    if (!pool.length) continue;
    const longest = [...pool].sort((a, b) => b.text.length - a.text.length)[0];
    candidates.push({ sentence, match: longest });
  }

  // равномерно по тексту и без повторов одного и того же слова
  const step = Math.max(1, candidates.length / count);
  const chosen: typeof candidates = [];
  const usedForms = new Set<string>();
  for (let i = 0; i < candidates.length && chosen.length < count; i += step) {
    const candidate = candidates[Math.floor(i)];
    const form = candidate.match.text.toLowerCase();
    if (usedForms.has(form)) continue;
    usedForms.add(form);
    chosen.push(candidate);
  }

  const otherForms = [...allForms];
  return chosen.map(({ sentence, match }) => {
    const answer = match.text;
    const wrong = shuffled(otherForms.filter(f => f !== answer.toLowerCase() && Math.abs(f.length - answer.length) < 6), random).slice(0, 3);
    const options = shuffled([answer, ...wrong], random);
    return {
      type: "choice",
      q: sentence.slice(0, match.index) + "___" + sentence.slice(match.index + answer.length),
      options,
      answer: options.indexOf(answer),
      hint: "подсказка: " + match.word.ru,
      explain: "Полностью: " + sentence,
    };
  });
}
