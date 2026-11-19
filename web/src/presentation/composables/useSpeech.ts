// Произношение слова голосом устройства (бесплатно, без интернета в Safari).
// Здесь же — выбор голоса: им пользуются и кнопка 🔊, и чтение рассказа голосом браузера.

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

/** Голоса для забавы (macOS): звучат странно, для учёбы не годятся. */
const NOVELTY_VOICES = ["Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester",
  "Organ", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Fred", "Junior", "Kathy", "Ralph",
  "Grandma", "Grandpa", "Eddy", "Flo", "Reed", "Rocko", "Sandy", "Shelley"];
/** Хорошие голоса по убыванию качества. */
const PREFERRED_VOICES = ["Google US English", "Samantha", "Ava", "Allison", "Microsoft Aria", "Microsoft Jenny", "Alex"];

function isNovelty(v: SpeechSynthesisVoice): boolean {
  const base = v.name.replace(/\s*\(.*\)\s*$/, "").trim();   // «Eddy (English (US))» → «Eddy»
  return NOVELTY_VOICES.includes(base);
}

/** Лучший английский голос из списка: улучшенный (Premium/Enhanced) → известный хороший → любой американский → любой английский. */
export function chooseVoice(all: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = all.filter(v => /^en[-_]/i.test(v.lang));
  const normal = english.filter(v => !isNovelty(v));
  const voices = normal.length ? normal : english;
  const rank = (v: SpeechSynthesisVoice) => {
    const known = PREFERRED_VOICES.findIndex(name => v.name.includes(name));
    const quality = /premium|enhanced|natural|neural/i.test(v.name) ? 0 : 1;
    return quality * 100 + (known >= 0 ? known : 50) + (/en[-_]US/i.test(v.lang) ? 0 : 10);
  };
  return [...voices].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function pickVoice(): SpeechSynthesisVoice | null {
  try { return chooseVoice(speechSynthesis.getVoices()); } catch { return null; }
}

/** Что произносить: без пояснений в скобках и многоточий («change (money)» → «change», «I'd like...» → «I'd like»). */
export function speechText(text: string): string {
  return text.replace(/\([^)]*\)/g, " ").replace(/\.{2,}|…/g, " ").replace(/\s+/g, " ").replace(/ ([?!.,])/g, "$1").trim();
}

// в Chrome список голосов загружается не сразу — просим заранее, чтобы к первому нажатию он был готов
if (speechSupported) { try { speechSynthesis.getVoices(); } catch { /* не важно */ } }

export function speak(text: string): void {
  if (!speechSupported) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speechText(text));
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  const voice = pickVoice();
  try { if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } } catch { /* голос по умолчанию */ }
  speechSynthesis.speak(utterance);
}
