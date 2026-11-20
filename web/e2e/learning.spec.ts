// Основные сценарии учёбы: страницы, повторение слов, грамматика, рассказы, караоке, голос браузера.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { answerAll, fakeBrowserVoice, fakeMp3, GRAMMAR, open, stored, STORIES } from "./helpers";

// mp3 на сайте — из Supabase; в тестах — подменённые (без сети и без трафика Supabase)
test.beforeEach(({ page }) => fakeMp3(page));

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
  await expect(page.locator(".fc-actions.four small")).toHaveText(["сегодня", "завтра", "1 неделя", "4 недели"]);
  await page.locator(".g-good").click();
  const cards = await stored(page, "srs");
  expect(Object.values(cards)).toEqual([expect.objectContaining({ i: 7 })]);
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
  await expect(page.locator(".player audio")).toHaveAttribute("src", /^https:\/\/rmbcltczrruvlepsmtwd\.supabase\.co\/storage\/v1\/object\/public\/mp3%20audios\/stories\/.+\/jenny\.mp3$/);
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

test("список слов: по 100, «Ещё 100 →» заменяет сотню следующей", async ({ page }) => {
  await open(page, "/words/A2");
  const rows = page.locator(".word-list li");
  await expect(rows).toHaveCount(100);
  const first = await rows.first().locator(".en").textContent();
  await expect(page.locator(".words-range")).toHaveText(/Слова 1–100 из 906/);
  await page.getByRole("button", { name: "Ещё 100 →" }).click();
  await expect(page.locator(".words-range")).toHaveText(/Слова 101–200 из 906/);
  await expect(rows).toHaveCount(100);
  expect(await rows.first().locator(".en").textContent()).not.toBe(first);
  for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Ещё 100 →" }).click();
  await expect(page.locator(".words-range")).toHaveText(/Слова 901–906 из 906/);   // последняя страница
  await expect(page.getByRole("button", { name: "Ещё 100 →" })).toBeDisabled();
  await page.getByPlaceholder("Поиск").fill("ticket");                          // поиск — снова с начала
  await expect(page.locator(".words-range")).toHaveText(/Слова 1–/);
});

test("повторение: «Я это уже знаю» — слово выучено, видно сообщение", async ({ page }) => {
  await open(page, "/review");
  const word = (await page.locator(".fc-main").textContent())!.trim();
  await page.getByRole("button", { name: "Я это уже знаю" }).click();
  await expect(page.locator(".known-note")).toHaveText(`✓ «${word}» → выучено (следующий показ через 60 дней)`);
  await expect(page.locator(".fc-main")).not.toHaveText(word);
  await open(page, "/words/A1");
  await page.getByPlaceholder("Поиск").fill(word);
  await expect(page.locator(".word-list li").filter({ has: page.locator(".en", { hasText: new RegExp(`^${word}$`) }) }).locator(".st")).toHaveText("выучено");
});

test("список слов: статусы в фильтрах — новые → учу → выучено → учу", async ({ page }) => {
  await open(page, "/words/A1");
  const row = page.locator(".word-list li").first();
  await expect(row.locator(".speak-cell + .en")).toHaveText("apple");             // порядок: 🔊, слово, перевод, статус
  await expect(row.locator(".st")).toHaveText("новое");
  await expect(row.locator(".st-btn")).toHaveCount(0);                             // во «Все» — только статус

  await page.locator(".segmented").getByRole("button", { name: "Новые", exact: true }).click();
  await expect(row.locator(".st-btn")).toHaveText(["учу", "выучено"]);
  await row.getByRole("button", { name: "учу", exact: true }).click();
  await expect(page.locator(".words-change")).toContainText("«apple» → учу");
  await expect(page.locator(".plan-card.compact")).toContainText("К повторению: 1");
  await expect(page.locator(".word-list .en").first()).not.toHaveText("apple");    // ушло из «Новых»
  expect((await stored(page, "srs"))["A1|apple"]).toMatchObject({ i: 0 });

  await page.locator(".segmented").getByRole("button", { name: "Учу", exact: true }).click();
  await expect(page.locator(".word-list li")).toHaveCount(1);
  await expect(row.locator(".st-btn")).toHaveText(["выучено"]);
  await row.getByRole("button", { name: "выучено", exact: true }).click();
  await expect(page.locator(".word-list li")).toHaveCount(0);

  await page.locator(".segmented").getByRole("button", { name: "Выучено", exact: true }).click();
  await expect(row.locator(".en")).toHaveText("apple");
  await expect(row.locator(".st-btn")).toHaveText(["учу"]);
  await row.getByRole("button", { name: "учу", exact: true }).click();
  await page.locator(".segmented").getByRole("button", { name: "Все", exact: true }).click();
  await expect(row.locator(".st")).toHaveText("учу");
});

test("«Выучено»: последние изученные — сверху", async ({ page }) => {
  await open(page, "/words/A1");
  await page.locator(".segmented").getByRole("button", { name: "Новые", exact: true }).click();
  const words = page.locator(".word-list .en");
  const first = await words.nth(0).textContent(), third = await words.nth(2).textContent();
  await page.locator(".word-list li").nth(0).getByRole("button", { name: "выучено", exact: true }).click();   // сначала первое
  await expect(words.first()).not.toHaveText(first!);
  await page.locator(".word-list li").filter({ hasText: third! }).getByRole("button", { name: "выучено", exact: true }).click();
  await page.locator(".segmented").getByRole("button", { name: "Выучено", exact: true }).click();
  await expect(words).toHaveText([third!, first!]);                               // последнее выученное — первым
  await expect(page.locator(".words-range")).toContainText("последние изученные — сверху");
});

test("«Мои слова»: добавить по группам, повторить, исправить, удалить", async ({ page }) => {
  await open(page, "/words/MY");
  await expect(page.locator(".level-chip.MY")).toContainText("Мои");
  await expect(page.getByText("Своих слов пока нет")).toBeVisible();
  const form = page.locator(".my-word-form");
  const add = async (en: string, ru: string, group: string) => {
    await form.getByPlaceholder("English").fill(en);
    await form.getByPlaceholder("Перевод").fill(ru);
    await form.getByPlaceholder("Группа").fill(group);
    await form.getByRole("button", { name: "+ Добавить слово" }).click();
  };
  await add("frying pan", "сковорода", "Кухня");
  await expect(page.locator(".words-change")).toContainText("«frying pan» добавлено в «Кухня»");
  await add("deadline", "срок сдачи", "Работа");
  await add("Frying  Pan", "ещё раз", "Кухня");
  await expect(page.locator(".my-word-message")).toContainText("уже есть");

  await expect(page.locator(".word-list li")).toHaveCount(2);
  await page.locator(".segmented").first().getByRole("button", { name: "Работа", exact: true }).click();   // группы
  await expect(page.locator(".word-list .en")).toHaveText(["deadline"]);
  await page.locator(".segmented").first().getByRole("button", { name: "Все группы", exact: true }).click();
  await expect(page.locator(".plan-card.compact")).toContainText("К повторению: 2");
  await page.screenshot({ path: "test-results/my-words.png", fullPage: true });

  // исправить написание: история повторений сохраняется
  await page.locator(".word-list li").filter({ hasText: "deadline" }).getByTitle("Исправить").click();
  await form.getByPlaceholder("English").fill("dead line");
  await form.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator(".word-list .en")).toHaveText(["frying pan", "dead line"]);
  expect(Object.keys(await stored(page, "srs")).sort()).toEqual(["MY|dead line", "MY|frying pan"]);

  // удалить — двумя нажатиями
  const row = page.locator(".word-list li").filter({ hasText: "dead line" });
  await row.getByTitle("Удалить").click();
  await row.getByRole("button", { name: "удалить?" }).click();
  await expect(page.locator(".word-list li")).toHaveCount(1);
  expect(Object.keys(await stored(page, "srs"))).toEqual(["MY|frying pan"]);

  // в повторении — с пометкой «Мои слова» (новые словарные слова отключены, чтобы карточка была одна)
  await page.evaluate(() => localStorage.setItem("es.srsSettings", JSON.stringify({ newPerDay: 0 })));
  await open(page, "/review");
  await expect(page.locator(".flashcard .badge").first()).toHaveText("Мои слова");
  await expect(page.locator(".fc-main")).toHaveText("frying pan");
});

test("«Аудио → Мои»: mp3 группы — сделать, устарел после изменения слов, удалить; без входа — понятная ошибка", async ({ page }) => {
  const words = [
    { en: "fork", ru: "вилка", group: "Кухня", added: 1 },
    { en: "spoon", ru: "ложка", group: "Кухня", added: 2 },
    { en: "boss", ru: "начальник", group: "Работа", added: 3 },
  ];
  await open(page, "/");
  await page.evaluate(w => localStorage.setItem("es.myWords", JSON.stringify(w)), words);
  const asked: string[] = [];
  let loggedIn = false;
  await page.route("**/api/tts", async route => {
    if (!loggedIn) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Войдите по коду доступа." }) });
    asked.push(route.request().postDataJSON().text);
    const frame = Buffer.alloc(144); frame.set([0xff, 0xf3, 0x64, 0xc4]);
    await route.fulfill({ contentType: "audio/mpeg", body: Buffer.concat(Array(40).fill(frame)) });   // ~1 с тишины
  });
  await open(page, "/audio/MY");
  await page.reload();                                                      // «Мои слова» читаются при запуске сайта
  const kitchen = page.locator(".my-audio-card").filter({ hasText: "Кухня" });
  await expect(page.locator(".my-audio-card .audio-title b")).toHaveText(["Кухня", "Работа"]);
  await expect(kitchen.locator(".audio-range")).toHaveText("fork, spoon");

  await kitchen.getByRole("button", { name: "🎙 Сделать mp3" }).click();
  await expect(page.locator(".my-word-message")).toContainText("после входа по коду");
  loggedIn = true;
  await kitchen.getByRole("button", { name: "🎙 Сделать mp3" }).click();
  await expect(kitchen.locator("audio")).toHaveCount(1);
  expect(asked.sort()).toEqual(["fork", "spoon"]);
  await expect.poll(() => kitchen.locator("audio").evaluate((a: HTMLAudioElement) => a.duration)).toBeCloseTo(0.5 + 2 * (0.96 + 1.8), 1);
  await expect(kitchen.getByRole("link", { name: "⬇ Скачать" })).toHaveAttribute("download", "my-words-Кухня.mp3");
  await page.screenshot({ path: "test-results/my-audio.png", fullPage: true });

  // mp3 хранится на устройстве: после перезагрузки на месте; новое слово в группе — «слова изменились»
  await page.evaluate(w => localStorage.setItem("es.myWords", JSON.stringify(w)), [...words, { en: "pan", ru: "сковорода", group: "Кухня", added: 4 }]);
  await page.reload();
  await expect(kitchen.locator("audio")).toHaveCount(1);
  await expect(kitchen.locator(".my-audio-outdated")).toHaveText("слова изменились");
  await kitchen.getByRole("button", { name: "🔄 Пересоздать mp3" }).click();
  await expect(kitchen.locator(".my-audio-outdated")).toHaveCount(0);
  expect(asked.sort()).toEqual(["fork", "pan", "spoon"]);                  // fork и spoon не озвучивались заново

  await kitchen.getByRole("button", { name: "🗑 Удалить mp3" }).click();
  await kitchen.getByRole("button", { name: "Удалить mp3?" }).click();
  await expect(kitchen.locator("audio")).toHaveCount(0);
  await page.reload();
  await expect(kitchen.getByRole("button", { name: "🎙 Сделать mp3" })).toBeVisible();
});

test("«Учу»: ▶ Play читает слова по кругу до ⏹ Stop; 🔀 Random; EN / EN → RU / RU", async ({ page }) => {
  await fakeBrowserVoice(page);
  await open(page, "/words/A1");
  await page.locator(".segmented").getByRole("button", { name: "Новые", exact: true }).click();
  const learn: [string, string][] = [];
  for (let k = 0; k < 3; k++) {
    const row = page.locator(".word-list li").first();
    learn.push([(await row.locator(".en").textContent())!, (await row.locator(".ru").textContent())!]);
    await row.getByRole("button", { name: "учу", exact: true }).click();
  }
  await page.locator(".segmented").first().getByRole("button", { name: "Учу", exact: true }).click();
  const spoken = () => page.evaluate(() => (window as any).spoken as string[]);
  const player = page.locator(".word-player");

  await player.getByRole("button", { name: "▶ Play" }).click();                       // по умолчанию EN → RU
  await expect.poll(async () => (await spoken()).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(8);
  expect((await spoken()).slice(0, 8)).toEqual([...learn.flat(), ...learn[0]]);       // по порядку и снова с начала
  await expect(page.locator(".word-list li.playing")).toHaveCount(1);
  await page.screenshot({ path: "test-results/word-player.png" });
  await player.getByRole("button", { name: "⏹ Stop" }).click();
  const stoppedAt = (await spoken()).length;
  await page.waitForTimeout(2500);
  expect((await spoken()).length).toBe(stoppedAt);                                    // после «Стоп» тишина
  await expect(page.locator(".word-list li.playing")).toHaveCount(0);

  await player.getByRole("button", { name: "EN", exact: true }).click();
  await page.evaluate(() => ((window as any).spoken.length = 0));
  await player.getByRole("button", { name: "🔀 Random" }).click();
  await expect.poll(async () => (await spoken()).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  expect([...(await spoken()).slice(0, 3)].sort()).toEqual(learn.map(w => w[0]).sort()); // каждое слово по разу, только английский
  await player.getByRole("button", { name: "RU", exact: true }).click();               // режим меняется на ходу
  await expect.poll(async () => (await spoken()).some(t => learn.some(w => w[1] === t)), { timeout: 30_000 }).toBe(true);
  await page.locator(".segmented").first().getByRole("button", { name: "Все", exact: true }).click();   // ушли из «Учу» — стоп
  await expect(player).toHaveCount(0);
  const after = (await spoken()).length;
  await page.waitForTimeout(2500);
  expect((await spoken()).length).toBe(after);
});

test("«Сегодня»: выбор уровня — случайный рассказ, повторное нажатие — другой", async ({ page }) => {
  await open(page, "/");
  const card = page.locator(".story-plan");
  await expect(card.locator(".plan-text")).toContainText("Выберите уровень");
  await card.getByRole("button", { name: "B1" }).click();
  await expect(card.locator(".plan-text")).toContainText("B1 · ");
  const first = (await card.locator(".plan-text").textContent())!;
  await card.getByRole("button", { name: /B1/ }).click();
  await expect(card.locator(".plan-text")).not.toHaveText(first);
  await card.getByRole("button", { name: "A2" }).click();
  await expect(card.locator(".plan-text")).toContainText("A2 · ");
  const title = (await card.locator(".plan-text").textContent())!.replace("A2 · ", "");
  await open(page, "/");                                                           // выбор запомнился
  await expect(card.locator(".plan-text")).toContainText(title);
  await card.getByRole("link", { name: "Открыть" }).click();
  await expect(page.locator(".story-title")).toHaveText(title);
  expect(Number(page.url().match(/story\/(\d+)/)![1])).toBeLessThanOrEqual(20);
});

test("резервная копия: сохранить прогресс в файл и восстановить в чистом браузере", async ({ page, browser }) => {
  // немного прогресса + ключ AI (он не должен попасть в файл)
  await open(page, "/review");
  await page.locator(".flashcard").click();
  await page.locator(".g-good").click();
  await page.evaluate(() => localStorage.setItem("es.ai", JSON.stringify({ gemini: { apiKey: "secret", model: "m" } })));
  await open(page, "/");
  await page.locator(".backup-panel summary").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Сохранить в файл" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^english-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = await download.path();
  const text = readFileSync(saved!, "utf8");
  expect(text).not.toContain("secret");

  // «другой браузер»: пустой прогресс → загрузить файл → подтвердить
  const other = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await open(other, "/");
  await other.locator(".backup-panel summary").click();
  await other.locator(".backup-panel input[type=file]").setInputFiles(saved!);
  await expect(other.locator(".restore-confirm")).toContainText("слов в изучении — 1");
  await other.getByRole("button", { name: "Заменить прогресс" }).click();
  await other.waitForLoadState();
  await expect.poll(() => other.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("es.srs") ?? "{}")).length)).toBe(1);
  await expect(other.getByText("1 день подряд")).toBeVisible();

  // чужой файл — понятная ошибка
  await other.locator(".backup-panel summary").click();
  await other.locator(".backup-panel input[type=file]").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"a":1}') });
  await expect(other.getByText("Это не файл прогресса этого сайта.")).toBeVisible();
});
