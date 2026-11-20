import { describe, expect, it } from "vitest";
import { createMemoryAudioStore } from "@/data/audioStore";
import { joinWithPauses, mp3Seconds, silence } from "@/domain/mp3";
import { MyAudioService, isOutdated } from "./myAudio";

const FRAME = 144;
const clipOf = (text: string) => { const c = new Uint8Array(FRAME * text.length); c.fill(text.charCodeAt(0)); return c; };

function setup(fail?: string) {
  const store = createMemoryAudioStore();
  const asked: string[] = [];
  const service = new MyAudioService(store, async (text, voice) => {
    asked.push(voice + ":" + text);
    if (text === fail) throw new Error("сервис не ответил");
    return clipOf(text);
  }, () => 42);
  return { store, asked, service };
}

describe("mp3: склейка с паузами", () => {
  it("тишина — целые кадры по 24 мс; склейка: пауза в начале, слово, пауза", () => {
    expect(silence(1.8).length).toBe(75 * FRAME);
    expect([...silence(0.024).subarray(0, 4)]).toEqual([0xff, 0xf3, 0x64, 0xc4]);
    const joined = joinWithPauses([clipOf("ab"), clipOf("c")], 0.48, 0.24);
    expect(joined.length).toBe((10 + 2 + 20 + 1 + 20) * FRAME);
    expect(mp3Seconds(joined)).toBeCloseTo(53 * 0.024);
  });
});

describe("MyAudioService: mp3 группы «Моих слов»", () => {
  it("озвучивает каждое слово (без «...»), склеивает по порядку, хранит на устройстве", async () => {
    const s = setup();
    const progress: string[] = [];
    const audio = await s.service.build("Кухня", ["fork", "spoon", "put ... on"], { voice: "jenny", pause: 1.8, onProgress: (d, t) => progress.push(`${d}/${t}`) });
    expect(s.asked.sort()).toEqual(["jenny:fork", "jenny:put on", "jenny:spoon"]);
    expect(progress).toEqual(["0/3", "1/3", "2/3", "3/3"]);
    expect(audio).toMatchObject({ group: "Кухня", words: ["fork", "spoon", "put ... on"], createdAt: 42 });
    expect(audio.mp3).toEqual(joinWithPauses([clipOf("fork"), clipOf("spoon"), clipOf("put on")], 1.8));
    expect((await s.service.recordings()).map(a => a.group)).toEqual(["Кухня"]);
  });

  it("пересборка: уже озвученные слова не запрашиваются снова; удаление стирает ненужную озвучку", async () => {
    const s = setup();
    await s.service.build("Кухня", ["fork", "spoon"], { voice: "jenny", pause: 1.8 });
    await s.service.build("Работа", ["boss", "fork"], { voice: "jenny", pause: 1.8 });
    expect(s.asked.filter(a => a.endsWith("fork"))).toHaveLength(1);
    await s.service.remove("Кухня");
    expect((await s.store.clipIds()).sort()).toEqual(["jenny|boss", "jenny|fork"]);   // fork ещё нужен «Работе»
    await s.service.remove("Работа");
    expect(await s.store.clipIds()).toEqual([]);
  });

  it("ошибка сервиса — mp3 не создаётся, озвученные слова сохраняются для следующей попытки", async () => {
    const s = setup("spoon");
    await expect(s.service.build("Кухня", ["fork", "spoon"], { voice: "jenny", pause: 1.8 })).rejects.toThrow("сервис не ответил");
    expect(await s.service.recordings()).toEqual([]);
    expect(await s.store.clip("jenny|fork")).toBeDefined();
    await expect(s.service.build("Кухня", [], { voice: "jenny", pause: 1.8 })).rejects.toThrow("нет слов");
  });

  it("устаревший mp3: слова группы изменились", async () => {
    const audio = await setup().service.build("Кухня", ["fork"], { voice: "jenny", pause: 1.8 });
    expect(isOutdated(audio, ["fork"])).toBe(false);
    expect(isOutdated(audio, ["fork", "spoon"])).toBe(true);
  });
});
