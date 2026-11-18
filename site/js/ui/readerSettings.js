// Настройки чтения в шапке: размер шрифта, подсветка слов, перевод по нажатию.
// Видны только на странице рассказа.
App.module("readerSettings", function () {
  "use strict";

  const { storage } = App;
  const panel = document.getElementById("readerControls");
  const highlightToggle = document.getElementById("hlToggle");
  const translateToggle = document.getElementById("trToggle");

  const settings = {
    fontSize: storage.get("font", 19),
    highlight: storage.get("hl", true),
    translate: storage.get("tr", true),
  };

  function applyFontSize() {
    document.documentElement.style.setProperty("--font-size", settings.fontSize + "px");
  }
  function changeFontSize(delta) {
    settings.fontSize = Math.min(30, Math.max(14, settings.fontSize + delta));
    storage.set("font", settings.fontSize);
    applyFontSize();
  }

  /** Классы для текста рассказа: hl — подсветка, tr — перевод по нажатию. */
  function applyToStory() {
    const story = document.querySelector(".story");
    if (!story) return;
    story.classList.toggle("hl", settings.highlight);
    story.classList.toggle("tr", settings.translate);
  }

  document.getElementById("fontDown").addEventListener("click", () => changeFontSize(-1));
  document.getElementById("fontUp").addEventListener("click", () => changeFontSize(+1));
  highlightToggle.checked = settings.highlight;
  translateToggle.checked = settings.translate;
  highlightToggle.addEventListener("change", () => {
    settings.highlight = highlightToggle.checked;
    storage.set("hl", settings.highlight);
    applyToStory();
  });
  translateToggle.addEventListener("change", () => {
    settings.translate = translateToggle.checked;
    storage.set("tr", settings.translate);
    App.wordPopover.hide();
    applyToStory();
  });
  applyFontSize();

  return {
    show: () => { panel.hidden = false; },
    hide: () => { panel.hidden = true; },
    applyToStory,
    isTranslateOn: () => settings.translate,
  };
});
