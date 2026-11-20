// «Мои слова» — слова, которые пользователь добавил сам, по группам («Кухня», «Работа»…).
// Ключ карточки повторения — "MY|<слово>", как у словарных слов ("A1|apple").

export const MY_LEVEL = "MY";
export const DEFAULT_GROUP = "Общее";
const MAX_EN = 80;
const MAX_RU = 150;
const MAX_GROUP = 40;

export interface MyWord {
  en: string;
  ru: string;
  group: string;
  added: number;      // когда добавлено (мс)
}

export const myWordKey = (en: string) => MY_LEVEL + "|" + en;

/** Лишние пробелы убираются: «  take   off » → «take off». */
export const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

/** Проверка введённого слова. Возвращает текст ошибки или null. */
export function validateMyWord(word: Pick<MyWord, "en" | "ru" | "group">): string | null {
  if (!word.en) return "Введите английское слово.";
  if (!/[a-z]/i.test(word.en)) return "Английское слово должно содержать латинские буквы.";
  if (word.en.length > MAX_EN) return `Слово слишком длинное (больше ${MAX_EN} символов).`;
  if (!word.ru) return "Введите перевод.";
  if (word.ru.length > MAX_RU) return `Перевод слишком длинный (больше ${MAX_RU} символов).`;
  if (word.group.length > MAX_GROUP) return `Название группы слишком длинное (больше ${MAX_GROUP} символов).`;
  return null;
}

/** Группы в порядке появления (первой — та, где самое раннее слово). */
export function groupsOf(words: readonly MyWord[]): string[] {
  return [...new Set([...words].sort((a, b) => a.added - b.added).map(w => w.group))];
}
