// Настройки чтения рассказа: размер шрифта, подсветка слов, перевод по нажатию. Запоминаются.
import { reactive, watch } from "vue";
import type { ProgressRepository } from "@/data/progressRepository";

export interface ReaderSettings {
  fontSize: number;
  highlight: boolean;
  translate: boolean;
}

let settings: ReaderSettings | null = null;

export function useReaderSettings(progress: ProgressRepository): ReaderSettings {
  if (settings) return settings;
  const state = reactive<ReaderSettings>({
    fontSize: progress.setting("font", 19),
    highlight: progress.setting("hl", true),
    translate: progress.setting("tr", true),
  });
  watch(() => state.fontSize, size => {
    document.documentElement.style.setProperty("--font-size", size + "px");
    progress.saveSetting("font", size);
  }, { immediate: true });
  watch(() => state.highlight, value => progress.saveSetting("hl", value));
  watch(() => state.translate, value => progress.saveSetting("tr", value));
  settings = state;
  return state;
}

export function changeFontSize(state: ReaderSettings, delta: number): void {
  state.fontSize = Math.min(30, Math.max(14, state.fontSize + delta));
}
