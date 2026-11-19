// Общие помощники для тестов в браузере.
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import type { Exercise, GrammarTopic, LevelTest, Story } from "../src/domain/types";

const data = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), "utf8"));
export const STORIES = data<Story[]>("stories.json");
export const GRAMMAR = data<GrammarTopic[]>("grammar.json");
export const TESTS = data<LevelTest[]>("tests.json");

/** Открыть страницу сайта по адресу после # (например "/grammar"). */
export async function open(page: Page, route: string, query = "") {
  await page.goto(`./${query}#${route}`);
  await expect(page.locator("main")).not.toBeEmpty();
}

/** Ответить правильно на все упражнения внутри контейнера (ответы берём из данных). */
export async function answerAll(page: Page, scope: string, exercises: Exercise[]) {
  await page.evaluate(({ scope, exercises }) => {
    const items = document.querySelectorAll<HTMLElement>(`${scope} .q-item`);
    exercises.forEach((e, i) => {
      const item = items[i];
      if (!item) return;
      if (e.type === "choice") item.querySelectorAll<HTMLElement>(".opt")[e.answer].click();
      else if (e.type === "tf") item.querySelectorAll<HTMLElement>(".opt")[e.answer ? 0 : 1].click();
      else if (e.type === "input") {
        const input = item.querySelector("input")!;
        input.value = e.answer[0];
        input.dispatchEvent(new Event("input"));
        item.querySelector<HTMLElement>("button.check")!.click();
      } else {
        for (const word of e.answer.split(/\s+/)) {
          [...item.querySelectorAll<HTMLElement>(".order-bank .tok")].find(b => b.textContent!.trim() === word)?.click();
        }
        item.querySelector<HTMLElement>("button.check")!.click();
      }
    });
  }, { scope, exercises });
}

/** Подменить голос браузера: «читает» мгновенно и запоминает, что прочитал (в тестах звука нет). */
export async function fakeBrowserVoice(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { spoken: string[] }).spoken = spoken;
    let queue: SpeechSynthesisUtterance[] = [], busy = false, cancelled = false;
    const next = () => {
      if (cancelled || !queue.length) { busy = false; return; }
      busy = true;
      const u = queue.shift()!;
      spoken.push(u.text);
      u.onstart?.(new Event("start") as SpeechSynthesisEvent);
      setTimeout(() => { u.onend?.(new Event("end") as SpeechSynthesisEvent); next(); }, 10);
    };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak(u: SpeechSynthesisUtterance) { cancelled = false; queue.push(u); if (!busy) next(); },
        cancel() { queue = []; cancelled = true; busy = false; },
        pause() {}, resume() {}, getVoices: () => [],
      },
    });
  });
}

/** Значение из localStorage сайта. */
export const stored = (page: Page, key: string) => page.evaluate(k => JSON.parse(localStorage.getItem("es." + k) ?? "null"), key);
