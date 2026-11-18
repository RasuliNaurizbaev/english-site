// Страница повторения слов (#review): карточки с оценками «Снова / Трудно / Хорошо / Легко».
App.module("reviewPage", function () {
  "use strict";

  const { el, link, button, badge, progressBar } = App.dom;
  const { storage, content, srs, speech, utils } = App;

  const RATINGS = [
    { rating: "again", label: "Снова" },
    { rating: "hard", label: "Трудно" },
    { rating: "good", label: "Хорошо" },
    { rating: "easy", label: "Легко" },
  ];

  function describeInterval(days) {
    if (days < 1) return "сегодня";
    if (days < 30) return days + " " + utils.plural(days, "день", "дня", "дней");
    return Math.round(days / 30) + " мес.";
  }

  function render(page) {
    document.title = "Повторение слов — English";
    const queue = srs.buildTodayQueue();
    const total = queue.length;
    let finished = 0;
    let revealed = false;
    let direction = storage.get("wdir", "en-ru");
    let keyHandler = null;

    function draw() {
      page.innerHTML = "";
      const toggleDirection = button("small", direction === "en-ru" ? "EN → RU" : "RU → EN", () => {
        direction = direction === "en-ru" ? "ru-en" : "en-ru";
        storage.set("wdir", direction);
        draw();
      });
      page.append(
        link("back", "← Сегодня", "#"),
        progressBar([{ value: total ? finished / total : 1 }]),
        el("div", "cards-toolbar", [el("span", "muted", "Осталось: " + queue.length), toggleDirection]),
      );
      if (queue.length) drawCard(); else drawFinish();
    }

    function drawFinish() {
      keyHandler = null;
      page.append(
        el("div", "flashcard done", [el("div", "fc-main", "🎉"), el("div", "fc-sub", total ? "На сегодня всё! Повторено: " + finished : "Сегодня нечего повторять.")]),
        button("primary", "Ещё 10 новых слов", () => {
          App.progress.updateWordSettings({ newPerDay: App.progress.wordSettings().newPerDay + 10 });
          App.router.refresh();
        }),
        link("primary ghostbtn", "На главную", "#"),
      );
    }

    function drawCard() {
      const item = queue[0];
      const word = content.word(item.key);
      const front = direction === "en-ru" ? word.en : word.ru;
      const back = direction === "en-ru" ? word.ru : word.en;

      const card = el("div", "flashcard" + (revealed ? " revealed" : ""), [
        el("div", "fc-top", [el("span", "", [badge(word.level, word.level), " ", item.isNew ? badge("новое", "plain new") : null]), speech.speakButton(word.en)]),
        el("div", "fc-main", front),
        revealed ? el("div", "fc-sub", back) : el("div", "fc-hint", "Нажмите, чтобы увидеть перевод"),
      ]);
      const reveal = () => { if (!revealed) { revealed = true; speech.speak(word.en); draw(); } };
      card.addEventListener("click", reveal);

      const actions = el("div", "fc-actions" + (revealed ? " four" : ""));
      if (!revealed) {
        actions.append(button("show", "Показать перевод", reveal));
        if (item.isNew) actions.append(button("skip", "Я это уже знаю", () => {
          srs.grade(item.key, "known");
          queue.shift();
          // вместо знакомого слова берём следующее новое
          const replacement = srs.newWordKeys(srs.newWordsLeftToday() + 1).find(k => !queue.some(q => q.key === k) && k !== item.key);
          if (replacement && srs.newWordsLeftToday() > 0) queue.push({ key: replacement, isNew: true });
          next();
        }));
      } else {
        const intervals = srs.nextIntervals(item.key);
        RATINGS.forEach(({ rating, label }) => {
          const when = rating === "again" ? "сегодня" : describeInterval(intervals[rating]);
          actions.append(button("g-" + rating, "", () => answer(rating)));
          actions.lastChild.append(el("b", "", label), el("small", "", when));
        });
      }

      page.append(card, actions, el("p", "kbd-hint", revealed ? "Клавиши: 1 снова · 2 трудно · 3 хорошо · 4 легко" : "Клавиша: пробел — показать"));

      keyHandler = event => {
        const typingInField = event.target instanceof Element && event.target.matches("input, textarea");
        if (typingInField) return;
        if (!revealed && (event.code === "Space" || event.key === "Enter")) { event.preventDefault(); reveal(); }
        else if (revealed && ["1", "2", "3", "4"].includes(event.key)) answer(RATINGS[Number(event.key) - 1].rating);
      };
    }

    function answer(rating) {
      const item = queue.shift();
      srs.grade(item.key, rating);
      if (rating === "again") {
        item.isNew = false;
        queue.splice(Math.min(3, queue.length), 0, item);    // покажем снова через пару карточек
      } else {
        finished++;
      }
      next();
    }

    function next() { revealed = false; draw(); }

    const onKey = event => keyHandler && keyHandler(event);
    document.addEventListener("keydown", onKey);
    draw();
    return () => document.removeEventListener("keydown", onKey);   // очистка при уходе со страницы
  }

  App.router.add({ tab: "today", match: hash => (hash === "review" ? {} : null), render });
});
