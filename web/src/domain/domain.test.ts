import { describe, expect, it } from "vitest";
import { applyRating, nextIntervals, statusOf, KNOWN_INTERVAL } from "./spacedRepetition";
import { highestLevel, marksBySentence, splitSentence } from "./storyText";
import { parseMarkdown, inlineToHtml } from "./markdown";
import { buildGapExercises } from "./storyTasks";
import { normalizeAnswer, plural, formatDuration, shuffled } from "./text";
import type { Story, StoryWord } from "./types";

describe("storyText", () => {
  const words: StoryWord[] = [{ en: "left", ru: "левый", level: "A1" }, { en: "to leave", ru: "уходить", level: "A2" }, { en: "station", ru: "станция", level: "A2" }];
  it("делит предложение на куски по отметкам; у слова может быть несколько значений", () => {
    const text = "He left the station.";
    const pieces = splitSentence(text, [[0, text.indexOf("left"), 4, [0, 1]], [0, text.indexOf("station"), 7, [2]]], words);
    expect(pieces.map(p => p.text)).toEqual(["He ", "left", " the ", "station", "."]);
    expect(pieces[1].meanings!.map(m => m.ru)).toEqual(["левый", "уходить"]);
    expect(highestLevel(pieces[1].meanings!)).toBe("A2");
  });
  it("отметки группируются по предложениям", () => {
    const story = { marks: [[0, 1, 2, [0]], [2, 0, 3, [1]], [0, 5, 2, [2]]] } as unknown as Story;
    const grouped = marksBySentence(story);
    expect(grouped.get(0)!.length).toBe(2);
    expect(grouped.get(2)!.length).toBe(1);
  });
});

describe("spacedRepetition", () => {
  const today = 1000;
  it("новое слово: Хорошо → 1 день, затем 3 дня, затем × лёгкость", () => {
    const c1 = applyRating(undefined, "good", today);
    expect(c1).toMatchObject({ i: 1, d: today + 1, r: 1 });
    const c2 = applyRating(c1, "good", today + 1);
    expect(c2.i).toBe(3);
    const c3 = applyRating(c2, "good", today + 4);
    expect(c3.i).toBe(Math.round(3 * 2.5));
  });
  it("Снова — показать сегодня, лёгкость падает, но не ниже 1.3", () => {
    let card = applyRating(undefined, "good", today);
    for (let k = 0; k < 10; k++) card = applyRating(card, "again", today);
    expect(card.i).toBe(0);
    expect(card.d).toBe(today);
    expect(card.e).toBeCloseTo(1.3);
  });
  it("Уже знаю — 60 дней, статус «выучено»", () => {
    const card = applyRating(undefined, "known", today);
    expect(card.d).toBe(today + KNOWN_INTERVAL);
    expect(statusOf(card)).toBe("learned");
    expect(statusOf(undefined)).toBe("new");
  });
  it("Легко всегда больше, чем Хорошо", () => {
    const card = { i: 10, e: 2.5, d: today, r: 3, l: 0 };
    const n = nextIntervals(card);
    expect(n.easy).toBeGreaterThan(n.good);
    expect(n.good).toBeGreaterThan(n.hard);
  });
  it("исходная карточка не меняется", () => {
    const card = { i: 3, e: 2.5, d: today, r: 2, l: 0 };
    applyRating(card, "good", today);
    expect(card.i).toBe(3);
  });
});

describe("markdown", () => {
  const blocks = parseMarkdown(`## Когда используем
Обычный **текст**.
> I have been to London. — Я был в Лондоне.
> She has gone.
| Форма | Пример |
|---|---|
| + | I have |
⚠ I have seen him yesterday → I saw him yesterday
!! Совет
- один
- два`);
  it("распознаёт все виды блоков", () => {
    expect(blocks.map(b => b.kind)).toEqual(["heading", "paragraph", "examples", "table", "mistakes", "tip", "list"]);
  });
  it("примеры, таблица, ошибки разобраны по частям", () => {
    expect(blocks[2]).toMatchObject({ items: [{ en: "I have been to London.", ru: "Я был в Лондоне." }, { en: "She has gone.", ru: null }] });
    expect(blocks[3]).toMatchObject({ header: ["Форма", "Пример"], rows: [["+", "I have"]] });
    expect(blocks[4]).toMatchObject({ items: [{ wrong: "I have seen him yesterday", right: "I saw him yesterday" }] });
  });
  it("HTML экранируется (безопасно для v-html)", () => {
    expect(inlineToHtml("<script> **b**")).toBe("&lt;script&gt; <b>b</b>");
  });
});

describe("storyTasks", () => {
  const sentences = ["Yesterday Tom went to the old station early.", "He bought a return ticket at the station.", "The journey was long and very boring for him."];
  const story: Story = {
    id: "t", title: "T", wordCount: 0, audio: [], questions: null,
    paragraphs: [sentences],
    words: [
      { en: "station", ru: "станция", level: "A2" }, { en: "return ticket", ru: "билет туда и обратно", level: "A2" },
      { en: "journey", ru: "поездка", level: "A2" }, { en: "boring", ru: "скучный", level: "A2" },
    ],
    marks: [],
  };
  // отметка = [предложение, начало, длина, значения]; позиции считаем, а не пишем руками
  const mark = (s: number, word: string, id: number, from = 0): Story["marks"][number] => [s, sentences[s].indexOf(word, from), word.length, [id]];
  story.marks = [mark(0, "station", 0), mark(1, "return ticket", 1), mark(1, "station", 0), mark(2, "journey", 2), mark(2, "boring", 3)];
  it("отметки указывают на правильные слова", () => {
    for (const [s, start, length, ids] of story.marks) {
      expect(sentences[s].slice(start, start + length).toLowerCase()).toBe(story.words[ids[0]].en.toLowerCase());
    }
  });
  it("в каждом задании правильный ответ есть среди вариантов и совпадает с текстом", () => {
    const gaps = buildGapExercises(story, 5, () => 0.3);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) expect(sentences).toContain(g.q.replace("___", g.options[g.answer]));
  });
});

describe("text", () => {
  it("normalizeAnswer", () => expect(normalizeAnswer("  Didn’t   GO. ")).toBe("didn't go"));
  it("plural", () => expect([1, 2, 5, 11, 22].map(n => plural(n, "день", "дня", "дней"))).toEqual(["день", "дня", "дней", "дней", "дня"]));
  it("formatDuration", () => expect(formatDuration(125)).toBe("2:05"));
  it("shuffled не меняет исходный массив", () => {
    const a = [1, 2, 3];
    shuffled(a);
    expect(a).toEqual([1, 2, 3]);
  });
});
