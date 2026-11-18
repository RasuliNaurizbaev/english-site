// Точка входа. Все модули уже загружены (порядок — в index.html), здесь только запуск.
//
// Слои (каждый использует только слои выше по списку):
//   core/    утилиты: storage, dom, router, utils
//   data/    доступ к данным: content (рассказы, слова, грамматика), progress (прогресс пользователя)
//   domain/  логика без интерфейса: интервальное повторение, формы слов, задания к рассказам
//   ui/      общие компоненты интерфейса: плеер, перевод слова, упражнения, markdown
//   pages/   страницы — каждая сама регистрирует свой адрес в роутере
App.module("app", function () {
  "use strict";

  // Без роутера страницы открыть нельзя — честно сообщаем об этом
  if (App.router.isStub) {
    document.getElementById("app").append(App.errorBox("Навигация по сайту"));
    return;
  }

  // Перед открытием любой страницы: убрать то, что нужно только рассказу.
  // Каждый шаг отдельно — сбой одного (например, плеера) не мешает остальным.
  App.router.beforeEach(() => App.wordPopover.hide());
  App.router.beforeEach(() => App.player.hide());
  App.router.beforeEach(() => App.readerSettings.hide());
  App.router.beforeEach(() => App.browserReader.stop());

  App.router.start();
});
