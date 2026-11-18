// Навигация по адресу после # (например #grammar/A2_05_present_perfect).
//
// Каждая страница регистрируется так:
//   App.router.add({ tab: "grammar", match: hash => ..., render: (container, params) => cleanup? })
// match возвращает параметры страницы или null, если адрес не её.
// render может вернуть функцию очистки — она вызовется при уходе со страницы.
App.module("router", function () {
  "use strict";

  const routes = [];
  let fallback = null;
  let cleanup = null;
  const beforeEachHandlers = [];

  function add(route) { routes.push(route); }
  function setFallback(route) { fallback = route; }
  function beforeEach(handler) { beforeEachHandlers.push(handler); }

  function currentHash() {
    return decodeURIComponent(location.hash.slice(1));
  }

  // Если страница не загрузилась (её модуль упал), показываем это вместо пустого экрана
  const MISSING_PAGE = { tab: "", render: page => page.append(App.errorBox("Этот раздел")) };

  /** Какая страница отвечает за адрес. Ошибка в одной странице не мешает проверить остальные. */
  function findRoute(hash) {
    for (const candidate of routes) {
      const params = App.safely("адрес " + (candidate.tab || ""), () => candidate.match(hash), null);
      if (params) return { route: candidate, params };
    }
    // Пустой адрес — главная. Любой другой адрес без своей страницы — сообщение, а не тихий переход на главную
    if (hash === "" && fallback) return { route: fallback, params: {} };
    return { route: Object.assign({}, MISSING_PAGE, { tab: guessTab(hash) }), params: {} };
  }

  function guessTab(hash) {
    const section = hash.split("/")[0];
    if (["words", "grammar", "audio"].includes(section)) return section;
    if (section === "review" || section === "") return "today";
    return "stories";                       // адрес рассказа: #01_weekend_by_the_sea
  }

  function render() {
    // Каждый шаг защищён: если что-то упадёт, остальные шаги и вкладки продолжат работать
    if (cleanup) { App.safely("очистка страницы", cleanup); cleanup = null; }
    beforeEachHandlers.forEach(handler => App.safely("подготовка страницы", handler));

    const { route, params } = findRoute(currentHash());
    document.querySelectorAll(".tabs a").forEach(a => a.classList.toggle("active", a.dataset.tab === route.tab));
    const container = document.getElementById("app");
    container.innerHTML = "";
    window.scrollTo(0, 0);

    const result = App.safely("страница «" + (route.tab || "?") + "»", () => route.render(container, params), "failed");
    // Страница «отрисовалась», но пустая (например, не загрузился модуль создания элементов)
    const isEmpty = result !== "failed" && container.children.length === 0;
    if (result === "failed" || isEmpty) {
      container.innerHTML = "";
      container.append(App.errorBox("Этот раздел"), Object.assign(document.createElement("a"), { href: "#", className: "back", textContent: "← На главную" }));
    } else if (typeof result === "function") {
      cleanup = result;
    }
  }

  function start() {
    window.addEventListener("hashchange", render);
    render();
  }

  /** Перерисовать текущую страницу (например, после изменения настроек). */
  function refresh() { render(); }

  return { add, setFallback, beforeEach, start, refresh, currentHash };
});
