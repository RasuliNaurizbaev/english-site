// Проиграть одно предложение рассказа: из mp3 (если есть тайминги), иначе голосом браузера.
import { onUnmounted, ref } from "vue";
import type { Story } from "@/domain/types";
import { audioUrl } from "@/data/config";
import { browserVoiceSupported } from "./useBrowserReader";

export function useSentenceAudio(story: Story, preferredVoice: string) {
  const track = story.audio.find(t => t.voice === preferredVoice && t.timings) ?? story.audio.find(t => t.timings);
  const source = ref<"mp3" | "browser" | "none">(track ? "mp3" : browserVoiceSupported ? "browser" : "none");
  const playing = ref(false);
  let audio: HTMLAudioElement | null = null;
  let stopAt = 0;

  function stop() {
    playing.value = false;
    audio?.pause();
    if (browserVoiceSupported) speechSynthesis.cancel();
  }

  /** index — номер предложения в рассказе (с 0, без заголовка). slow — помедленнее. */
  function play(index: number, text: string, slow = false) {
    stop();
    if (source.value === "mp3" && track?.timings) {
      const [start, end] = track.timings[index + 1];          // в таймингах 0 — заголовок
      if (!audio) {
        audio = new Audio(audioUrl(track.src));
        audio.addEventListener("timeupdate", () => { if (audio && audio.currentTime >= stopAt) { audio.pause(); playing.value = false; } });
        audio.addEventListener("error", () => { source.value = browserVoiceSupported ? "browser" : "none"; });   // mp3 не загрузился
      }
      stopAt = end;
      audio.playbackRate = slow ? 0.75 : 1;
      audio.currentTime = start;
      playing.value = true;
      audio.play().catch(() => { playing.value = false; });
    } else if (source.value === "browser") {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = slow ? 0.7 : 0.95;
      utterance.onend = () => { playing.value = false; };
      playing.value = true;
      speechSynthesis.speak(utterance);
    }
  }

  onUnmounted(stop);
  return { source, playing, play, stop };
}
