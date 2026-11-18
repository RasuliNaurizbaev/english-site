// Грамматика: список тем (#grammar) и тема с теорией и упражнениями (#grammar/<id>).
App.module("grammarPages", function () {
  "use strict";

  const { el, link, badge, button } = App.dom;
  const { content, progress, markdown, exercises } = App;

  // =====================================================================
  //  Список тем
  // =====================================================================
  function renderList(page) {
    document.title = "Грамматика — English";
    const topics = content.grammarTopics();
    if (!topics.length) { page.append(el("p", "intro", "Тем пока нет.")); return; }

    const results = progress.grammarResults();
    const learned = topics.filter(t => progress.isGrammarDone(t.id)).length;
    page.append(el("p", "intro",
      "Темы идут по порядку: A1 → A2 → B1. В каждой теме — подробное объяснение, примеры, типичные ошибки и упражнения. " +
      "Тема считается изученной, если в упражнениях " + progress.PASS_SCORE + "% и больше. Изучено: " + learned + " из " + topics.length + "."));

    content.levels.forEach(level => {
      const levelTopics = content.grammarTopicsOfLevel(level);
      if (!levelTopics.length) return;
      const levelDone = levelTopics.filter(t => progress.isGrammarDone(t.id)).length;
      page.append(
        el("h3", "section-title", [badge(level, level), " Уровень " + level + " ", el("span", "muted", "· " + levelDone + " / " + levelTopics.length)]),
        el("div", "g-list", levelTopics.map(topic => topicCard(topic, results[topic.id]))),
      );
    });
  }

  function topicCard(topic, result) {
    const done = result && result.done;
    return el("a", "g-card" + (done ? " done" : ""), [
      el("div", "g-num", done ? "✓" : String(topic.order)),
      el("div", "g-body", [
        el("div", "g-title", topic.title),
        el("div", "g-ru", topic.titleRu || ""),
        topic.summary ? el("div", "g-sum", topic.summary) : null,
      ]),
      result && result.best !== undefined ? el("span", "g-score", result.best + "%") : null,
    ], { href: "#grammar/" + topic.id });
  }

  // =====================================================================
  //  Одна тема
  // =====================================================================
  function renderTopic(page, { topic }) {
    document.title = topic.title + " — Грамматика";
    page.append(
      link("back", "← Все темы", "#grammar"),
      el("h1", "story-title", topic.title),
      el("div", "legend", [badge(topic.level, topic.level), " ", topic.titleRu || ""]),
      topic.summary ? el("p", "g-summary", topic.summary) : null,
      // Теория и упражнения независимы: если одно сломается, другое всё равно покажется
      partOrError("Объяснение темы", () => markdown.render(topic.theory || "")),
      partOrError("Упражнения", () => exerciseSection(topic)),
    );
  }

  function partOrError(title, build) {
    const part = App.safely(title, build);
    return part instanceof Node ? part : App.errorBox(title);
  }

  function exerciseSection(topic) {
    const list = topic.exercises || [];
    const finishBox = el("div", "task-finish");
    const previous = progress.grammarResults()[topic.id];
    if (previous) finishBox.append(el("p", "done-line", (previous.done ? "✓ Тема изучена. " : "") + "Лучший результат: " + previous.best + "%"));

    const onComplete = share => {
      const score = Math.round(share * 100);
      const passed = score >= progress.PASS_SCORE;
      progress.saveGrammarResult(topic.id, score);
      const next = content.nextGrammarTopicAfter(topic);
      finishBox.innerHTML = "";
      finishBox.append(
        el("p", "done-line", passed
          ? "✓ Отлично! " + score + "% — тема изучена."
          : "Результат: " + score + "% — нужно " + progress.PASS_SCORE + "%, чтобы тема считалась изученной. Перечитайте объяснение и попробуйте ещё раз."),
        button("primary ghostbtn", "Пройти заново", () => App.router.refresh()),
        next ? link("primary", "Следующая тема →", "#grammar/" + next.id) : null,
      );
    };

    return el("section", "tasks", [
      el("h2", "tasks-title", "Упражнения (" + list.length + ")"),
      partOrError("Упражнения", () => exercises.renderList(null, list, onComplete)),
      finishBox,
    ]);
  }

  App.router.add({ tab: "grammar", match: hash => (hash === "grammar" ? {} : null), render: renderList });
  App.router.add({
    tab: "grammar",
    match: hash => {
      if (!hash.startsWith("grammar/")) return null;
      const topic = content.grammarTopic(hash.slice("grammar/".length));
      return topic ? { topic } : null;
    },
    render: renderTopic,
  });
});
