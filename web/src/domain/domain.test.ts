import { describe, expect, it } from "vitest";
import { applyRating, nextIntervals, statusOf, KNOWN_INTERVAL } from "./spacedRepetition";
import { createWordFinder, formsOf } from "./wordForms";
import { parseMarkdown, inlineToHtml } from "./markdown";
import { buildGapExercises } from "./storyTasks";
import { normalizeAnswer, plural, formatDuration, shuffled } from "./text";
import type { Story, StoryWord } from "./types";

describe("wordForms", () => {
  it("формы глаголов: правильные, неправильные, удвоение согласной", () => {
    expect(formsOf("to go")).toEqual(expect.arrayContaining(["go", "goes", "went", "gone", "going"]));
    expect(formsOf("to stop")).toEqual(expect.arrayContaining(["stopped", "stopping"]));
    expect(formsOf("to study")).toEqual(expect.arrayContaining(["studies", "studied"]));
    expect(formsOf("to get up")).toEqual(expect.arrayContaining(["got up", "getting up"]));
  });
  it("множественное число, но не для коротких слов (hi → his — ошибка)", () => {
    expect(formsOf("city")).toContain("cities");
    expect(formsOf("knife")).toContain("knives");
    expect(formsOf("hi")).toEqual(["hi"]);
  });
  it("находит слова в тексте и пропускает имена", () => {
    const words: StoryWord[] = [{ en: "to go", ru: "идти", level: "A1" }, { en: "mark", ru: "оценка", level: "A2" }];
    const found = createWordFinder(words).find("Yesterday Mark went home. Mark is a good mark.");
    // первое Mark — имя в середине предложения (пропущено), второе — начало предложения (не отличить от слова)
    expect(found.map(m => m.text)).toEqual(["went", "Mark", "mark"]);
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
  const story: Story = {
    id: "t", title: "T", wordCount: 0, audio: [], questions: null,
    paragraphs: [["Yesterday Tom went to the old station early.", "He bought a return ticket at the station.", "The journey was long and very boring for him."]],
    words: [
      { en: "to go", ru: "идти", level: "A1" }, { en: "return ticket", ru: "билет туда и обратно", level: "A2" },
      { en: "journey", ru: "поездка", level: "A2" }, { en: "station", ru: "станция", level: "A2" }, { en: "boring", ru: "скучный", level: "A2" },
    ],
  };
  it("в каждом задании правильный ответ есть среди вариантов и совпадает с текстом", () => {
    const gaps = buildGapExercises(story, createWordFinder(story.words), 5, () => 0.3);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      const filled = g.q.replace("___", g.options[g.answer]);
      expect(story.paragraphs[0]).toContain(filled);
    }
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
