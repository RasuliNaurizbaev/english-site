// Практика: тесты, AI-тест (с подменённым сервисом), глаголы, диктант, защита от сбоев.
import { expect, test } from "@playwright/test";
import { STORIES, TESTS, answerAll, fakeBrowserVoice, open, stored } from "./helpers";

test("тест уровня: все ответы верны → высший уровень и запись в историю", async ({ page }) => {
  const placement = TESTS.find(t => t.kind === "placement")!;
  await open(page, "/tests/" + placement.id);
  for (let s = 0; s < placement.sections.length; s++) {
    await answerAll(page, `.tasks:nth-of-type(${s + 1})`, placement.sections[s].exercises);
  }
  await expect(page.locator(".flashcard.done")).toContainText("100%");
  const history = await stored(page, "testResults");
  expect(history[0]).toMatchObject({ testId: placement.id, score: 100, level: placement.bands.at(-1)!.level });
});

test("AI-тест: сайт отправляет запрос, проверяет ответ и открывает новый тест", async ({ page }) => {
  const aiTest = {
    title: "AI test", titleRu: "Тест от AI", description: "", minutes: 5,
    sections: [{ kind: "grammar", title: "Грамматика", exercises: [{ type: "choice", q: "She ___ tea.", options: ["like", "likes"], answer: 1, explain: "" }] }],
  };
  let requestBody: any = null;
  await page.route("https://api.groq.com/**", async route => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(aiTest) } }] } });
  });
  await open(page, "/tests");
  await page.locator(".ai-panel summary").click();
  await page.getByPlaceholder("название модели").fill("test-model");
  await page.getByPlaceholder("ключ из личного кабинета").fill("test-key");
  await page.getByRole("button", { name: "✨ Создать тест" }).click();
  await expect(page.locator("h1")).toHaveText("Тест от AI");
  expect(requestBody.model).toBe("test-model");
  expect(await stored(page, "ai")).toMatchObject({ apiKey: "test-key" });   // ключ — только в этом браузере
});

test("неправильный ответ AI не показывается", async ({ page }) => {
  await page.route("https://api.groq.com/**", route => route.fulfill({ json: { choices: [{ message: { content: '{"title":"x","sections":[]}' } }] } }));
  await open(page, "/tests");
  await page.locator(".ai-panel summary").click();
  await page.getByPlaceholder("название модели").fill("m");
  await page.getByPlaceholder("ключ из личного кабинета").fill("k");
  await page.getByRole("button", { name: "✨ Создать тест" }).click();
  await expect(page.getByText(/AI прислал тест с ошибками/)).toBeVisible();
});

test("неправильные глаголы: правильный ответ засчитывается", async ({ page }) => {
  await open(page, "/verbs");
  const base = (await page.locator(".verb-card .fc-main").textContent())!.trim();
  const verb = await page.evaluate(async b => (await (await fetch("data/verbs.json")).json()).find((v: any) => v.base === b), base);
  await page.locator(".verb-inputs input").nth(0).fill(verb.past[0]);
  await page.locator(".verb-inputs input").nth(1).fill(verb.participle.at(-1));
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.locator(".q-explain")).toContainText("✓ Верно");
  expect((await stored(page, "verbStats"))[base]).toEqual({ right: 1, wrong: 0 });
});

test("диктант: проверка по словам", async ({ page }) => {
  await fakeBrowserVoice(page);
  const story = STORIES.find(s => !s.audio.length)!;           // без mp3 — читает голос браузера
  await open(page, "/dictation/" + story.id);
  await page.getByRole("button", { name: "▶ Слушать" }).click();
  const heard = await page.evaluate(() => (window as any).spoken[0] as string);
  await page.locator(".dictation-input").fill(heard.toLowerCase().replace(/[.,!?"]/g, ""));
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.locator(".dictation-result .task-score")).toHaveText("Верно: 100%");
  await expect(page.locator(".dictation-result .bad-word")).toHaveCount(0);
});

test("защита от сбоев: сломанная часть заменяется сообщением, остальное работает", async ({ page }) => {
  const story = "/story/" + STORIES[0].id;
  const cases: [string, string, () => Promise<void>][] = [
    ["player", story, async () => { await expect(page.locator(".voice-bar")).toContainText("плеер не работает"); }],
    ["wordMarks", story, async () => { await expect(page.locator(".story .w")).toHaveCount(0); await expect(page.locator(".tasks .q-item").first()).toBeVisible(); }],
    ["exercises", story, async () => { await expect(page.locator(".story .sentence").first()).toBeVisible(); await expect(page.locator(".tasks .error-box").first()).toBeVisible(); }],
    ["markdown", "/grammar/A2_05_present_perfect", async () => { await expect(page.locator(".md")).toHaveCount(0); await expect(page.locator(".tasks .q-item").first()).toBeVisible(); }],
    ["testsPage", "/tests", async () => { await expect(page.locator("main > .error-box")).toBeVisible(); }],
    ["verbsPage", "/verbs", async () => { await expect(page.locator("main > .error-box")).toBeVisible(); }],
  ];
  for (const [part, route, check] of cases) {
    await open(page, route, "?break=" + part);
    await check();
    await expect(page.locator("#problemBanner"), part).toBeVisible();
    for (const other of ["/", "/stories", "/grammar", "/practice"]) {          // другие вкладки работают
      if (other === route) continue;
      await page.evaluate(r => { location.hash = r; }, other);
      await expect(page.locator("main > .error-box"), `${part} → ${other}`).toHaveCount(0);
    }
  }
});
