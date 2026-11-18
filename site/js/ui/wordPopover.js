// Всплывающий перевод слова при нажатии на подсвеченное слово в рассказе.
App.module("wordPopover", function () {
  "use strict";

  const { el, badge } = App.dom;
  const popover = document.getElementById("popover");

  function show(wordElement) {
    const { en, ru, level } = wordElement.dataset;
    popover.innerHTML = "";
    popover.append(
      el("div", "en", [en, " ", badge(level, level), App.speech.speakButton(en)]),
      el("div", "ru", ru),
    );
    popover.hidden = false;

    // Под словом, но не за краями экрана
    const rect = wordElement.getBoundingClientRect();
    const width = popover.offsetWidth;
    const screenWidth = document.documentElement.clientWidth;
    let left = window.scrollX + rect.left + rect.width / 2 - width / 2;
    left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + screenWidth - width - 8));
    popover.style.left = left + "px";
    popover.style.top = (window.scrollY + rect.bottom + 6) + "px";
  }

  function hide() { popover.hidden = true; }

  document.addEventListener("click", event => {
    if (!event.target.closest(".popover")) hide();
  });
  window.addEventListener("scroll", hide, { passive: true });

  return { show, hide };
});
