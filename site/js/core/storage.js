// Обёртка над localStorage: не падает, если хранилище недоступно (приватный режим и т.п.).
App.module("storage", function () {
  "use strict";

  const PREFIX = "es.";

  function get(key, defaultValue) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? defaultValue : JSON.parse(raw);
    } catch (error) {
      return defaultValue;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (error) {
      // хранилище недоступно — просто не сохраняем
    }
  }

  return { get, set };
}, function memoryStorage() {
  // Замена, если модуль не загрузился: храним в памяти — сайт работает, но прогресс не сохранится
  const memory = {};
  return {
    get: (key, defaultValue) => (key in memory ? memory[key] : defaultValue),
    set: (key, value) => { memory[key] = value; },
  };
});
