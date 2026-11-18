// Словарь по уровням (#words/A2): поиск, фильтр по статусу, отметка «уже знаю».
App.module("wordsPage", function () {
  "use strict";

  const { el, link, button, segmented } = App.dom;
  const { storage, content, srs, speech } = App;

  const STATUS_LABEL = { new: "новое", learning: "учу", learned: "выучено" };
  const MAX_ROWS = 400;      // без поиска показываем не больше 400 строк — так страница не тормозит

  function render(page, { level }) {
    document.title = "Слова — English";
    if (!content.levels.length) { page.append(el("p", "intro", "Словарей нет.")); return; }
    if (!content.levels.includes(level)) level = storage.get("wlevel", content.levels[0]);
    if (!content.levels.includes(level)) level = content.levels[0];
    storage.set("wlevel", level);

    page.append(reviewShortcut(), levelChips(level));

    const search = el("input", "search", null, { type: "search", placeholder: "Поиск по английскому или русскому…" });
    let filter = "all";
    const list = el("ul", "word-list");
    const counter = el("p", "muted");
    const filters = segmented([["all", "Все"], ["new", "Новые"], ["learning", "Учу"], ["learned", "Выучено"]], filter,
      value => { filter = value; drawList(); }, "small");

    function drawList() {
      const query = search.value.trim().toLowerCase();
      list.innerHTML = "";
      let shown = 0, matching = 0;
      content.wordsOfLevel(level).forEach(([en, ru]) => {
        const key = level + "|" + en;
        const status = srs.status(key);
        if (filter !== "all" && filter !== status) return;
        if (query && !en.toLowerCase().includes(query) && !ru.toLowerCase().includes(query)) return;
        matching++;
        if (shown >= MAX_ROWS) return;
        shown++;
        const statusButton = button("st", STATUS_LABEL[status], () => { srs.toggleKnown(key); drawList(); });
        statusButton.title = status === "new" ? "Отметить как уже знакомое" : "Вернуть в новые";
        list.append(el("li", "st-" + status, [el("span", "en", en), el("span", "ru", ru), statusButton, speech.speakButton(en)]));
      });
      counter.textContent = "Показано: " + shown + (matching > shown ? " из " + matching + " (используйте поиск)" : "");
    }

    search.addEventListener("input", drawList);
    page.append(search, filters, counter, list,
      el("p", "muted small-note", "Нажмите на «новое», если слово уже знакомо, — оно не будет показываться как новое."));
    drawList();
  }

  function reviewShortcut() {
    const due = srs.dueWordKeys().length;
    const fresh = srs.newWordKeys(srs.newWordsLeftToday()).length;
    return el("a", "plan-card compact", [
      el("div", "plan-icon", "🔁"),
      el("div", "plan-body", [el("div", "plan-title", "Повторение на сегодня"), el("div", "plan-text", "К повторению: " + due + " · новых: " + fresh)]),
      el("span", "plan-btn", "Начать"),
    ], { href: "#review" });
  }

  function levelChips(activeLevel) {
    return el("div", "levels", content.levels.map(level => {
      const stats = srs.levelStats(level);
      const fill = el("i", "chip-bar");
      fill.style.width = (stats.learned / stats.total * 100) + "%";
      return el("a", "level-chip " + level + (level === activeLevel ? " active" : ""),
        [el("b", "", level), el("span", "", stats.learned + " / " + stats.total), fill], { href: "#words/" + level });
    }));
  }

  App.router.add({
    tab: "words",
    match: hash => (hash === "words" || hash.startsWith("words/") ? { level: hash.split("/")[1] } : null),
    render,
  });
});
