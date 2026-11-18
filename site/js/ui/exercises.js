// Упражнения: один компонент для вопросов к рассказам, «вставь слово» и грамматики.
//
// Типы упражнений:
//   tf     — верно / неверно            { q, answer: true }
//   choice — выбор варианта             { q, options: [...], answer: 1 }
//   input  — вписать слово вместо ___   { q: "I ___ (go)", answer: ["went"] }
//   order  — собрать предложение        { q, answer: "Where do you live?" }
// У любого типа может быть explain (объяснение после ответа) и hint (подсказка под вопросом).
//
// Использование:
//   const box = App.exercises.renderList("1. Вопросы", list, score => ...);   // score = 0..1, когда всё отвечено
App.module("exercises", function () {
  "use strict";

  const { el, button } = App.dom;
  const { shuffle, normalizeAnswer } = App.utils;

  /** Одно упражнение. onAnswered(isCorrect) вызывается один раз. */
  function renderExercise(exercise, number, onAnswered) {
    const item = el("div", "q-item ex-" + exercise.type);
    let answered = false;

    function finish(isCorrect, correctText) {
      if (answered) return;
      answered = true;
      item.classList.add("answered", isCorrect ? "ok" : "bad");
      const verdict = isCorrect ? "✓ Верно. " : (correctText ? "✗ Правильно: " + correctText + ". " : "✗ ");
      item.append(el("div", "q-explain", verdict + (exercise.explain || "")));
      onAnswered(isCorrect);
    }

    const builders = { tf: buildChoice, choice: buildChoice, input: buildInput, order: buildOrder };
    builders[exercise.type](exercise, number, item, finish, () => answered);
    return item;
  }

  // ---------- выбор варианта (и верно/неверно) ----------
  function buildChoice(exercise, number, item, finish, isAnswered) {
    const isTrueFalse = exercise.type === "tf";
    const options = isTrueFalse ? ["True — верно", "False — неверно"] : exercise.options;
    const correctIndex = isTrueFalse ? (exercise.answer ? 0 : 1) : exercise.answer;

    item.append(el("div", "q-text", number + ". " + exercise.q.replace("___", "_____")));
    if (exercise.hint) item.append(el("div", "q-hint", exercise.hint));

    const buttons = options.map((option, index) => button("opt", option, () => {
      if (isAnswered()) return;
      const isCorrect = index === correctIndex;
      buttons[index].classList.add(isCorrect ? "right" : "wrong");
      buttons[correctIndex].classList.add("right");
      finish(isCorrect, isCorrect ? null : options[correctIndex]);
    }));
    item.append(el("div", "q-opts", buttons));
  }

  // ---------- вписать слово ----------
  function buildInput(exercise, number, item, finish) {
    const [before, after] = exercise.q.split("___");
    const input = el("input", "gap-input", null, {
      type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: false,
    });
    input.setAttribute("autocorrect", "off");

    const check = () => {
      if (!input.value.trim() || input.disabled) return;
      const isCorrect = exercise.answer.some(a => normalizeAnswer(a) === normalizeAnswer(input.value));
      input.disabled = true;
      input.classList.add(isCorrect ? "ok" : "bad");
      checkButton.remove();
      finish(isCorrect, exercise.answer[0]);
    };
    const checkButton = button("small check", "Проверить", check);
    input.addEventListener("keydown", event => { if (event.key === "Enter") check(); });

    item.append(el("div", "q-text", [number + ". " + before, input, after || ""]));
    if (exercise.hint) item.append(el("div", "q-hint", exercise.hint));
    item.append(checkButton);
  }

  // ---------- собрать предложение из слов ----------
  function buildOrder(exercise, number, item, finish, isAnswered) {
    const words = exercise.answer.split(/\s+/);
    let bank = shuffle(words.map((text, id) => ({ text, id })));
    if (bank.map(w => w.text).join(" ") === exercise.answer) bank.reverse();   // не показываем уже собранным
    const chosen = [];

    const builtLine = el("div", "order-built");
    const bankLine = el("div", "order-bank");

    function redraw() {
      builtLine.innerHTML = "";
      bankLine.innerHTML = "";
      if (!chosen.length) builtLine.append(el("span", "muted", "нажимайте на слова по порядку…"));
      chosen.forEach((word, position) => builtLine.append(button("tok in", word.text, () => {
        if (isAnswered()) return;
        chosen.splice(position, 1);
        redraw();
      })));
      bank.filter(word => !chosen.includes(word)).forEach(word => bankLine.append(button("tok", word.text, () => {
        if (isAnswered()) return;
        chosen.push(word);
        redraw();
      })));
    }

    const checkButton = button("small check", "Проверить", () => {
      if (chosen.length !== words.length) return;
      const isCorrect = normalizeAnswer(chosen.map(w => w.text).join(" ")) === normalizeAnswer(exercise.answer);
      builtLine.classList.add(isCorrect ? "ok" : "bad");
      checkButton.remove();
      finish(isCorrect, exercise.answer);
    });

    item.append(el("div", "q-text", number + ". " + (exercise.q || "Составьте предложение")), builtLine, bankLine, checkButton);
    redraw();
  }

  /** Блок упражнений с заголовком и счётом. onComplete(score от 0 до 1) — когда отвечены все. */
  function renderList(title, exercises, onComplete) {
    const box = el("div", "task-box");
    if (title) box.append(el("h3", "", title));
    const scoreLine = el("div", "task-score");
    let answered = 0, correct = 0;

    exercises.forEach((exercise, index) => box.append(renderExercise(exercise, index + 1, isCorrect => {
      answered++;
      if (isCorrect) correct++;
      scoreLine.textContent = "Правильно: " + correct + " из " + answered + (answered === exercises.length ? " — готово!" : "");
      if (answered === exercises.length && onComplete) onComplete(correct / exercises.length);
    })));
    box.append(scoreLine);
    return box;
  }

  return { renderExercise, renderList };
});
