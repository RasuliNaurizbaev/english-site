import { describe, expect, it } from "vitest";
import { ProgressBackup } from "./progressBackup";
import { createMemoryStorage } from "./storage";

const fixedDate = () => new Date("2026-11-18T10:00:00Z");

describe("резервная копия прогресса", () => {
  it("сохраняет весь прогресс, кроме ключей AI, и восстанавливает его в другом браузере", () => {
    const source = createMemoryStorage();
    source.set("srs", { "A1|apple": { i: 3 } });
    source.set("storyDone", { "01_x": { score: 90 } });
    source.set("ai", { gemini: { apiKey: "secret" } });
    const file = new ProgressBackup(source, fixedDate).export();
    expect(Object.keys(file.data)).toEqual(["srs", "storyDone"]);       // ключа AI в файле нет
    expect(JSON.stringify(file)).not.toContain("secret");

    const target = createMemoryStorage();
    target.set("srs", { "A2|old": { i: 1 } });
    target.set("ai", { groq: { apiKey: "mine" } });
    const backup = new ProgressBackup(target);
    const { file: parsed, summary } = backup.inspect(JSON.stringify(file));
    expect(summary).toMatchObject({ words: 1, stories: 1 });
    backup.restore(parsed);
    expect(target.get("srs", {})).toEqual({ "A1|apple": { i: 3 } });       // старый прогресс заменён
    expect(target.get("ai", {})).toEqual({ groq: { apiKey: "mine" } });     // свои ключи AI остались
  });
  it("имя файла с датой", () => {
    expect(new ProgressBackup(createMemoryStorage(), fixedDate).fileName()).toBe("english-progress-2026-11-18.json");
  });
  it("чужой или испорченный файл — понятная ошибка, прогресс не трогаем", () => {
    const backup = new ProgressBackup(createMemoryStorage());
    expect(() => backup.inspect("не json")).toThrow(/не удалось прочитать/);
    expect(() => backup.inspect('{"a": 1}')).toThrow(/не файл прогресса/);
    expect(() => backup.inspect('{"format":"english-site-progress","version":99,"data":{}}')).toThrow(/новой версией/);
  });
});
