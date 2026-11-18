import { describe, expect, it } from "vitest";
import { ContentRepository } from "@/data/contentRepository";
import { createMemoryStorage } from "@/data/storage";
import { ProgressRepository } from "@/data/progressRepository";
import { WordReviewService } from "./wordReview";
import { wordsPlan } from "./todayPlan";
import { MistakesService } from "./mistakesService";
import { AiTestService } from "./aiTests";
import type { GrammarTopic } from "@/domain/types";

function setup(day = 100) {
  let today = day;
  const content = new ContentRepository([], { A1: [["apple", "яблоко"], ["bread", "хлеб"], ["milk", "молоко"]], A2: [["journey", "поездка"]] }, [], {});
  const storage = createMemoryStorage();
  const progress = new ProgressRepository(storage, () => today);
  const review = new WordReviewService(content, progress, () => today);
  return { content, progress, review, storage, setDay: (d: number) => { today = d; } };
}

describe("WordReviewService", () => {
  it("новые слова идут по порядку уровней, с учётом лимита в день", () => {
    const { review, progress } = setup();
    progress.updateWordSettings({ newPerDay: 2 });
    expect(review.newWordKeys(review.newWordsLeftToday())).toEqual(["A1|apple", "A1|bread"]);
    review.grade("A1|apple", "good");
    expect(review.newWordsLeftToday()).toBe(1);
  });
  it("«уже знаю» не тратит лимит новых слов", () => {
    const { review, progress } = setup();
    progress.updateWordSettings({ newPerDay: 2 });
    review.grade("A1|apple", "known");
    expect(review.newWordsLeftToday()).toBe(2);
    expect(review.status("A1|apple")).toBe("learned");
  });
  it("слово возвращается в повторение в нужный день", () => {
    const s = setup(100);
    s.review.grade("A1|apple", "good");           // интервал 1 день
    expect(s.review.dueWordKeys()).toEqual([]);
    s.setDay(101);
    expect(s.review.dueWordKeys()).toEqual(["A1|apple"]);
  });
  it("переносит «выученные» слова из первой версии сайта", () => {
    const content = new ContentRepository([], { A1: [["apple", "яблоко"]] }, [], {});
    const storage = createMemoryStorage();
    storage.set("known", { A1: ["apple"] });
    const progress = new ProgressRepository(storage, () => 100);
    const review = new WordReviewService(content, progress, () => 100);
    expect(review.status("A1|apple")).toBe("learned");
  });
  it("план «Слова» готов, когда нечего повторять", () => {
    const s = setup();
    s.progress.updateWordSettings({ newPerDay: 0 });
    const mistakes = new MistakesService(s.content, s.progress, () => 100);
    expect(wordsPlan({ content: s.content, progress: s.progress, review: s.review, mistakes, aiTests: new AiTestService(s.progress), today: () => 100 }, 100).done).toBe(true);
  });
  it("слова из рассказа: добавляются сразу в сегодняшнее повторение и не тратят лимит новых", () => {
    const s = setup();
    s.progress.updateWordSettings({ newPerDay: 1 });
    expect(s.review.addWords(["A2|journey", "A1|apple", "A9|нет-такого"])).toBe(2);
    expect(s.review.dueWordKeys().sort()).toEqual(["A1|apple", "A2|journey"]);
    expect(s.review.newWordsLeftToday()).toBe(1);
    expect(s.review.addWords(["A2|journey"])).toBe(0);           // уже изучается — не трогаем
  });
});

describe("ProgressRepository", () => {
  it("серия дней считается до вчера, если сегодня ещё не занимались", () => {
    let today = 10;
    const progress = new ProgressRepository(createMemoryStorage(), () => today);
    for (const d of [7, 8, 9]) { today = d; progress.recordActivity("reviews"); }
    today = 10;
    expect(progress.streak()).toBe(3);
    progress.recordActivity("grammar");
    expect(progress.streak()).toBe(4);
  });
  it("тема изучена с 80%, лучший результат сохраняется", () => {
    const progress = new ProgressRepository(createMemoryStorage(), () => 1);
    progress.saveGrammarResult("t", 70);
    expect(progress.isGrammarDone("t")).toBe(false);
    progress.saveGrammarResult("t", 90);
    progress.saveGrammarResult("t", 50);
    expect(progress.grammarResults().t).toMatchObject({ best: 90, done: true });
  });
});

describe("MistakesService", () => {
  it("ошибка в теме → в «Мои ошибки» на завтра; верный ответ при повторении сдвигает срок", () => {
    let today = 50;
    const topic = { id: "A2_05", exercises: [{ type: "choice", q: "?", options: ["a", "b"], answer: 0 }] } as unknown as GrammarTopic;
    const content = new ContentRepository([], {}, [topic], {});
    const progress = new ProgressRepository(createMemoryStorage(), () => today);
    const mistakes = new MistakesService(content, progress, () => today);
    mistakes.recordAnswer("A2_05", 0, true);
    expect(mistakes.total()).toBe(0);
    mistakes.recordAnswer("A2_05", 0, false);
    expect(mistakes.due()).toEqual([]);
    today = 51;
    const [due] = mistakes.due();
    expect(due.topic.id).toBe("A2_05");
    mistakes.review(due.key, true);
    expect(mistakes.due()).toEqual([]);
    expect(mistakes.total()).toBe(1);
  });
});
