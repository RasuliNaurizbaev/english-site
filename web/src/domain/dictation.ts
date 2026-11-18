// Диктант: выбор предложений и сравнение написанного с оригиналом по словам.

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 25 → "twenty five", 1500 → "one thousand five hundred" (числа до миллиона). */
export function numberToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + numberToWords(n % 100) : "");
  if (n < 1_000_000) return numberToWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + numberToWords(n % 1000) : "");
  return String(n);
}

/**
 * Слова для сравнения: без регистра и знаков препинания; ’ → '.
 * Дефис делит слово (twenty-five → twenty five), цифры становятся словами (25 → twenty five),
 * поэтому «25», «twenty-five» и «twenty five» считаются одинаковыми.
 */
export function dictationWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/(\d),(\d{3})/g, "$1$2")                       // 1,500 → 1500
    .replace(/[^a-z0-9'\s]/g, " ")                          // дефис и знаки препинания → пробел
    .replace(/\d+/g, digits => " " + numberToWords(Number(digits)) + " ")
    .split(/\s+/)
    .filter(Boolean);
}

export interface WordCheck {
  word: string;                        // слово из оригинала (как в тексте)
  ok: boolean;                         // написано правильно
}

export interface DictationResult {
  words: WordCheck[];                  // оригинал по словам: какие написаны верно
  extra: string[];                     // лишние слова, которых нет в оригинале
  score: number;                       // доля правильных слов, 0..1
}

/**
 * Сравнивает написанное с оригиналом. Ищет самую длинную общую последовательность слов (LCS),
 * поэтому одно пропущенное слово не «сдвигает» и не портит остальные.
 * Слово оригинала может состоять из нескольких частей («twenty-five» → twenty, five) —
 * оно верно, только если совпали все его части.
 */
export function checkDictation(original: string, typed: string): DictationResult {
  const shown = original.split(/\s+/).filter(Boolean);              // как показывать (с пунктуацией)
  // части для сравнения и к какому показанному слову каждая относится
  const expected: { part: string; word: number }[] = [];
  shown.forEach((word, index) => dictationWords(word).forEach(part => expected.push({ part, word: index })));
  const actual = dictationWords(typed);

  // таблица LCS
  const n = expected.length, m = actual.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = expected[i].part === actual[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  // восстановить, какие части совпали
  const matched = new Set<number>(), usedTyped = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (expected[i].part === actual[j]) { matched.add(i); usedTyped.add(j); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }

  const wordOk = (index: number) => expected.every((e, i) => e.word !== index || matched.has(i));
  return {
    words: shown.map((word, index) => ({ word, ok: wordOk(index) })),
    extra: actual.filter((_, j) => !usedTyped.has(j)),
    score: n ? matched.size / n : 1,
  };
}

/** До `count` предложений средней длины (5–16 слов), равномерно по тексту. Возвращает номера предложений. */
export function pickDictationSentences(sentences: string[], count: number): number[] {
  const suitable = sentences
    .map((text, index) => ({ index, words: text.split(/\s+/).length }))
    .filter(s => s.words >= 5 && s.words <= 16)
    .map(s => s.index);
  const step = Math.max(1, suitable.length / count);
  const chosen: number[] = [];
  for (let i = 0; i < suitable.length && chosen.length < count; i += step) chosen.push(suitable[Math.floor(i)]);
  return chosen;
}
