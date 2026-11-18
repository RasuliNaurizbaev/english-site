// Задание «вставьте пропущенное слово» — строится автоматически из словарных слов рассказа.
App.module("storyTasks", function () {
  "use strict";

  const { utils } = App;

  /**
   * Выбирает до `count` предложений, равномерно по всему тексту, и в каждом прячет одно словарное слово.
   * Возвращает упражнения в формате choice:
   *   { type: "choice", q: "He ___ to work.", options: [...], answer: 2, hint: "перевод", full: "исходное предложение" }
   */
  function buildGapExercises(story, wordFinder, count) {
    const sentences = story.paragraphs.flat();
    const candidates = [];
    const allFoundForms = new Set();

    sentences.forEach(sentence => {
      const matches = wordFinder.find(sentence).filter(m => m.text.length > 2);
      matches.forEach(m => allFoundForms.add(m.text.toLowerCase()));
      if (sentence.split(" ").length < 5) return;

      // Лучше прятать слово A2/B1 и не первое слово предложения
      const notFirst = matches.filter(m => m.index > 0);
      const harder = notFirst.filter(m => m.word.level !== "A1");
      const pool = harder.length ? harder : notFirst;
      if (!pool.length) return;
      const longest = pool.sort((a, b) => b.text.length - a.text.length)[0];
      candidates.push({ sentence, match: longest });
    });

    // Равномерно по тексту и без повторов одного и того же слова
    const step = Math.max(1, candidates.length / count);
    const chosen = [];
    const usedForms = new Set();
    for (let i = 0; i < candidates.length && chosen.length < count; i += step) {
      const candidate = candidates[Math.floor(i)];
      const form = candidate.match.text.toLowerCase();
      if (usedForms.has(form)) continue;
      usedForms.add(form);
      chosen.push(candidate);
    }

    const otherForms = [...allFoundForms];
    return chosen.map(({ sentence, match }) => {
      const answer = match.text;
      const wrong = utils.shuffle(otherForms.filter(f =>
        f !== answer.toLowerCase() && Math.abs(f.length - answer.length) < 6)).slice(0, 3);
      const options = utils.shuffle([answer, ...wrong]);
      return {
        type: "choice",
        q: sentence.slice(0, match.index) + "___" + sentence.slice(match.index + answer.length),
        options,
        answer: options.indexOf(answer),
        hint: "подсказка: " + match.word.ru,
        explain: "Полностью: " + sentence,
      };
    });
  }

  return { buildGapExercises };
});
