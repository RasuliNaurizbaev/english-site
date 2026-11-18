import { describe, expect, it } from "vitest";
import { AiTestService, buildUserPrompt, extractJson } from "./aiTests";
import { ProgressRepository } from "@/data/progressRepository";
import { createMemoryStorage } from "@/data/storage";
import type { AiProvider } from "@/data/ai/aiProvider";
import { levelForScore, testProblems } from "@/domain/testValidation";
import type { LevelTest } from "@/domain/types";

const goodTest = {
  title: "Mini test", titleRu: "Мини-тест", description: "", minutes: 10,
  sections: [{ kind: "grammar", title: "Грамматика", exercises: [
    { type: "choice", q: "She ___ here.", options: ["live", "lives"], answer: 1, explain: "3 лицо" },
    { type: "input", q: "I ___ (go) yesterday.", answer: ["went"], explain: "" },
  ] }],
};
/** Подставной AI: возвращает заранее заданный текст (в тестах интернет не нужен). */
const fakeAi = (reply: string): AiProvider => ({ complete: async () => reply });

describe("AI-тесты", () => {
  it("принимает правильный тест, даже обёрнутый в ```json```, и сохраняет его", async () => {
    const service = new AiTestService(new ProgressRepository(createMemoryStorage(), () => 1), () => 42);
    const test = await service.generate(fakeAi("Вот тест:\n```json\n" + JSON.stringify(goodTest) + "\n```"), { level: "B1", focus: "" });
    expect(test).toMatchObject({ id: "ai_42", kind: "generated", title: "Mini test" });
    expect(service.generatedTests().length).toBe(1);
  });
  it("отклоняет тест с неправильным ответом — его не показываем", async () => {
    const bad = structuredClone(goodTest);
    bad.sections[0].exercises[0] = { type: "choice", q: "?", options: ["a", "b"], answer: 5, explain: "" };
    const service = new AiTestService(new ProgressRepository(createMemoryStorage(), () => 1));
    await expect(service.generate(fakeAi(JSON.stringify(bad)), { level: "B1", focus: "" })).rejects.toThrow(/ошибками/);
    expect(service.generatedTests().length).toBe(0);
  });
  it("в задание для AI попадают уже заданные вопросы — чтобы не было повторов", () => {
    expect(buildUserPrompt({ level: "A2", focus: "Past Simple" }, ["She ___ here."])).toContain("- She ___ here.");
  });
  it("extractJson находит JSON внутри текста", () => {
    expect(extractJson('ok {"a": 1} end')).toEqual({ a: 1 });
    expect(() => extractJson("нет json")).toThrow();
  });
});

describe("testValidation", () => {
  it("уровень по проценту", () => {
    const test = { bands: [{ min: 0, level: "A1" }, { min: 35, level: "A2" }, { min: 65, level: "B1" }] } as LevelTest;
    expect([10, 35, 64, 90].map(p => levelForScore(test, p))).toEqual(["A1", "A2", "A2", "B1"]);
  });
  it("находит ошибки формата", () => {
    expect(testProblems(goodTest)).toEqual([]);
    expect(testProblems({ title: "x", sections: [{ kind: "reading", exercises: [] }] }).length).toBeGreaterThan(0);
  });
});
