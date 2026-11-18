// Чтение рассказа встроенным голосом браузера (бесплатно, Web Speech API).
// Запасной вариант, если нет mp3, файл не загрузился или не работает плеер.
//
//   Safari (Mac, iPhone) — системные голоса Apple, работают без интернета.
//   Chrome — голоса Google (нужен интернет) или системные голоса.
//
// Читает по одному предложению, поэтому знает, какое звучит сейчас (для подсветки).
//   App.browserReader.start(sentences, fromIndex, onSentence)
//   App.browserReader.pause() / resume() / stop()
App.module("browserReader", function () {
  "use strict";

  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let speed = 1;
  let reading = false;
  let paused = false;
  let runId = 0;               // чтобы события старого чтения не мешали новому

  /** Лучший английский голос: сначала американский, предпочтительно «хорошие» голоса. */
  function pickVoice() {
    const voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    const preferred = ["Google US English", "Samantha", "Ava", "Allison", "Microsoft Aria", "Microsoft Jenny", "Alex"];
    for (const name of preferred) {
      const voice = voices.find(v => v.name.includes(name));
      if (voice) return voice;
    }
    return voices.find(v => /en[-_]US/i.test(v.lang)) || voices[0] || null;
  }
  if (supported) speechSynthesis.getVoices();   // в Chrome список голосов загружается не сразу

  /** sentences — массив строк (0 = заголовок). onSentence(index) вызывается при начале каждого предложения, -1 в конце. */
  function start(sentences, fromIndex, onSentence) {
    if (!supported) return;
    stop();
    const myRun = ++runId;
    reading = true;
    paused = false;
    const voice = pickVoice();

    // Ставим все предложения в очередь сразу — так надёжнее работает на iPhone
    sentences.slice(fromIndex).forEach((text, offset) => {
      const index = fromIndex + offset;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice ? voice.lang : "en-US";
      try {
        if (voice) utterance.voice = voice;
      } catch (error) {
        // голос нельзя назначить — читаем голосом по умолчанию для английского
      }
      utterance.rate = 0.95 * speed;
      utterance.onstart = () => { if (myRun === runId) onSentence(index); };
      if (index === sentences.length - 1) {
        utterance.onend = () => { if (myRun === runId) { reading = false; onSentence(-1); } };
      }
      speechSynthesis.speak(utterance);
    });
  }

  function pause() { if (reading) { speechSynthesis.pause(); paused = true; } }
  function resume() { if (reading) { speechSynthesis.resume(); paused = false; } }
  function stop() {
    if (!supported) return;
    runId++;
    reading = false;
    paused = false;
    speechSynthesis.cancel();
  }

  return {
    supported,
    start, pause, resume, stop,
    setSpeed: value => { speed = value; },
    isReading: () => reading,
    isPaused: () => paused,
    voiceName: () => { const v = supported && pickVoice(); return v ? v.name : "голос браузера"; },
  };
});
