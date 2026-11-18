// Интервальное повторение слов (упрощённый алгоритм SM-2, как в Anki).
//
// Для каждого изучаемого слова хранится карточка:
//   { i: интервал в днях, e: «лёгкость» (множитель интервала), d: день следующего показа, r: сколько раз повторено, l: ошибок }
// Слово, которого нет в хранилище, — новое.
//
// Оценки после показа перевода:
//   again — не вспомнил: показать ещё раз сегодня
//   hard  — вспомнил с трудом: интервал растёт чуть-чуть
//   good  — вспомнил: 1 день → 3 дня → интервал × лёгкость
//   easy  — легко: интервал растёт сильнее
//   known — «я это уже знаю» для нового слова: следующий показ через 60 дней
App.module("srs", function () {
  "use strict";

  const { storage, utils, content, progress } = App;
  const LEARNED_INTERVAL = 21;       // с интервала 21 день слово считаем выученным
  const KNOWN_INTERVAL = 60;

  let cards = loadCards();

  function loadCards() {
    const saved = storage.get("srs", null);
    if (saved) return saved;
    // Первый запуск: переносим слова, отмеченные «выученными» в старой версии сайта
    const migrated = {};
    const oldKnown = storage.get("known", {});
    Object.keys(oldKnown).forEach(level => (oldKnown[level] || []).forEach(en => {
      migrated[level + "|" + en] = { i: 30, e: 2.5, d: utils.today() + 5 + Math.floor(Math.random() * 25), r: 1, l: 0 };
    }));
    storage.set("srs", migrated);
    return migrated;
  }
  const save = () => storage.set("srs", cards);

  /** Ключи слов, которые пора повторить (самые просроченные — первыми). */
  function dueWordKeys() {
    const day = utils.today();
    return Object.keys(cards)
      .filter(key => cards[key].d <= day && content.hasWord(key))
      .sort((a, b) => cards[a].d - cards[b].d);
  }

  /** Следующие новые слова по порядку словарей (A1 → A2 → B1) из выбранных уровней. */
  function newWordKeys(limit) {
    const result = [];
    const chosenLevels = progress.wordSettings().levels;
    for (const level of content.levels) {
      if (!chosenLevels.includes(level)) continue;
      for (const [en] of content.wordsOfLevel(level)) {
        const key = level + "|" + en;
        if (!cards[key]) result.push(key);
        if (result.length >= limit) return result;
      }
    }
    return result;
  }

  /** Сколько новых слов ещё можно взять сегодня. */
  function newWordsLeftToday() {
    const todayActivity = progress.activityOfDay(utils.today()) || {};
    return Math.max(0, progress.wordSettings().newPerDay - (todayActivity.newWords || 0));
  }

  /** Через сколько дней покажем слово при каждой оценке. */
  function nextIntervals(key) {
    const card = cards[key];
    const isFirstTime = !card || card.r === 0 || card.i < 1;
    if (isFirstTime) return { hard: 1, good: 1, easy: 4 };
    const good = card.i === 1 ? 3 : Math.round(card.i * card.e);
    return {
      hard: Math.max(1, Math.round(card.i * 1.2)),
      good,
      easy: Math.max(good + 1, Math.round(card.i * card.e * 1.3)),
    };
  }

  function grade(key, rating) {
    const isNew = !cards[key];
    const card = cards[key] || { i: 0, e: 2.5, d: utils.today(), r: 0, l: 0 };

    if (rating === "known") {
      Object.assign(card, { i: KNOWN_INTERVAL, r: 1, d: utils.today() + KNOWN_INTERVAL });
    } else if (rating === "again") {
      card.l += 1;
      card.e = Math.max(1.3, card.e - 0.2);
      card.i = 0;
      card.d = utils.today();
    } else {
      const interval = nextIntervals(key)[rating];
      if (rating === "hard") card.e = Math.max(1.3, card.e - 0.15);
      if (rating === "easy") card.e += 0.15;
      card.i = interval;
      card.r += 1;
      card.d = utils.today() + interval;
    }
    cards[key] = card;
    save();

    if (rating !== "known") {
      progress.recordActivity("reviews");
      if (isNew) progress.recordActivity("newWords");
    }
  }

  /** Статус слова: "new" | "learning" | "learned" */
  function status(key) {
    const card = cards[key];
    if (!card) return "new";
    return card.i >= LEARNED_INTERVAL ? "learned" : "learning";
  }

  /** Переключить «уже знаю» ↔ «новое» из списка слов. */
  function toggleKnown(key) {
    if (cards[key]) delete cards[key];
    else cards[key] = { i: KNOWN_INTERVAL, e: 2.5, d: utils.today() + KNOWN_INTERVAL, r: 1, l: 0 };
    save();
  }

  function levelStats(level) {
    const stats = { total: 0, learning: 0, learned: 0 };
    content.wordsOfLevel(level).forEach(([en]) => {
      stats.total++;
      const s = status(level + "|" + en);
      if (s === "learning") stats.learning++;
      if (s === "learned") stats.learned++;
    });
    return stats;
  }

  /** Очередь на сегодня: сначала просроченные, новые вперемешку с ними. */
  function buildTodayQueue() {
    const queue = dueWordKeys().slice(0, 150).map(key => ({ key, isNew: false }));
    newWordKeys(newWordsLeftToday()).forEach(key => {
      const position = Math.floor(Math.random() * (queue.length + 1));
      queue.splice(position, 0, { key, isNew: true });
    });
    return queue;
  }

  return {
    dueWordKeys, newWordKeys, newWordsLeftToday, nextIntervals, grade,
    status, toggleKnown, levelStats, buildTodayQueue,
  };
});
