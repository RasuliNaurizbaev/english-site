import { describe, expect, it } from "vitest";
import { chooseVoice, speechText } from "./useSpeech";

const v = (name: string, lang = "en-US") => ({ name, lang } as SpeechSynthesisVoice);

describe("выбор голоса", () => {
  it("пропускает голоса для забавы и неанглийские", () => {
    expect(chooseVoice([v("Albert"), v("Bad News"), v("Milena", "ru-RU"), v("Eddy (English (US))"), v("Daniel", "en-GB")])?.name).toBe("Daniel");
  });
  it("предпочитает улучшенный и известный хороший голос", () => {
    expect(chooseVoice([v("Fred"), v("Daniel", "en-GB"), v("Samantha")])?.name).toBe("Samantha");
    expect(chooseVoice([v("Samantha"), v("Ava (Premium)")])?.name).toBe("Ava (Premium)");
  });
  it("если остались только странные — берёт хоть какой-то английский; если нет английских — null", () => {
    expect(chooseVoice([v("Albert")])?.name).toBe("Albert");
    expect(chooseVoice([v("Milena", "ru-RU")])).toBeNull();
  });
});

describe("текст для произношения", () => {
  it("убирает скобки и многоточия", () => {
    expect(speechText("change (money)")).toBe("change");
    expect(speechText("I'd like...")).toBe("I'd like");
    expect(speechText("How about...?")).toBe("How about?");
    expect(speechText("to go")).toBe("to go");
  });
});
