// Текст рассказа по кускам: обычный текст и словарные слова (по готовым отметкам из build_site_data.py).
import type { Story, StoryWord } from "./types";

export interface TextPiece {
  text: string;
  meanings?: StoryWord[];      // есть — значит, это словарное слово (значений может быть несколько)
}

/** Отметки, сгруппированные по номеру предложения. */
export function marksBySentence(story: Story): Map<number, Story["marks"]> {
  const result = new Map<number, Story["marks"]>();
  for (const mark of story.marks ?? []) {
    const list = result.get(mark[0]) ?? [];
    list.push(mark);
    result.set(mark[0], list);
  }
  return result;
}

/** Делит предложение на куски: обычный текст и словарные слова. */
export function splitSentence(text: string, marks: Story["marks"], words: StoryWord[]): TextPiece[] {
  const pieces: TextPiece[] = [];
  let position = 0;
  for (const [, start, length, meaningIds] of [...marks].sort((a, b) => a[1] - b[1])) {
    if (start < position) continue;                       // на всякий случай: пересечения пропускаем
    if (start > position) pieces.push({ text: text.slice(position, start) });
    pieces.push({ text: text.slice(start, start + length), meanings: meaningIds.map(i => words[i]).filter(Boolean) });
    position = start + length;
  }
  if (position < text.length) pieces.push({ text: text.slice(position) });
  return pieces;
}

/** Самый «сложный» уровень среди значений — для цвета подсветки. */
export function highestLevel(meanings: StoryWord[]): string {
  const order = ["A1", "A2", "B1"];
  return meanings.reduce((best, m) => (order.indexOf(m.level) > order.indexOf(best) ? m.level : best), meanings[0]?.level ?? "A1");
}
