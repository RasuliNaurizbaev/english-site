// Основные сценарии учёбы: страницы, повторение слов, грамматика, рассказы, караоке, голос браузера.
import { expect, test } from "@playwright/test";
import { GRAMMAR, STORIES, answerAll, fakeBrowserVoice, open, stored } from "./helpers";

test("все разделы открываются без ошибок", async ({ page }) => {
  for (const route of ["/", "/review", "/stories", "/story/" + STORIES[0].id, "/words/A2", "/grammar", "/grammar/" + GRAMMAR[0].id,
    "/practice", "/tests", "/verbs", "/mistakes", "/dictation/" + STORIES[0].id, "/audio/A1"]) {
    await open(page, route);
    await expect(page.locator("main > .error-box"), route).toHaveCount(0);
  }
  await expect(page.locator("#problemBanner")).toHaveCount(0);
});

test("повторение слов: оценки и интервалы", async ({ page }) => {
  await open(page, "/review");
  await page.locator(".flashcard").click();
  await page.locator(".g-good").click();
  const cards = await stored(page, "srs");
  expect(Object.values(cards)).toEqual([expect.objectContaining({ i: 1 })]);
  await page.locator(".flashcard").click();
  await page.locator(".g-again").click();
  await expect(page.getByText("Осталось: 9")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.locator(".g-good")).toBeVisible();
});

test("грамматика: все 40 тем проходятся на 100%, ошибка попадает в «Мои ошибки»", async ({ page }) => {
  for (const topic of GRAMMAR) {
    await open(page, "/grammar/" + topic.id);
    await answerAll(page, ".tasks", topic.exercises);
    await expect(page.locator(".tasks .q-item.bad"), topic.id).toHaveCount(0);
  }
  const results = await stored(page, "grammarDone");
  expect(Object.values(results).filter((r: any) => r.best === 100).length).toBe(GRAMMAR.length);

  // неправильный ответ → «Мои ошибки» (на завтра)
  const topic = GRAMMAR[1];
  const i = topic.exercises.findIndex(e => e.type === "choice");
  await open(page, "/grammar/" + topic.id);
  const exercise = topic.exercises[i] as { options: string[]; answer: number };
  await page.locator(".tasks .q-item").nth(i).locator(".opt").nth((exercise.answer + 1) % exercise.options.length).click();
  expect(Object.keys(await stored(page, "mistakes"))).toEqual([`${topic.id}#${i}`]);
});

test("рассказы: все 40 проходятся на 100%, слова подсвечены, у слов бывает несколько значений", async ({ page }) => {
  for (const story of STORIES) {
    await open(page, "/story/" + story.id);
    await expect(page.locator(".story .sentence")).toHaveCount(story.paragraphs.flat().length);
    await answerAll(page, ".tasks .task-box:nth-of-type(1)", story.questions!.questions);
    // «вставьте слово»: правильный вариант восстанавливаем по исходному предложению
    await page.evaluate(sentences => {
      document.querySelectorAll<HTMLElement>(".tasks .task-box:nth-of-type(2) .q-item").forEach(item => {
        const [before, after] = item.querySelector(".q-text")!.textContent!.replace(/^\d+\.\s/, "").split("_____");
        const original = sentences.find(s => s.startsWith(before) && s.endsWith(after));
        const answer = original?.slice(before.length, original.length - after.length);
        ([...item.querySelectorAll<HTMLElement>(".opt")].find(o => o.textContent!.trim() === answer) ?? item.querySelector<HTMLElement>(".opt"))!.click();
      });
    }, story.paragraphs.flat());
    await expect(page.getByText("Рассказ пройден! Результат: 100%"), story.id).toBeVisible();
  }
  await open(page, "/story/" + STORIES[0].id);
  expect(await page.locator(".story .w").count()).toBeGreaterThan(50);
  const multi = STORIES[0].marks.find(m => m[3].length > 1)!;
  const word = page.locator(`.story .sentence[data-sentence="${multi[0] + 1}"] .w`, { hasText: STORIES[0].paragraphs.flat()[multi[0]].slice(multi[1], multi[1] + multi[2]) }).first();
  await word.click();
  await expect(page.locator(".popover .meaning")).toHaveCount(multi[3].length);
});

test("слова рассказа добавляются в повторение", async ({ page }) => {
  await open(page, "/story/" + STORIES[2].id);
  await page.getByRole("button", { name: /Добавить \d+ новых слов/ }).click();
  await expect(page.getByText(/✓ Добавлено \d+ слов/)).toBeVisible();
  await open(page, "/review");
  expect(Number((await page.getByText(/Осталось: \d+/).textContent())!.match(/\d+/)![0])).toBeGreaterThan(50);
});

test("караоке: подсветка по времени и перемотка по нажатию", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("es.voice", JSON.stringify("jenny")));
  await open(page, "/story/" + STORIES[0].id);
  const timings = STORIES[0].audio.find(t => t.voice === "jenny")!.timings!;
  const audio = page.locator(".player audio");
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState)).toBeGreaterThan(0);
  for (const k of [0, 5, 20, timings.length - 1]) {
    await audio.evaluate((a: HTMLAudioElement, t) => { a.currentTime = t; a.dispatchEvent(new Event("timeupdate")); }, timings[k][0] + 0.3);
    await expect(page.locator(".sentence.now")).toHaveAttribute("data-sentence", String(k));
  }
  await page.locator('.story .sentence[data-sentence="10"]').click();
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeCloseTo(timings[10][0], 0);
});

test("голос браузера: рассказ без mp3 читается, с нажатого предложения до конца", async ({ page }) => {
  await fakeBrowserVoice(page);
  const story = STORIES.find(s => !s.audio.length)!;
  await open(page, "/story/" + story.id);
  await expect(page.locator(".voice-bar")).toContainText("нет mp3");
  await page.locator('.story .sentence[data-sentence="3"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).spoken.length), { timeout: 30_000 }).toBe(story.paragraphs.flat().length - 2);
  expect(await page.evaluate(() => (window as any).spoken[0])).toBe(story.paragraphs.flat()[2]);
});
