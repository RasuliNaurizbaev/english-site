// Диктант: выбор предложений и сравнение написанного с оригиналом по словам.

/** Слова для сравнения: без регистра и знаков препинания; ’ → '. */
export function dictationWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
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
 */
export function checkDictation(original: string, typed: string): DictationResult {
  const shown = original.split(/\s+/).filter(Boolean);              // как показывать (с пунктуацией)
  const expected = shown.map(w => dictationWords(w).join(" "));      // как сравнивать
  const actual = dictationWords(typed);

  // таблица LCS
  const n = expected.length, m = actual.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = expected[i] && expected[i] === actual[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  // восстановить, какие слова совпали
  const matched = new Set<number>(), usedTyped = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (expected[i] && expected[i] === actual[j]) { matched.add(i); usedTyped.add(j); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }

  const countable = expected.filter(Boolean).length || 1;
  return {
    words: shown.map((word, i) => ({ word, ok: matched.has(i) || !expected[i] })),
    extra: actual.filter((_, j) => !usedTyped.has(j)),
    score: matched.size / countable,
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
