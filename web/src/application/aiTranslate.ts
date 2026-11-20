// Подсказка перевода для «Моих слов»: спросить AI (Gemini, потом Groq) — перевод на русский.
import type { AiProvider } from "@/data/ai/aiProvider";
import { extractJson } from "./aiTests";

const SYSTEM_PROMPT =
  "You are an English–Russian dictionary for a learner of English (level A2–B1). " +
  "Reply with JSON only: {\"ru\": \"...\"}.";

export function translationPrompt(en: string): string {
  return `Translate the English word or phrase "${en}" into Russian. ` +
    "Give 1–3 most common meanings, comma-separated, lowercase, no explanations, no examples. " +
    "If it is not an English word, return {\"ru\": \"\"}.";
}

/** Перевод от первого ответившего сервиса. Пустая строка — AI не узнал слово. */
export async function suggestTranslation(providers: AiProvider[], en: string): Promise<string> {
  if (!providers.length) throw new Error("AI недоступен: войдите по коду (Практика → Тесты) или введите свой ключ.");
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const answer = extractJson(await provider.complete(SYSTEM_PROMPT, translationPrompt(en))) as { ru?: unknown };
      if (typeof answer?.ru !== "string") throw new Error(`${provider.name}: непонятный ответ.`);
      return answer.ru.trim().slice(0, 150);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(failures.join(" → "));
}
