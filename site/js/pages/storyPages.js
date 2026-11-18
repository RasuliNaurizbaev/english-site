// Рассказы: список (#stories) и чтение одного рассказа (#<id>) с караоке и заданиями.
App.module("storyPages", function () {
  "use strict";

  const { el, link, badge, button } = App.dom;
  const { utils, content, progress, player, browserReader, readerSettings, wordPopover, wordForms, storyTasks, exercises } = App;

  function levelCounts(story) {
    const counts = {};
    story.words.forEach(w => { counts[w.level] = (counts[w.level] || 0) + 1; });
    return Object.entries(counts).sort();
  }

  // =====================================================================
  //  Список рассказов
  // =====================================================================
  function renderList(page) {
    document.title = "Рассказы — English";
    const results = progress.storyResults();
    const stories = content.stories();
    page.append(el("p", "intro", stories.length
      ? "Читайте, слушайте и отвечайте на вопросы. Нажмите на подсвеченное слово, чтобы увидеть перевод."
      : "Рассказов пока нет."));

    page.append(el("div", "cards", stories.map((story, index) => {
      const result = results[story.id];
      const voices = story.audio.length;
      const meta = [
        ...levelCounts(story).map(([level, n]) => badge(level + " · " + n, level)),
        badge(story.wordCount + " слов", "plain"),
        voices ? badge("🔊 " + voices + " " + utils.plural(voices, "голос", "голоса", "голосов"), "plain") : null,
        story.questions ? badge("❓ вопросы", "plain") : null,
      ];
      return el("a", "card" + (result ? " card-done" : ""), [
        el("h2", "", [(index + 1) + ". " + story.title, result ? " " : null, result ? badge("✓ " + result.score + "%", "done-badge") : null]),
        el("p", "", story.paragraphs[0].join(" ").slice(0, 140) + "…"),
        el("div", "meta", meta),
      ], { href: "#" + story.id });
    })));
  }

  // =====================================================================
  //  Чтение рассказа
  // =====================================================================
  function renderStory(page, { story }) {
    document.title = story.title + " — English";
    // Плеер, подсветка слов и задания — независимые части: если одна сломается, текст всё равно покажется
    App.safely("настройки чтения", () => readerSettings.show());
    const finder = App.safely("подсветка слов", () => wordForms.createWordFinder(story.words)) || NO_WORD_FINDER;
    const listening = createListening(story);

    const title = el("h1", "story-title sentence", story.title);
    title.dataset.sentence = 0;
    title.addEventListener("click", () => listening.playFrom(0));

    page.append(
      link("back", "← Все рассказы", "#stories"),
      title,
      el("div", "legend", ["Слова из словаря: ", ...levelCounts(story).map(([level, n]) => badge(level + " · " + n, level))]),
      listening.panel,
      storyText(story, finder, listening),
      App.safely("задания к рассказу", () => tasks(story, finder), App.errorBox("Задания")),
    );
    App.safely("настройки чтения", () => readerSettings.applyToStory());
  }

  // =====================================================================
  //  Кто читает рассказ вслух:
  //    1) mp3 с нейроголосом (плеер внизу, караоке по таймингам);
  //    2) если mp3 нет, он не загрузился или плеер сломан — встроенный голос браузера.
  // =====================================================================
  function createListening(story) {
    const sentences = [story.title, ...story.paragraphs.flat()];
    const panel = el("div", "listen-panel");
    let mode = "none";

    const hasMp3 = story.audio.length > 0 && !player.isStub;
    if (hasMp3 && App.safely("плеер", () => { player.show(story); return true; })) {
      mode = "mp3";
      App.safely("караоке", () => player.onSentenceChange(index => highlightSentence(index, player.isKaraokeOn() && player.isPlaying())));
      App.safely("плеер", () => player.onAudioError(() => switchToBrowserVoice("mp3 не загрузился")));
      panel.append(hint());
    } else {
      switchToBrowserVoice(story.audio.length ? "плеер не работает" : "для этого рассказа нет mp3");
    }

    function hint() {
      return el("p", "hint-line", "▶ Нажмите на предложение, чтобы послушать его. Нажмите на подсвеченное слово, чтобы увидеть перевод.");
    }

    function switchToBrowserVoice(reason) {
      if (!browserReader.supported || browserReader.isStub) {
        mode = "none";
        App.safely("плеер", () => player.hide());
        panel.innerHTML = "";
        panel.append(el("p", "hint-line", "🔇 Аудио недоступно: " + reason + ", а браузер не умеет читать вслух."));
        return;
      }
      mode = "browser";
      App.safely("плеер", () => player.hide());
      panel.innerHTML = "";
      panel.append(browserVoiceBar(reason), hint());
    }

    /** Панель «читать голосом браузера»: ▶ / ⏸ / ■ и скорость. */
    function browserVoiceBar(reason) {
      const playButton = button("small primary-small", "▶ Читать вслух", () => {
        if (browserReader.isReading() && !browserReader.isPaused()) { browserReader.pause(); }
        else if (browserReader.isPaused()) { browserReader.resume(); }
        else { readFrom(0); }
        updateButton();
      });
      const stopButton = button("small", "■", () => { browserReader.stop(); highlightSentence(-1); updateButton(); });
      stopButton.title = "Остановить";
      const speed = App.dom.segmented([[0.75, "0.75×"], [1, "1×"], [1.25, "1.25×"]], 1, value => browserReader.setSpeed(value), "small");
      function updateButton() {
        playButton.textContent = browserReader.isReading() && !browserReader.isPaused() ? "⏸ Пауза" : "▶ Читать вслух";
      }
      panel.updateButton = updateButton;
      return el("div", "voice-bar", [
        el("div", "voice-note", "🗣 Читает голос браузера (" + browserReader.voiceName() + ") — " + reason + "."),
        el("div", "voice-controls", [playButton, stopButton, speed]),
      ]);
    }

    function readFrom(index) {
      browserReader.start(sentences, index, current => {
        highlightSentence(current, true);
        if (current === -1 && panel.updateButton) panel.updateButton();
      });
      if (panel.updateButton) panel.updateButton();
    }

    function playFrom(index) {
      if (mode === "mp3") player.playSentence(index);
      else if (mode === "browser") readFrom(index);
    }

    return { panel, playFrom, canPlay: () => mode !== "none" };
  }

  /** Если модуль подсветки слов не загрузился — текст без подсветки. */
  const NO_WORD_FINDER = { find: () => [] };

  /** Текст: каждое предложение — отдельный элемент (для караоке), словарные слова — с переводом. */
  function storyText(story, finder, listening) {
    const article = el("article", "story" + (listening.canPlay() ? " karaoke" : ""));
    let sentenceNumber = 1;                       // 0 — заголовок
    story.paragraphs.forEach(paragraph => {
      const p = el("p");
      paragraph.forEach((sentence, i) => {
        const span = sentenceElement(sentence, sentenceNumber++, finder, listening);
        p.append(span, i < paragraph.length - 1 ? " " : "");
      });
      article.append(p);
    });
    return article;
  }

  function sentenceElement(text, number, finder, listening) {
    const span = el("span", "sentence");
    span.dataset.sentence = number;
    let position = 0;
    const matches = App.safely("подсветка слов", () => finder.find(text), []) || [];
    matches.forEach(match => {
      span.append(text.slice(position, match.index));
      const word = el("span", "w " + match.word.level, match.text);
      Object.assign(word.dataset, { en: match.word.en, ru: match.word.ru, level: match.word.level });
      span.append(word);
      position = match.index + match.text.length;
    });
    span.append(text.slice(position));

    span.addEventListener("click", event => {
      const word = event.target.closest(".w");
      if (word && readerSettings.isTranslateOn()) {
        event.stopPropagation();                   // чтобы перевод сразу не закрылся
        wordPopover.show(word);
        return;
      }
      listening.playFrom(number);
    });
    return span;
  }

  function highlightSentence(index, scrollIntoView) {
    document.querySelectorAll(".sentence.now").forEach(node => node.classList.remove("now"));
    const node = document.querySelector('.sentence[data-sentence="' + index + '"]');
    if (!node) return;
    node.classList.add("now");
    // если предложение ушло за край экрана — прокручиваем к нему
    if (scrollIntoView) {
      const rect = node.getBoundingClientRect();
      const visibleBottom = window.innerHeight - (Number(player.height()) || 0) - 20;
      if (rect.top < 70 || rect.bottom > visibleBottom) node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // ---------- задания ----------
  function tasks(story, finder) {
    const section = el("section", "tasks", [el("h2", "tasks-title", "Задания")]);
    const scores = {};
    const finishBox = el("div", "task-finish");
    let taskNumber = 1;

    /** Блок заданий; если он не построился — сообщение вместо него, остальные блоки работают. */
    function taskBlock(title, list, onScore) {
      const box = App.safely(title, () => exercises.renderList(title, list, onScore));
      return box instanceof Node ? box : App.errorBox(title);
    }

    const questions = story.questions && story.questions.questions;
    if (questions) {
      section.append(taskBlock(taskNumber++ + ". Вопросы по тексту", questions, score => { scores.questions = score; maybeFinish(); }));
    }
    const gaps = App.safely("задание «вставьте слово»", () => storyTasks.buildGapExercises(story, finder, 8)) || [];
    if (gaps.length >= 3) {
      section.append(taskBlock(taskNumber++ + ". Вставьте пропущенное слово", gaps, score => { scores.gaps = score; maybeFinish(); }));
    }

    const retell = story.questions && story.questions.retell;
    section.append(el("div", "task-box", [
      el("h3", "", taskNumber + ". Перескажите вслух"),
      el("p", "muted", "Расскажите историю своими словами за 1–2 минуты, используя вопросы как план. Говорите вслух — это лучшая тренировка речи."),
      retell ? el("ol", "retell", retell.map(q => el("li", "", q))) : null,
    ]));

    function maybeFinish() {
      const needed = (questions ? 1 : 0) + (gaps.length >= 3 ? 1 : 0);
      if (Object.keys(scores).length === needed) finish();
    }

    function finish() {
      const values = Object.values(scores);
      const score = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) : 100;
      progress.saveStoryResult(story.id, score);
      finishBox.innerHTML = "";
      const next = content.nextStoryAfter(story);
      finishBox.append(
        el("p", "done-line", "✓ Рассказ пройден! Результат: " + score + "%"),
        next ? link("primary", "Следующий рассказ →", "#" + next.id) : null,
        link("primary ghostbtn", "На главную", "#"),
      );
    }

    const previous = progress.storyResults()[story.id];
    if (previous) finishBox.append(el("p", "done-line", "✓ Пройдено, результат " + previous.score + "%"));
    finishBox.append(button("primary", "Отметить рассказ пройденным", finish));
    section.append(finishBox);
    return section;
  }

  App.router.add({ tab: "stories", match: hash => (hash === "stories" ? {} : null), render: renderList });
  App.router.add({
    tab: "stories",
    match: hash => { const story = content.story(hash); return story ? { story } : null; },
    render: renderStory,
  });
});
