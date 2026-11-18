// Произношение слова голосом устройства (бесплатно, без интернета в Safari).

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(text: string): void {
  if (!speechSupported) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}
