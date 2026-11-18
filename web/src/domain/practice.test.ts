import { describe, expect, it } from "vitest";
import { checkDictation, numberToWords, pickDictationSentences } from "./dictation";
import { isCorrectForm, pickVerbsForPractice, type IrregularVerb } from "./verbs";
import { recordMistake, reviewMistake } from "./mistakes";

describe("dictation", () => {
  it("всё верно — 100%, регистр и знаки препинания не важны", () => {
    const r = checkDictation("Anna smiled. \"That's a wonderful idea!\"", "anna smiled thats a wonderful idea");
    expect(r.words.filter(w => !w.ok).map(w => w.word)).toEqual(['"That\'s']);   // that's ≠ thats
    const r2 = checkDictation("He went to the station.", "he went to the station");
    expect(r2.score).toBe(1);
  });
  it("пропущенное слово не портит остальные; лишние слова видны отдельно", () => {
    const r = checkDictation("She bought a return ticket.", "she bought return the ticket");
    expect(r.words.map(w => w.ok)).toEqual([true, true, false, true, true]);
    expect(r.extra).toEqual(["the"]);
    expect(r.score).toBeCloseTo(4 / 5);
  });
  it("цифры и слова — одно и то же: 25 = twenty-five = twenty five", () => {
    for (const typed of ["Anna is 25 years old", "anna is twenty-five years old", "Anna is twenty five years old."]) {
      const r = checkDictation("Anna is twenty-five years old.", typed);
      expect(r.score, typed).toBe(1);
      expect(r.words.every(w => w.ok), typed).toBe(true);
    }
    expect(checkDictation("It costs 1,500 dollars.", "it costs one thousand five hundred dollars").score).toBe(1);
  });
  it("слово из нескольких частей верно, только если совпали все части", () => {
    const r = checkDictation("She is twenty-five.", "she is twenty");
    expect(r.words.map(w => w.ok)).toEqual([true, true, false]);
  });
  it("numberToWords", () => {
    expect([0, 7, 13, 40, 99, 105, 2026].map(numberToWords)).toEqual(
      ["zero", "seven", "thirteen", "forty", "ninety nine", "one hundred five", "two thousand twenty six"]);
  });
  it("выбирает предложения средней длины равномерно", () => {
    const sentences = ["Short.", ...Array.from({ length: 30 }, (_, i) => `This is a normal sentence number ${i}.`)];
    const picked = pickDictationSentences(sentences, 10);
    expect(picked.length).toBe(10);
    expect(picked).not.toContain(0);
  });
});

describe("verbs", () => {
  const verbs: IrregularVerb[] = ["go", "be", "see", "take"].map(base => ({ base, past: ["x"], participle: ["y"], ru: "", level: "A1" }));
  it("принимает любой из вариантов формы", () => {
    expect(isCorrectForm(" Learnt ", ["learned", "learnt"])).toBe(true);
    expect(isCorrectForm("learn", ["learned", "learnt"])).toBe(false);
  });
  it("глаголы с ошибками и новые идут первыми", () => {
    const stats = { go: { right: 5, wrong: 0 }, be: { right: 5, wrong: 0 }, see: { right: 0, wrong: 4 } };
    const picked = pickVerbsForPractice(verbs, stats, 2, () => 0);
    expect(picked.map(v => v.base).sort()).toEqual(["see", "take"]);
  });
});

describe("mistakes", () => {
  it("1 → 3 → 7 → 14 дней, затем убирается; ошибка — снова через день", () => {
    let m = recordMistake("A2_05", 3, 100);
    expect(m.due).toBe(101);
    m = reviewMistake(m, true, 101)!;
    expect(m.due).toBe(104);
    m = reviewMistake(m, false, 104)!;
    expect(m).toMatchObject({ step: 0, due: 105 });
    for (const day of [105, 108, 115]) m = reviewMistake(m, true, day)!;
    expect(reviewMistake(m, true, 129)).toBeNull();
  });
});
