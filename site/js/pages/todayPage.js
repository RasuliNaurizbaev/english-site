// Страница «Сегодня»: план на день, серия дней, прогресс и настройки новых слов.
App.module("todayPage", function () {
  "use strict";

  const { el, link, badge, segmented, progressBar } = App.dom;
  const { utils, content, progress, srs } = App;

  const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const WEEKDAYS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  function render(page) {
    document.title = "Сегодня — English";
    // Каждый блок независим: если один не построится, остальные покажутся
    const blocks = [
      ["Заголовок", header], ["Неделя", weekStrip], ["План на день", plan],
      ["Прогресс по словам", () => el("div", "", [el("h3", "section-title", "Прогресс по словам"), wordStats()])],
      ["Настройки", settings],
    ];
    blocks.forEach(([title, build]) => {
      const block = App.safely(title, build);
      page.append(block instanceof Node ? block : App.errorBox(title));
    });
  }

  function header() {
    const now = new Date();
    const days = progress.streak();
    return el("div", "today-head", [
      el("h1", "today-title", now.getDate() + " " + MONTHS[now.getMonth()] + ", " + WEEKDAYS_FULL[now.getDay()]),
      el("div", "streak", "🔥 " + days + " " + utils.plural(days, "день", "дня", "дней") + " подряд"),
    ]);
  }

  /** Семь полосок: зелёная — в этот день были занятия. */
  function weekStrip() {
    const strip = el("div", "week");
    const today = utils.today();
    const offsetMs = new Date().getTimezoneOffset() * 60000;
    for (let back = 6; back >= 0; back--) {
      const day = today - back;
      const weekday = new Date(day * 86400000 + offsetMs).getDay();
      const classes = "day" + (progress.activityOfDay(day) ? " on" : "") + (back === 0 ? " now" : "");
      strip.append(el("div", classes, [el("i"), el("span", "", WEEKDAYS[weekday])]));
    }
    return strip;
  }

  // ---------- план на день ----------

  function planCard({ icon, title, text, note, href, action, done }) {
    return el("a", "plan-card" + (done ? " done" : ""), [
      el("div", "plan-icon", done ? "✓" : icon),
      el("div", "plan-body", [el("div", "plan-title", title), el("div", "plan-text", text), note ? el("div", "plan-sub", note) : null]),
      el("span", "plan-btn", action),
    ], { href });
  }

  function plan() {
    const todayActivity = progress.activityOfDay(utils.today()) || {};
    const builders = [["Слова", wordsCard], ["Рассказ", storyCard], ["Грамматика", grammarCard], ["Аудио", audioCard]];
    const cards = builders.map(([title, build]) => {
      const card = App.safely("план: " + title, () => build(todayActivity), "failed");
      if (card === "failed" || (card && !(card instanceof Node))) return App.errorBox(title);
      return card;                           // null — карточка не нужна (например, аудио уже прослушано)
    });
    return el("div", "plan", cards.filter(Boolean));
  }

  function wordsCard(todayActivity) {
    const due = srs.dueWordKeys().length;
    const fresh = srs.newWordKeys(srs.newWordsLeftToday()).length;
    const done = due === 0 && fresh === 0;
    return planCard({
      icon: "🗂", title: "Слова", done, href: "#review",
      text: done ? "Готово! Сегодня повторено: " + (todayActivity.reviews || 0) : "К повторению: " + due + " · новых: " + fresh,
      action: done ? "Ещё слова" : "Начать",
    });
  }

  function storyCard(todayActivity) {
    const results = progress.storyResults();
    const stories = content.stories();
    const next = stories.find(s => !results[s.id]);
    const finished = stories.filter(s => results[s.id]).length;
    return planCard({
      icon: "📖", title: "Рассказ", done: !next || (todayActivity.stories || 0) > 0,
      text: next ? next.title + " · прочитать, послушать, ответить на вопросы" : "Все рассказы пройдены!",
      note: "Пройдено " + finished + " из " + stories.length,
      href: next ? "#" + next.id : "#stories", action: next ? "Открыть" : "Список",
    });
  }

  function grammarCard(todayActivity) {
    const topics = content.grammarTopics();
    const next = topics.find(t => !progress.isGrammarDone(t.id));
    const finished = topics.filter(t => progress.isGrammarDone(t.id)).length;
    return planCard({
      icon: "📐", title: "Грамматика", done: !next || (todayActivity.grammar || 0) > 0,
      text: next ? next.level + " · " + next.title + (next.titleRu ? " — " + next.titleRu : "") : "Все темы изучены!",
      note: "Изучено " + finished + " из " + topics.length + " тем",
      href: next ? "#grammar/" + next.id : "#grammar", action: next ? "Учить" : "Список",
    });
  }

  function audioCard(todayActivity) {
    const listened = progress.listenedParts();
    for (const level of content.wordAudioLevels()) {
      const part = content.wordAudioParts(level).find(p => !listened[p.file]);
      if (part) return planCard({
        icon: "🎧", title: "Слушать слова (по желанию)", done: (todayActivity.audio || 0) > 0,
        text: level + " · часть " + part.part + " · " + utils.formatDuration(part.duration),
        href: "#audio/" + level, action: "Слушать",
      });
    }
    return null;
  }

  // ---------- статистика и настройки ----------

  function wordStats() {
    return el("div", "stats", content.levels.map(level => {
      const s = srs.levelStats(level);
      return el("div", "stat " + level, [
        el("b", "", level),
        el("span", "", s.learned + " выучено"),
        el("span", "muted", s.learning + " в процессе · " + s.total + " всего"),
        progressBar([{ value: s.learned / s.total, className: "mature" }, { value: s.learning / s.total, className: "learning" }], "small"),
      ]);
    }));
  }

  function settings() {
    const current = progress.wordSettings();
    const perDay = segmented([5, 10, 15, 20, 30].map(n => [n, String(n)]), current.newPerDay, value => {
      progress.updateWordSettings({ newPerDay: value });
      App.router.refresh();
    }, "small");

    const levelButtons = el("div", "segmented small", content.levels.map(level => {
      const isOn = current.levels.includes(level);
      return App.dom.button(isOn ? "active" : "", level, () => {
        const chosen = isOn ? current.levels.filter(l => l !== level) : [...current.levels, level];
        if (!chosen.length) return;                           // хотя бы один уровень
        progress.updateWordSettings({ levels: content.levels.filter(l => chosen.includes(l)) });
        App.router.refresh();
      });
    }));

    return el("div", "", [
      el("div", "settings", [el("span", "muted", "Новых слов в день:"), perDay, el("span", "muted", "Уровни новых слов:"), levelButtons]),
      el("p", "muted small-note", "Новые слова берутся по порядку: сначала A1, потом A2, потом B1. Если слово уже знакомо, нажмите «Я это уже знаю» — оно не будет считаться новым."),
    ]);
  }

  App.router.setFallback({ tab: "today", match: () => ({}), render });
});
