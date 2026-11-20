// Проигрывание списка слов вслух по кругу («Учу» → ▶ / 🔀): что и на каком языке произносить.

/** en — только английский; en-ru — слово, потом перевод; ru-en — перевод, потом слово; ru — только перевод. */
export type PlayMode = "en" | "en-ru" | "ru-en" | "ru";
export const PLAY_MODES: [PlayMode, string][] = [["en", "EN"], ["en-ru", "EN → RU"], ["ru-en", "RU → EN"], ["ru", "RU"]];

export interface Phrase { text: string; lang: "en" | "ru" }

export function phrasesOf(word: { en: string; ru: string }, mode: PlayMode): Phrase[] {
  const en: Phrase = { text: word.en, lang: "en" }, ru: Phrase = { text: word.ru, lang: "ru" };
  return { en: [en], "en-ru": [en, ru], "ru-en": [ru, en], ru: [ru] }[mode];
}

/**
 * Порядок на очередной круг. По порядку — как в списке; вперемешку — новый порядок каждый круг,
 * и новый круг не начинается со слова, которым закончился предыдущий (иначе оно прозвучит дважды подряд).
 */
export function roundOrder<T>(items: readonly T[], random: boolean, previousLast?: T, rnd: () => number = Math.random): T[] {
  if (!random) return [...items];
  const order = [...items];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === previousLast) [order[0], order[1]] = [order[1], order[0]];
  return order;
}
