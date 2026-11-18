// mp3 со словами по уровням (#audio/A1): по 100 слов в файле, следующая часть включается сама.
App.module("audioPage", function () {
  "use strict";

  const { el } = App.dom;
  const { storage, utils, content, progress } = App;

  function render(page, { level }) {
    document.title = "Аудио — English";
    const levels = content.wordAudioLevels();
    if (!levels.length) { page.append(el("p", "intro", "mp3 пока нет. Запустите tools/make_word_audio.py.")); return; }
    if (!levels.includes(level)) level = storage.get("alevel", levels[0]);
    if (!levels.includes(level)) level = levels[0];
    storage.set("alevel", level);

    page.append(
      el("p", "intro", "Слушайте и повторяйте: английское слово → пауза, чтобы повторить вслух. По 100 слов в файле. Следующая часть включается сама."),
      levelChips(levels, level),
      partList(level),
    );
  }

  function levelChips(levels, activeLevel) {
    return el("div", "levels", levels.map(level => {
      const parts = content.wordAudioParts(level);
      const words = parts.reduce((sum, part) => sum + part.count, 0);
      return el("a", "level-chip " + level + (level === activeLevel ? " active" : ""),
        [el("b", "", level), el("span", "", parts.length + " mp3 · " + words + " сл.")], { href: "#audio/" + level });
    }));
  }

  function partList(level) {
    const listened = progress.listenedParts();
    const players = [];

    const cards = content.wordAudioParts(level).map((part, index) => {
      const mark = el("span", "audio-mark", listened[part.file] ? "✓ прослушано" : "");
      const audio = el("audio", "", null, { controls: true, preload: "none", src: part.src });
      const card = el("div", "audio-card" + (listened[part.file] ? " listened" : ""), [
        el("div", "audio-head", [
          el("div", "audio-title", [el("b", "", "Часть " + part.part), el("span", "muted", " · слова " + part.from + "–" + part.to + " · " + utils.formatDuration(part.duration))]),
          mark,
        ]),
        el("div", "audio-range", part.first + " … " + part.last),
        audio,
      ]);

      // играет только одна часть; после окончания — отметка и следующая часть
      audio.addEventListener("play", () => players.forEach(other => other !== audio && other.pause()));
      audio.addEventListener("ended", () => {
        progress.markPartListened(part.file);
        card.classList.add("listened");
        mark.textContent = "✓ прослушано";
        const next = players[index + 1];
        if (next) {
          next.scrollIntoView({ behavior: "smooth", block: "center" });
          next.play().catch(() => {});
        }
      });
      players.push(audio);
      return card;
    });
    return el("div", "audio-list", cards);
  }

  App.router.add({
    tab: "audio",
    match: hash => (hash === "audio" || hash.startsWith("audio/") ? { level: hash.split("/")[1] } : null),
    render,
  });
});
