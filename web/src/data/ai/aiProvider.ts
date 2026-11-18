// Подключение AI для генерации новых тестов. Пока это заготовка: вы вводите ключ на странице «Тесты».
//
// Устроено как «адаптер»: остальной код знает только интерфейс AiProvider и не зависит от сервиса.
// Сейчас есть адаптер для сервисов с OpenAI-совместимым API (у многих есть бесплатный тариф:
// Groq, Google Gemini, OpenRouter). Чтобы добавить другой сервис (например, платный Claude
// через официальный SDK @anthropic-ai/sdk), напишите ещё один класс с методом complete()
// и добавьте его в createAiProvider().
//
// Ключ хранится только в localStorage вашего браузера — не в коде и не в git.
// Важно: запрос идёт прямо из браузера, поэтому ключ виден в инструментах разработчика —
// используйте личный ключ с лимитами и не публикуйте сайт с чужим ключом.

export interface AiSettings {
  preset: string;            // id из AI_PRESETS
  baseUrl: string;           // адрес API, например https://api.groq.com/openai/v1
  model: string;             // название модели — смотрите в документации сервиса
  apiKey: string;
}

export interface AiProvider {
  /** Отправить запрос и вернуть текст ответа. */
  complete(system: string, user: string): Promise<string>;
}

/** Готовые настройки адресов. Модель вписываете сами: списки моделей у сервисов часто меняются. */
export const AI_PRESETS = [
  { id: "groq", label: "Groq (есть бесплатный тариф)", baseUrl: "https://api.groq.com/openai/v1", docs: "https://console.groq.com/docs/models" },
  { id: "gemini", label: "Google Gemini (есть бесплатный тариф)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", docs: "https://ai.google.dev/gemini-api/docs/openai" },
  { id: "openrouter", label: "OpenRouter (есть бесплатные модели)", baseUrl: "https://openrouter.ai/api/v1", docs: "https://openrouter.ai/models" },
  { id: "custom", label: "Другой (OpenAI-совместимый API)", baseUrl: "", docs: "" },
] as const;

export const EMPTY_AI_SETTINGS: AiSettings = { preset: "groq", baseUrl: AI_PRESETS[0].baseUrl, model: "", apiKey: "" };

export function isConfigured(settings: AiSettings): boolean {
  return Boolean(settings.baseUrl.trim() && settings.model.trim() && settings.apiKey.trim());
}

export class AiRequestError extends Error {}

/** Сервисы с OpenAI-совместимым API: POST {baseUrl}/chat/completions. */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly settings: AiSettings) {}

  async complete(system: string, user: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.settings.baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.settings.apiKey },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature: 0.9,                      // больше разнообразия — тесты не повторяются
          response_format: { type: "json_object" },
        }),
      });
    } catch (error) {
      // Нет сети или сервис не разрешает запросы из браузера (CORS) — тогда понадобится свой небольшой сервер-посредник
      throw new AiRequestError("Не удалось связаться с сервисом (нет интернета или сервис не принимает запросы из браузера).", { cause: error });
    }
    if (response.status === 401 || response.status === 403) throw new AiRequestError("Сервис отклонил ключ API — проверьте ключ.");
    if (response.status === 429) throw new AiRequestError("Превышен лимит бесплатного тарифа — попробуйте позже.");
    if (!response.ok) throw new AiRequestError(`Ошибка сервиса: HTTP ${response.status}. ${(await response.text()).slice(0, 200)}`);

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new AiRequestError("Сервис вернул пустой ответ.");
    return text;
  }
}

export function createAiProvider(settings: AiSettings): AiProvider {
  return new OpenAiCompatibleProvider(settings);
}
