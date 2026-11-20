import { describe, expect, it } from "vitest";
import { ContentRepository } from "@/data/contentRepository";
import { createMemoryStorage } from "@/data/storage";
import { ProgressRepository } from "@/data/progressRepository";
import { WordReviewService } from "./wordReview";
import { pickStory, randomStory, storyPlan, todayStoryPick, wordsPlan } from "./todayPlan";
import { MistakesService } from "./mistakesService";
import { AiTestService } from "./aiTests";
import { MyWordsService } from "./myWords";
import { ProgressBackup } from "@/data/progressBackup";
import type { GrammarTopic, Story } from "@/domain/types";
import { storyLevel } from "@/domain/storyLevel";
import { dayNumber } from "@/domain/text";

function setup(day = 100) {
  let today = day;
  const content = new ContentRepository([], { A1: [["apple", "яблоко"], ["bread", "хлеб"], ["milk", "молоко"]], A2: [["journey", "поездка"]] }, [], {});
  const storage = createMemoryStorage();
  const progress = new ProgressRepository(storage, () => today);
  let now = 1_000_000;
  const review = new WordReviewService(content, progress, () => today, () => now++);
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
    s.review.grade("A1|apple", "good");           // новое слово: «Хорошо» — через неделю
    s.setDay(106);
    expect(s.review.dueWordKeys()).toEqual([]);
    s.setDay(107);
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
    expect(wordsPlan({ content: s.content, progress: s.progress, review: s.review, myWords: new MyWordsService(s.content, s.progress, s.review), mistakes, aiTests: new AiTestService(s.progress), backup: new ProgressBackup(s.storage), today: () => 100 }, 100).done).toBe(true);
  });
  it("слова из рассказа: добавляются сразу в сегодняшнее повторение и не тратят лимит новых", () => {
    const s = setup();
    s.progress.updateWordSettings({ newPerDay: 1 });
    expect(s.review.addWords(["A2|journey", "A1|apple", "A9|нет-такого"])).toBe(2);
    expect(s.review.dueWordKeys().sort()).toEqual(["A1|apple", "A2|journey"]);
    expect(s.review.newWordsLeftToday()).toBe(1);
    expect(s.review.addWords(["A2|journey"])).toBe(0);           // уже изучается — не трогаем
  });
  it("список слов: новое → «учу» (в повторение сегодня) → «выучено» → снова «учу»", () => {
    const s = setup();
    s.progress.updateWordSettings({ newPerDay: 1 });
    s.review.markLearning("A1|bread");
    expect(s.review.status("A1|bread")).toBe("learning");
    expect(s.review.dueWordKeys()).toEqual(["A1|bread"]);
    expect(s.review.newWordsLeftToday()).toBe(1);                 // лимит новых не тратится
    s.review.markLearned("A1|bread");
    expect(s.review.status("A1|bread")).toBe("learned");
    expect(s.review.dueWordKeys()).toEqual([]);
    s.review.markLearning("A1|bread");
    expect(s.review.status("A1|bread")).toBe("learning");
    expect(s.review.nextIntervals("A1|bread").good).toBe(1);      // учим заново маленькими шагами
    s.review.markLearned("A1|milk");                               // сразу из новых — в выученные
    expect(s.review.status("A1|milk")).toBe("learned");
    s.review.markLearning("A9|нет-такого");
    expect(s.review.status("A9|нет-такого")).toBe("new");
  });
  it("время последнего изучения: у новых карточек — точное, у старых — день из d − i", () => {
    const s = setup();
    s.review.markLearned("A1|milk");
    s.review.grade("A1|apple", "easy");
    expect(s.review.studiedAt("A1|apple")).toBeGreaterThan(s.review.studiedAt("A1|milk"));   // apple изучено позже
    expect(s.review.studiedAt("A1|bread")).toBe(0);                                          // не изучали
    s.storage.set("srs", { "A1|bread": { i: 30, e: 2.5, d: 125, r: 3, l: 0 } });            // карточка без t
    const old = new WordReviewService(s.content, s.progress, () => 100);
    const at = new Date(old.studiedAt("A1|bread"));
    expect(dayNumber(at)).toBe(95);                                                          // 125 − 30
    expect([at.getHours(), at.getMinutes()]).toEqual([0, 0]);                                // начало дня
  });
});

describe("MyWordsService («Мои слова»)", () => {
  function mySetup() {
    const s = setup();
    let now = 1;
    return { ...s, my: new MyWordsService(s.content, s.progress, s.review, () => now++) };
  }
  it("добавить: лишние пробелы убираются, слово сразу в повторении на сегодня и не тратит лимит новых", () => {
    const s = mySetup();
    expect(s.my.add({ en: "  take   off ", ru: "взлетать", group: "" })).toBeNull();
    expect(s.my.list()).toEqual([{ en: "take off", ru: "взлетать", group: "Общее", added: 1 }]);
    expect(s.content.word("MY|take off")).toEqual({ key: "MY|take off", level: "MY", en: "take off", ru: "взлетать" });
    expect(s.review.dueWordKeys()).toEqual(["MY|take off"]);
    expect(s.review.newWordsLeftToday()).toBe(10);
    expect(s.review.levelStats("MY")).toEqual({ total: 1, learning: 1, learned: 0 });
  });
  it("ошибки: пустое, без латиницы, повтор (без учёта регистра)", () => {
    const s = mySetup();
    expect(s.my.add({ en: "", ru: "x", group: "" })).toMatch(/английское/);
    expect(s.my.add({ en: "кошка", ru: "cat", group: "" })).toMatch(/латинские/);
    expect(s.my.add({ en: "cat", ru: " ", group: "" })).toMatch(/перевод/);
    expect(s.my.add({ en: "cat", ru: "кошка", group: "Животные" })).toBeNull();
    expect(s.my.add({ en: "Cat", ru: "кот", group: "" })).toMatch(/уже есть/);
  });
  it("исправить: история повторений переходит к новому написанию; удалить — вместе с историей", () => {
    const s = mySetup();
    s.my.add({ en: "recieve", ru: "получать", group: "Работа" });
    s.review.grade("MY|recieve", "good");
    expect(s.my.update("recieve", { en: "receive", ru: "получать", group: "Работа" })).toBeNull();
    expect(s.content.hasWord("MY|recieve")).toBe(false);
    expect(s.review.status("MY|receive")).toBe("learning");
    expect(s.review.nextIntervals("MY|receive").good).toBeGreaterThan(7);   // не новое — история сохранилась
    s.my.remove("receive");
    expect(s.my.list()).toEqual([]);
    expect(s.review.status("MY|receive")).toBe("new");
    expect(s.content.hasWord("MY|receive")).toBe(false);
  });
  it("группы — в порядке появления; слова переживают перезапуск (хранятся в прогрессе)", () => {
    const s = mySetup();
    s.my.add({ en: "fork", ru: "вилка", group: "Кухня" });
    s.my.add({ en: "boss", ru: "начальник", group: "Работа" });
    s.my.add({ en: "spoon", ru: "ложка", group: "Кухня" });
    expect(s.my.groups()).toEqual(["Кухня", "Работа"]);
    const content = new ContentRepository([], {}, [], {});
    const again = new MyWordsService(content, s.progress, new WordReviewService(content, s.progress, () => 100));
    expect(again.list().map(w => w.en)).toEqual(["fork", "boss", "spoon"]);
    expect(content.word("MY|spoon")?.ru).toBe("ложка");
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

describe("рассказ дня", () => {
  const story = (id: string) => ({ id, title: id, paragraphs: [], words: [], marks: [], audio: [], questions: null, wordCount: 0 } as Story);
  function storySetup() {
    const content = new ContentRepository(["01_a", "02_b", "20_c", "21_d", "40_e"].map(story), { A1: [] }, [], {});
    const storage = createMemoryStorage();
    const progress = new ProgressRepository(storage, () => 100);
    const review = new WordReviewService(content, progress, () => 100);
    const mistakes = new MistakesService(content, progress, () => 100);
    return { content, progress, review, myWords: new MyWordsService(content, progress, review), mistakes, aiTests: new AiTestService(progress), backup: new ProgressBackup(storage), today: () => 100 };
  }
  it("уровень по номеру: 01–20 — A2, 21+ — B1", () => {
    expect(["01_a", "20_c", "21_d", "40_e"].map(storyLevel)).toEqual(["A2", "A2", "B1", "B1"]);
  });
  it("случайный рассказ нужного уровня, сначала непройденные, не повторяет текущий", () => {
    const s = storySetup();
    expect(randomStory(s, "B1", undefined, () => 0)!.id).toBe("21_d");
    expect(randomStory(s, "B1", "21_d", () => 0)!.id).toBe("40_e");
    s.progress.saveStoryResult("01_a", 100);
    const ids = new Set(Array.from({ length: 20 }, (_, k) => randomStory(s, "A2", undefined, () => k / 20)!.id));
    expect([...ids].sort()).toEqual(["02_b", "20_c"]);   // пройденный 01 не выпадает
  });
  it("выбор запоминается на сегодня; повторный выбор — другой рассказ", () => {
    const s = storySetup();
    expect(todayStoryPick(s, 100)).toBeNull();
    expect(storyPlan(s, 100).link).toBe("/stories");
    const first = pickStory(s, 100, "B1", () => 0)!;
    expect(first).toEqual({ day: 100, level: "B1", id: "21_d" });
    expect(storyPlan(s, 100).link).toBe("/story/21_d");
    expect(pickStory(s, 100, "B1", () => 0)!.id).toBe("40_e");
    expect(todayStoryPick(s, 101)).toBeNull();                    // на следующий день — выбрать заново
  });
});
