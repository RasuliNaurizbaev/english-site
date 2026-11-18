// Защита от сбоев: если один модуль или страница упадёт, остальной сайт продолжит работать.
//
//   App.module("player", function () { ...; return api; })
//       Создаёт модуль. Если при загрузке случится ошибка, вместо него будет «пустышка»:
//       любое обращение к ней ничего не делает и не ломает код, который её использует.
//
//   App.safely("Задания", () => buildTasks(), fallbackValue)
//       Выполняет кусок кода; при ошибке возвращает fallbackValue и показывает предупреждение.
//
// Для проверки можно сломать модуль нарочно: index.html?break=player,markdown
window.App = window.App || {};
(function (App) {
  "use strict";

  const brokenOnPurpose = new URLSearchParams(location.search).get("break");
  const modulesToBreak = brokenOnPurpose ? brokenOnPurpose.split(",") : [];
  const problems = [];

  /** «Пустышка»: любое свойство — снова пустышка, любой вызов возвращает undefined. */
  function createStub() {
    const stub = new Proxy(function () {}, {
      get: (target, key) => (key === Symbol.toPrimitive ? () => "" : key === "isStub" ? true : stub),
      apply: () => undefined,
    });
    return stub;
  }

  /** Показать предупреждение вверху страницы (одно на все ошибки). */
  function report(where, error) {
    console.error("[" + where + "]", error);
    problems.push(where);
    let banner = document.getElementById("problemBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "problemBanner";
      banner.className = "problem-banner";
      banner.addEventListener("click", () => banner.remove());
      document.body.prepend(banner);
    }
    const unique = [...new Set(problems)];
    banner.textContent = "⚠ Не загрузилось: " + unique.join(", ") + ". Остальное работает. (нажмите, чтобы скрыть)";
  }

  /**
   * fallbackFactory (необязательно) — упрощённая замена модуля, если он не загрузился.
   * Например, хранилище без сохранения или «прогресс пустой». Без неё ставится «пустышка».
   */
  function module(name, factory, fallbackFactory) {
    try {
      if (modulesToBreak.includes(name)) throw new Error("сломано нарочно (?break=" + name + ")");
      const api = factory();
      if (api !== undefined) App[name] = api;
    } catch (error) {
      App[name] = (fallbackFactory && safely(name + " (замена)", fallbackFactory)) || createStub();
      if (document.body) report(name, error);
      else document.addEventListener("DOMContentLoaded", () => report(name, error));
    }
  }

  function safely(where, action, fallback) {
    try {
      return action();
    } catch (error) {
      report(where, error);
      return fallback;
    }
  }

  /** Блок «эта часть не загрузилась» вместо сломанной части страницы. */
  function errorBox(what) {
    const box = document.createElement("div");
    box.className = "error-box";
    box.textContent = "⚠ " + what + " — временно не работает. Остальная часть страницы доступна.";
    return box;
  }

  // Ошибки, которые никто не поймал (например, в обработчиках кнопок), — только предупреждение
  window.addEventListener("error", event => report("скрипт", event.error || event.message));
  window.addEventListener("unhandledrejection", event => report("скрипт", event.reason));

  App.module = module;
  App.safely = safely;
  App.errorBox = errorBox;
  App.problems = () => problems.slice();
})(window.App);
