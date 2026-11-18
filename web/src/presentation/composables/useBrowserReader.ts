// Чтение текста встроенным голосом браузера (Web Speech API) — запасной вариант, если нет mp3.
//   Safari (Mac, iPhone) — голоса Apple, без интернета;  Chrome — голоса Google (нужен интернет) или системные.
// Читает по одному предложению, поэтому знает, какое звучит сейчас (для подсветки).
import { onUnmounted, ref } from "vue";

export const browserVoiceSupported =
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** Лучший английский голос: предпочтительно «хорошие» голоса, иначе любой американский. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
  const preferred = ["Google US English", "Samantha", "Ava", "Allison", "Microsoft Aria", "Microsoft Jenny", "Alex"];
  for (const name of preferred) {
    const voice = voices.find(v => v.name.includes(name));
    if (voice) return voice;
  }
  return voices.find(v => /en[-_]US/i.test(v.lang)) ?? voices[0] ?? null;
}

export function useBrowserReader() {
  const reading = ref(false);
  const paused = ref(false);
  const speed = ref(1);
  let runId = 0;                      // чтобы события прошлого чтения не мешали новому
  if (browserVoiceSupported) speechSynthesis.getVoices();   // в Chrome список голосов грузится не сразу

  /** onSentence(index) — при начале каждого предложения; -1 — чтение закончилось. */
  function start(sentences: string[], fromIndex: number, onSentence: (index: number) => void): void {
    if (!browserVoiceSupported) return;
    stop();
    const myRun = ++runId;
    reading.value = true;
    const voice = pickVoice();

    // Все предложения сразу в очередь — так надёжнее на iPhone
    sentences.slice(fromIndex).forEach((text, offset) => {
      const index = fromIndex + offset;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang ?? "en-US";
      try { if (voice) utterance.voice = voice; } catch { /* голос нельзя назначить — читаем голосом по умолчанию */ }
      utterance.rate = 0.95 * speed.value;
      utterance.onstart = () => { if (myRun === runId) onSentence(index); };
      if (index === sentences.length - 1) {
        utterance.onend = () => { if (myRun === runId) { reading.value = false; onSentence(-1); } };
      }
      speechSynthesis.speak(utterance);
    });
  }

  function pause(): void { if (reading.value) { speechSynthesis.pause(); paused.value = true; } }
  function resume(): void { if (reading.value) { speechSynthesis.resume(); paused.value = false; } }
  function stop(): void {
    if (!browserVoiceSupported) return;
    runId++;
    reading.value = false;
    paused.value = false;
    speechSynthesis.cancel();
  }

  const voiceName = () => (browserVoiceSupported ? pickVoice()?.name : null) ?? "голос браузера";

  onUnmounted(stop);                  // ушли со страницы — замолчать
  return { reading, paused, speed, start, pause, resume, stop, voiceName };
}
