// Практика: тесты, AI-тест (с подменённым сервисом), глаголы, диктант, защита от сбоев.
import { expect, test } from "@playwright/test";
import { answerAll, fakeBrowserVoice, fakeMp3, open, stored, STORIES, TESTS } from "./helpers";

// mp3 на сайте — из Supabase; в тестах — подменённые (без сети и без трафика Supabase)
test.beforeEach(({ page }) => fakeMp3(page));

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

const AI_TEST = {
  title: "AI test", titleRu: "Тест от AI", description: "", minutes: 5,
  sections: [{ kind: "grammar", title: "Грамматика", exercises: [{ type: "choice", q: "She ___ tea.", options: ["like", "likes"], answer: 1, explain: "" }] }],
};

test("AI: есть ключ Gemini → сначала Gemini; Gemini отказал → тест создаёт Groq", async ({ page }) => {
  const calls: string[] = [];
  let groqBody: any = null;
  await page.route("https://generativelanguage.googleapis.com/**", async route => {
    const url = route.request().url();
    calls.push("gemini " + url.split("/").pop());
    if (url.endsWith("/models")) return route.fulfill({ json: { data: [{ id: "models/gemini-2.5-flash-lite" }, { id: "models/gemini-2.5-flash" }] } });
    return route.fulfill({ status: 429, body: "rate limit" });                   // лимит исчерпан
  });
  await page.route("https://api.groq.com/**", async route => {
    const url = route.request().url();
    calls.push("groq " + url.split("/").pop());
    if (url.endsWith("/models")) return route.fulfill({ json: { data: [{ id: "whisper-large-v3" }, { id: "llama-3.3-70b-versatile" }] } });
    groqBody = route.request().postDataJSON();
    return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(AI_TEST) } }] } });
  });
  await open(page, "/tests");
  await page.locator(".ai-panel > summary").click();
  await page.getByPlaceholder("ключ Google Gemini").fill("gemini-key");
  await page.getByRole("button", { name: "Проверить ключ" }).first().click();
  await expect(page.getByText("✓ Ключ работает, моделей: 2")).toBeVisible();
  await page.getByPlaceholder("ключ Groq").fill("groq-key");
  await page.getByRole("button", { name: "Проверить ключ" }).nth(1).click();
  await expect(page.getByText("✓ Ключ работает, моделей: 1")).toBeVisible();      // whisper отфильтрован
  await page.getByRole("button", { name: "✨ Создать тест" }).click();
  await expect(page.locator("h1")).toHaveText("Тест от AI");
  expect(calls.filter(c => c.endsWith("completions"))).toEqual(["gemini completions", "groq completions"]);   // сначала Gemini, потом Groq
  expect(groqBody.model).toBe("llama-3.3-70b-versatile");
  expect(await stored(page, "ai")).toMatchObject({ gemini: { apiKey: "gemini-key", model: "gemini-2.5-flash-lite" }, groq: { apiKey: "groq-key" } });
});

test("AI: нет ключа Gemini → сразу Groq", async ({ page }) => {
  let geminiCalled = false;
  await page.route("https://generativelanguage.googleapis.com/**", route => { geminiCalled = true; return route.abort(); });
  await page.route("https://api.groq.com/**", route => route.request().url().endsWith("/models")
    ? route.fulfill({ json: { data: [{ id: "llama-3.3-70b-versatile" }] } })
    : route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(AI_TEST) } }] } }));
  await open(page, "/tests");
  await page.locator(".ai-panel > summary").click();
  await page.getByPlaceholder("ключ Groq").fill("groq-key");
  await page.getByRole("button", { name: "Проверить ключ" }).nth(1).click();
  await expect(page.getByText("✓ Ключ работает")).toBeVisible();
  await page.getByRole("button", { name: "✨ Создать тест" }).click();
  await expect(page.locator("h1")).toHaveText("Тест от AI");
  expect(geminiCalled).toBe(false);
});

test("AI: неверный ключ и плохой тест — понятные сообщения, сломанный тест не показывается", async ({ page }) => {
  await page.route("https://api.groq.com/**", route => route.request().url().endsWith("/models")
    ? route.fulfill({ status: 401, body: "bad key" })
    : route.fulfill({ json: { choices: [{ message: { content: '{"title":"x","sections":[]}' } }] } }));
  await open(page, "/tests");
  await page.locator(".ai-panel > summary").click();
  await page.getByPlaceholder("ключ Groq").fill("wrong");
  await page.getByRole("button", { name: "Проверить ключ" }).nth(1).click();
  await expect(page.getByText("Groq: ключ не подошёл")).toBeVisible();
  await page.getByPlaceholder("появится после").nth(1).fill("some-model");
  await page.getByRole("button", { name: "✨ Создать тест" }).click();
  await expect(page.getByText(/AI прислал тест с ошибками/)).toBeVisible();
});

test("AI через сервер сайта: вход по коду → тест создаётся без своих ключей", async ({ page }) => {
  let loggedIn = false;
  const completions: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/api/session")) return route.fulfill({ json: { user: loggedIn ? "rasul" : null, services: loggedIn ? ["gemini", "groq"] : [] } });
    if (path.endsWith("/api/login")) {
      if (route.request().postDataJSON().code !== "good-code-123456") return route.fulfill({ status: 401, json: { error: "Неверный код доступа." } });
      loggedIn = true;
      return route.fulfill({ json: { user: "rasul", services: ["gemini", "groq"] } });
    }
    const body = route.request().postDataJSON();
    completions.push(body.service);
    return body.service === "gemini"
      ? route.fulfill({ status: 502, json: { error: "Google Gemini: превышен лимит" } })
      : route.fulfill({ json: { text: JSON.stringify(AI_TEST) } });
  });
  await page.route(/googleapis|groq\.com/, route => route.abort());              // в сервисы напрямую — ни одного запроса
  await open(page, "/tests");
  await page.locator(".ai-panel > summary").click();
  await page.getByPlaceholder("код доступа").fill("wrong");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверный код доступа.")).toBeVisible();
  await page.getByPlaceholder("код доступа").fill("good-code-123456");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Вы вошли: rasul")).toBeVisible();
  await page.getByRole("button", { name: "✨ Создать тест" }).click();
  await expect(page.locator("h1")).toHaveText("Тест от AI");
  expect(completions).toEqual(["gemini", "groq"]);                               // Gemini отказал → Groq
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
  // слова результата разделены пробелами (раньше склеивались: «Annaistwenty…»)
  const shown = (await page.locator(".dictation-result").textContent())!;
  expect(shown).toContain(heard.split(" ").slice(0, 2).join(" "));
});

test("диктант: цифры вместо слов засчитываются (25 = twenty-five)", async ({ page }) => {
  await fakeBrowserVoice(page);
  const story = STORIES.find(s => s.id === "01_weekend_by_the_sea")!;
  await open(page, "/dictation/" + story.id);
  // первое предложение диктанта в этом рассказе: "Anna is twenty-five years old."
  await page.locator(".dictation-input").fill("Anna is 25 years old");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.locator(".dictation-result .task-score")).toHaveText("Верно: 100%");
  await expect(page.locator(".dictation-result")).toContainText("Anna is twenty-five years old.");
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
