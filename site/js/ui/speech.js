// Произношение слова голосом устройства (работает без интернета).
App.module("speech", function () {
  "use strict";

  const supported = "speechSynthesis" in window;

  function speak(text) {
    if (!supported) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }

  /** Кнопка 🔊 */
  function speakButton(text) {
    const button = App.dom.button("speak", "🔊", event => {
      event.stopPropagation();
      speak(text);
    });
    button.title = "Произнести";
    button.hidden = !supported;
    return button;
  }

  return { supported, speak, speakButton };
});
