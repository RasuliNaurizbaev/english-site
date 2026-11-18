// Поиск словарных слов в тексте с учётом форм: went → to go, cities → city.
// Та же логика есть в tools/word_forms.py — при изменении правьте оба файла.
import type { StoryWord } from "./types";

const IRREGULAR_VERBS: Record<string, string[]> = {
  be: ["was", "were", "been", "is", "are", "am"], have: ["had", "has"], do: ["did", "done", "does"],
  get: ["got", "gotten"], go: ["went", "gone", "goes"], swim: ["swam", "swum"], find: ["found"],
  choose: ["chose", "chosen"], forget: ["forgot", "forgotten"], buy: ["bought"], hear: ["heard"],
  feel: ["felt"], take: ["took", "taken"], see: ["saw", "seen"], lie: ["lay", "lain", "lying"],
  run: ["ran"], say: ["said"], make: ["made"], come: ["came"], know: ["knew", "known"],
  think: ["thought"], tell: ["told"], give: ["gave", "given"], write: ["wrote", "written"],
  speak: ["spoke", "spoken"], eat: ["ate", "eaten"], drink: ["drank", "drunk"], sleep: ["slept"],
  leave: ["left"], meet: ["met"], pay: ["paid"], send: ["sent"], spend: ["spent"], lose: ["lost"],
  win: ["won"], begin: ["began", "begun"], bring: ["brought"], teach: ["taught"], catch: ["caught"],
  fall: ["fell", "fallen"], break: ["broke", "broken"], sit: ["sat"], stand: ["stood"],
  understand: ["understood"], wear: ["wore", "worn"], sell: ["sold"], keep: ["kept"], build: ["built"],
  drive: ["drove", "driven"], fly: ["flew", "flown"], sing: ["sang", "sung"], become: ["became"],
  hold: ["held"], hide: ["hid", "hidden"], steal: ["stole", "stolen"], throw: ["threw", "thrown"],
  grow: ["grew", "grown"], forgive: ["forgave", "forgiven"], freeze: ["froze", "frozen"],
  feed: ["fed"], lend: ["lent"], ride: ["rode", "ridden"], shine: ["shone"], shake: ["shook", "shaken"],
  wake: ["woke", "woken"], lead: ["led"], blow: ["blew", "blown"], draw: ["drew", "drawn"],
  bite: ["bit", "bitten"], hang: ["hung"], fight: ["fought"], tear: ["tore", "torn"],
};

export function verbForms(verb: string): string[] {
  const forms = new Set([verb, verb + "s", verb + "es", verb + "ed", verb + "d", verb + "ing"]);
  if (verb.endsWith("e")) forms.add(verb.slice(0, -1) + "ing");                 // make → making
  if (/[^aeiou]y$/.test(verb)) {                                               // study → studies, studied
    forms.add(verb.slice(0, -1) + "ies");
    forms.add(verb.slice(0, -1) + "ied");
  }
  if (/[aeiou][bdgklmnprtv]$/.test(verb) && !/[aeiou]{2}[a-z]$/.test(verb)) {  // stop → stopped
    const last = verb.slice(-1);
    forms.add(verb + last + "ed");
    forms.add(verb + last + "ing");
  }
  (IRREGULAR_VERBS[verb] ?? []).forEach(form => forms.add(form));
  return [...forms];
}

export function nounForms(noun: string): string[] {
  if (noun.length <= 2) return [noun];                                    // hi → «his» было бы ошибкой
  const forms = new Set([noun, noun + "s", noun + "es"]);
  if (/[^aeiou]y$/.test(noun)) forms.add(noun.slice(0, -1) + "ies");      // city → cities
  if (noun.endsWith("f")) forms.add(noun.slice(0, -1) + "ves");            // leaf → leaves
  if (noun.endsWith("fe")) forms.add(noun.slice(0, -2) + "ves");           // knife → knives
  return [...forms];
}

/** "to go out" → ["go out", "went out", ...];  "credit card" → ["credit card", "credit cards", ...] */
export function formsOf(english: string): string[] {
  const words = english.trim().split(" ");
  if (words[0].toLowerCase() === "to" && words.length > 1) {
    const rest = words.slice(2);
    return verbForms(words[1].toLowerCase()).map(form => [form, ...rest].join(" "));
  }
  const last = words.pop() as string;
  return nounForms(last).map(form => [...words, form].join(" "));
}

/** Слово с заглавной буквы не в начале предложения — скорее всего имя (Mark, Mrs Green). */
function looksLikeName(text: string, index: number, match: string): boolean {
  if (!/^[A-Z]/.test(match) || index === 0) return false;
  const before = text.slice(0, index).replace(/[\s"“]+$/, "");
  return before !== "" && !/[.!?:]$/.test(before);
}

export interface WordMatch {
  index: number;       // позиция в тексте
  text: string;        // как написано в тексте: "went"
  word: StoryWord;     // словарная запись: "to go"
}

export interface WordFinder {
  find(text: string): WordMatch[];
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Создаёт «искатель» слов: finder.find("He went home") → [{ index: 3, text: "went", word: {en: "to go"} }] */
export function createWordFinder(words: StoryWord[]): WordFinder {
  const wordByForm = new Map<string, StoryWord>();
  for (const word of words) {
    for (const form of formsOf(word.en)) {
      const key = form.toLowerCase();
      if (!wordByForm.has(key)) wordByForm.set(key, word);
    }
  }
  const forms = [...wordByForm.keys()].sort((a, b) => b.length - a.length);   // длинные — первыми
  if (!forms.length) return { find: () => [] };
  const pattern = new RegExp("(?<![\\w'-])(" + forms.map(escapeRegex).join("|") + ")(?![\\w'-])", "gi");

  return {
    find(text) {
      const found: WordMatch[] = [];
      for (const match of text.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (looksLikeName(text, index, match[0])) continue;
        found.push({ index, text: match[0], word: wordByForm.get(match[0].toLowerCase()) as StoryWord });
      }
      return found;
    },
  };
}

/** Если подсветка слов недоступна — «искатель», который ничего не находит. */
export const NO_WORD_FINDER: WordFinder = { find: () => [] };
