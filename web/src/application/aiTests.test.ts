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
const fakeAi = (reply: string, name = "Fake"): AiProvider => ({ name, complete: async () => reply });
const brokenAi = (name: string): AiProvider => ({ name, complete: async () => { throw new Error(name + ": лимит"); } });

describe("AI-тесты", () => {
  it("принимает правильный тест, даже обёрнутый в ```json```, и сохраняет его", async () => {
    const service = new AiTestService(new ProgressRepository(createMemoryStorage(), () => 1), () => 42);
    const test = await service.generate([fakeAi("Вот тест:\n```json\n" + JSON.stringify(goodTest) + "\n```")], { level: "B1", focus: "" });
    expect(test).toMatchObject({ id: "ai_42", kind: "generated", title: "Mini test" });
    expect(service.generatedTests().length).toBe(1);
  });
  it("отклоняет тест с неправильным ответом — его не показываем", async () => {
    const bad = structuredClone(goodTest);
    bad.sections[0].exercises[0] = { type: "choice", q: "?", options: ["a", "b"], answer: 5, explain: "" };
    const service = new AiTestService(new ProgressRepository(createMemoryStorage(), () => 1));
    await expect(service.generate([fakeAi(JSON.stringify(bad))], { level: "B1", focus: "" })).rejects.toThrow(/ошибками/);
    expect(service.generatedTests().length).toBe(0);
  });
  it("один сломанный вопрос из многих убирается, тест принимается; сломано больше четверти — тест бракуется", async () => {
    const many = structuredClone(goodTest);
    many.sections[0].exercises = Array.from({ length: 8 }, (_, i) => ({ type: "input", q: `I ___ (go) ${i}.`, answer: ["went"], explain: "" }));
    many.sections[0].exercises[4] = { type: "input", q: "No gap here.", answer: ["x"], explain: "" };   // как прислал Groq
    const service = new AiTestService(new ProgressRepository(createMemoryStorage(), () => 1));
    const test = await service.generate([fakeAi(JSON.stringify(many))], { level: "B1", focus: "" });
    expect(test.sections[0].exercises.length).toBe(7);
    expect(test.sections[0].exercises.some(e => e.q === "No gap here.")).toBe(false);
    many.sections[0].exercises[5] = many.sections[0].exercises[6] = many.sections[0].exercises[4];         // 3 из 8 — больше четверти
    await expect(service.generate([fakeAi(JSON.stringify(many))], { level: "B1", focus: "" })).rejects.toThrow(/ровно один ___/);
  });
  it("Gemini не ответил или прислал плохой тест → берётся Groq", async () => {
    const service = new AiTestService(new ProgressRepository(createMemoryStorage(), () => 1));
    const viaGroq = await service.generate([brokenAi("Google Gemini"), fakeAi(JSON.stringify(goodTest), "Groq")], { level: "A2", focus: "" });
    expect(viaGroq.provider).toBe("Groq");
    const afterBadTest = await service.generate([fakeAi('{"title":"x","sections":[]}', "Google Gemini"), fakeAi(JSON.stringify(goodTest), "Groq")], { level: "A2", focus: "" });
    expect(afterBadTest.provider).toBe("Groq");
  });
  it("если не ответил никто — понятная ошибка с причинами от обоих", async () => {
    const service = new AiTestService(new ProgressRepository(createMemoryStorage(), () => 1));
    await expect(service.generate([brokenAi("Google Gemini"), brokenAi("Groq")], { level: "B1", focus: "" })).rejects.toThrow("Google Gemini: лимит → Groq: лимит");
    await expect(service.generate([], { level: "B1", focus: "" })).rejects.toThrow(/ключ Gemini или Groq/);
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

describe("настройки AI", () => {
  it("модель по умолчанию выбирается из списка; старые настройки переносятся", async () => {
    const { AI_SERVICES, pickDefaultModel, normalizeSettings, providersInOrder } = await import("@/data/ai/aiProvider");
    const [gemini, groq] = AI_SERVICES;
    expect(pickDefaultModel(groq, ["gemma2-9b-it", "llama-3.3-70b-versatile", "whisper-large"])).toBe("llama-3.3-70b-versatile");
    expect(pickDefaultModel(gemini, ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"])).toBe("gemini-2.5-flash-lite");   // lite — быстрая
    expect(pickDefaultModel(gemini, ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.8-flash"])).toBe("gemini-flash-lite-latest");
    expect(pickDefaultModel(gemini, ["gemini-2.0-flash", "gemini-3.0-flash", "gemini-3.0-flash-preview"])).toBe("gemini-3.0-flash");   // lite нет — самая новая flash
    expect(pickDefaultModel(groq, ["some-model"])).toBe("some-model");                                                           // ничего не подошло — первая
    const migrated = normalizeSettings({ preset: "groq", apiKey: "k1", model: "m1" });
    expect(migrated.groq).toEqual({ apiKey: "k1", model: "m1" });
    expect(providersInOrder(migrated).map(p => p.name)).toEqual(["Groq"]);                // нет ключа Gemini — сразу Groq
    const both = normalizeSettings({ groq: { apiKey: "a", model: "x" }, gemini: { apiKey: "b", model: "y" } });
    expect(providersInOrder(both).map(p => p.name)).toEqual(["Google Gemini", "Groq"]);   // есть ключ Gemini — он первый
  });
});
