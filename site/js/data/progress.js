// Прогресс пользователя: что пройдено, сколько занимался, настройки.
// Все ключи хранилища собраны здесь, чтобы было видно, что сохраняется.
App.module("progress", function () {
  "use strict";

  const { storage, utils } = App;

  // ---------- активность по дням (для серии и графика недели) ----------
  // activity = { <номер дня>: { reviews: 12, newWords: 5, stories: 1, grammar: 1, audio: 1 } }
  function recordActivity(kind, amount) {
    const activity = storage.get("log", {});
    const day = utils.today();
    activity[day] = activity[day] || {};
    activity[day][kind] = (activity[day][kind] || 0) + (amount || 1);
    storage.set("log", activity);
  }
  function activityOfDay(day) { return storage.get("log", {})[day] || null; }

  /** Сколько дней подряд были занятия (если сегодня ещё не занимались — считаем до вчера). */
  function streak() {
    const activity = storage.get("log", {});
    let day = utils.today();
    if (!activity[day]) day--;
    let count = 0;
    while (activity[day]) { count++; day--; }
    return count;
  }

  // ---------- рассказы: { <id>: { score: 90, day } } ----------
  const storyResults = () => storage.get("storyDone", {});
  function saveStoryResult(storyId, score) {
    const all = storyResults();
    const isFirstTime = !all[storyId];
    all[storyId] = { score: Math.max(score, (all[storyId] || {}).score || 0), day: utils.today() };
    storage.set("storyDone", all);
    if (isFirstTime) recordActivity("stories");
  }

  // ---------- грамматика: { <id>: { best: 85, done: true, day } } ----------
  const PASS_SCORE = 80;
  const grammarResults = () => storage.get("grammarDone", {});
  function saveGrammarResult(topicId, score) {
    const all = grammarResults();
    const previous = all[topicId] || {};
    all[topicId] = {
      best: Math.max(score, previous.best || 0),
      done: Boolean(previous.done || score >= PASS_SCORE),
      day: utils.today(),
    };
    storage.set("grammarDone", all);
    recordActivity("grammar");
    return all[topicId];
  }
  const isGrammarDone = topicId => Boolean((grammarResults()[topicId] || {}).done);

  // ---------- прослушанные mp3 со словами: { "A1/part_01.mp3": true } ----------
  const listenedParts = () => storage.get("listened", {});
  function markPartListened(file) {
    const all = listenedParts();
    if (!all[file]) recordActivity("audio");
    all[file] = true;
    storage.set("listened", all);
  }

  // ---------- настройки повторения слов ----------
  function wordSettings() {
    return Object.assign({ newPerDay: 10, levels: ["A1", "A2", "B1"] }, storage.get("srsSettings", {}));
  }
  function updateWordSettings(changes) {
    storage.set("srsSettings", Object.assign(storage.get("srsSettings", {}), changes));
  }

  return {
    recordActivity, activityOfDay, streak,
    storyResults, saveStoryResult,
    PASS_SCORE, grammarResults, saveGrammarResult, isGrammarDone,
    listenedParts, markPartListened,
    wordSettings, updateWordSettings,
  };
}, function emptyProgress() {
  // Замена, если модуль не загрузился: «прогресса нет», ничего не сохраняется, но все страницы открываются
  const nothing = () => {};
  return {
    recordActivity: nothing, activityOfDay: () => null, streak: () => 0,
    storyResults: () => ({}), saveStoryResult: nothing,
    PASS_SCORE: 80, grammarResults: () => ({}), saveGrammarResult: () => ({ best: 0, done: false }), isGrammarDone: () => false,
    listenedParts: () => ({}), markPartListened: nothing,
    wordSettings: () => ({ newPerDay: 10, levels: ["A1", "A2", "B1"] }), updateWordSettings: nothing,
  };
});
