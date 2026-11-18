// Маленькие вспомогательные функции без зависимостей.
App.module("utils", function () {
  "use strict";

  /** Номер сегодняшнего дня (по местному времени). Удобно сравнивать дни числами. */
  function today() {
    const now = new Date();
    const localMs = now.getTime() - now.getTimezoneOffset() * 60000;
    return Math.floor(localMs / 86400000);
  }

  /** Перемешивает массив на месте и возвращает его. */
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  /** Русское склонение: plural(5, "день", "дня", "дней") → "дней". */
  function plural(n, one, few, many) {
    const lastDigit = n % 10;
    const lastTwo = n % 100;
    if (lastDigit === 1 && lastTwo !== 11) return one;
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 10 || lastTwo >= 20)) return few;
    return many;
  }

  /** 125 → "2:05" */
  function formatDuration(seconds) {
    const total = Math.round(seconds || 0);
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  /** Сравнение ответов без учёта регистра, лишних пробелов и точки в конце. */
  function normalizeAnswer(text) {
    return text.trim().toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[.!?,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return { today, shuffle, plural, formatDuration, normalizeAnswer };
});
