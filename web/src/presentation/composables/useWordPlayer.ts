// Проигрывание слов вслух по кругу, пока не нажали «Стоп»: ▶ — по порядку, 🔀 — вперемешку.
// Голос устройства: английский для слова, русский для перевода (режим — PlayMode).
import { onUnmounted, ref } from "vue";
import { phrasesOf, roundOrder, type PlayMode } from "@/domain/wordPlayback";
import { speakAndWait, speechSupported } from "./useSpeech";

export interface PlayWord { key: string; en: string; ru: string }

const GAP_MS = 700;          // между словом и переводом
const NEXT_MS = 1500;        // перед следующим словом

export function useWordPlayer() {
  const playing = ref<"order" | "random" | null>(null);
  const current = ref<PlayWord | null>(null);
  let run = 0;                                   // номер запуска: «Стоп» или новый запуск делают старый цикл недействительным
  let wake: (() => void) | null = null;          // прервать паузу при «Стоп»

  const pause = (ms: number) => new Promise<void>(resolve => {
    const timer = setTimeout(() => { wake = null; resolve(); }, ms);
    wake = () => { clearTimeout(timer); wake = null; resolve(); };
  });

  /** words() вызывается в начале каждого круга — слова, ушедшие из «Учу» во время проигрывания, выпадают. */
  async function play(words: () => PlayWord[], random: boolean, mode: () => PlayMode) {
    stop();
    if (!speechSupported) return;
    const id = ++run;
    playing.value = random ? "random" : "order";
    let last: string | undefined;
    while (id === run) {
      const list = words();
      if (!list.length) break;
      const order = roundOrder(list.map(w => w.key), random, last);
      for (const key of order) {
        if (id !== run) return;
        const word = words().find(w => w.key === key);
        if (!word) continue;
        current.value = word;
        last = key;
        const phrases = phrasesOf(word, mode());
        for (let i = 0; i < phrases.length; i++) {
          if (id !== run) return;
          if (i) await pause(GAP_MS);
          if (id !== run) return;
          await speakAndWait(phrases[i].text, phrases[i].lang);
        }
        if (id !== run) return;
        await pause(NEXT_MS);
      }
    }
    if (id === run) stop();
  }

  function stop() {
    run++;
    wake?.();
    if (speechSupported) { try { speechSynthesis.cancel(); } catch { /* не важно */ } }
    playing.value = null;
    current.value = null;
  }

  onUnmounted(stop);
  return { playing, current, play, stop, supported: speechSupported };
}
