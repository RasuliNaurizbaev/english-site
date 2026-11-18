// Доступ к контенту сайта. Данные собирает tools/build_site_data.py в site/data/*.js.
// Остальной код не обращается к window.STORIES и т.п. напрямую — только через этот модуль.
App.module("content", function () {
  "use strict";

  const stories = window.STORIES || [];
  const vocabulary = window.WORDS || {};       // { A1: [[english, russian], ...], ... }
  const wordAudio = window.AUDIO || {};        // { A1: [{ part, from, to, src, ... }], ... }
  const grammar = window.GRAMMAR || [];
  const levels = Object.keys(vocabulary);

  // Все слова одним списком: key = "A1|apple"
  const wordsByKey = new Map();
  levels.forEach(level => vocabulary[level].forEach(([en, ru]) => {
    const key = level + "|" + en;
    wordsByKey.set(key, { key, level, en, ru });
  }));

  return {
    levels,

    stories: () => stories,
    story: id => stories.find(s => s.id === id),
    nextStoryAfter: story => stories[stories.indexOf(story) + 1],

    wordsOfLevel: level => vocabulary[level] || [],
    word: key => wordsByKey.get(key),
    hasWord: key => wordsByKey.has(key),

    grammarTopics: () => grammar,
    grammarTopic: id => grammar.find(t => t.id === id),
    grammarTopicsOfLevel: level => grammar.filter(t => t.level === level),
    nextGrammarTopicAfter: topic => grammar[grammar.indexOf(topic) + 1],

    wordAudioLevels: () => Object.keys(wordAudio).filter(level => wordAudio[level].length),
    wordAudioParts: level => wordAudio[level] || [],
  };
});
