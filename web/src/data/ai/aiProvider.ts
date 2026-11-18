// Подключение AI для генерации новых тестов: Google Gemini (основной) и Groq (запасной).
// Оба сервиса бесплатны в пределах лимитов и совместимы с API OpenAI (POST /chat/completions, GET /models).
//
// Устроено как «адаптер»: остальной код знает только интерфейс AiProvider и не зависит от сервиса.
// Чтобы добавить другой сервис (например, платный Claude через официальный SDK @anthropic-ai/sdk),
// напишите ещё один класс с методами complete() и listModels() и добавьте его в AI_SERVICES.
//
// Ключи хранятся только в localStorage вашего браузера — не в коде и не в git.
// Запрос идёт прямо из браузера, поэтому ключ виден в инструментах разработчика —
// используйте личный ключ с лимитами.

export type AiServiceId = "groq" | "gemini";

export interface AiService {
  id: AiServiceId;
  label: string;
  role: string;
  baseUrl: string;
  keyUrl: string;                       // где получить ключ
  preferredModels: RegExp[];            // какую модель выбрать по умолчанию: по порядку, первое совпадение
}

/** Порядок важен: если есть ключ Gemini — сначала он; иначе (или если он не ответил) — Groq. */
export const AI_SERVICES: AiService[] = [
  {
    id: "gemini", label: "Google Gemini", role: "основной",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    // обычная «flash» (быстрая и бесплатная), не lite/preview/exp
    preferredModels: [/^gemini-[\d.]+-flash$/i, /^gemini-.*flash(?!.*(lite|preview|exp))/i, /^gemini-.*flash/i, /gemini/i],
  },
  {
    id: "groq", label: "Groq", role: "запасной",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    preferredModels: [/llama.*70b/i, /gpt-oss-120b/i, /llama/i, /gpt-oss/i],
  },
];

export interface ServiceSettings { apiKey: string; model: string }
export type AiSettings = Record<AiServiceId, ServiceSettings>;

export const EMPTY_AI_SETTINGS: AiSettings = { groq: { apiKey: "", model: "" }, gemini: { apiKey: "", model: "" } };

export const isServiceReady = (s: ServiceSettings) => Boolean(s.apiKey.trim() && s.model.trim());
export const isConfigured = (settings: AiSettings) => AI_SERVICES.some(service => isServiceReady(settings[service.id]));

/** Ошибка запроса к сервису — понятным текстом. */
export class AiRequestError extends Error {}

export interface AiProvider {
  readonly name: string;
  complete(system: string, user: string): Promise<string>;
}

/** Сервис с OpenAI-совместимым API. */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly service: AiService, private readonly settings: ServiceSettings) {}

  get name() { return this.service.label; }

  private async request(path: string, init?: RequestInit): Promise<any> {
    let response: Response;
    try {
      response = await fetch(this.service.baseUrl + path, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.settings.apiKey.trim() },
      });
    } catch (error) {
      throw new AiRequestError(`${this.name}: нет связи с сервисом (нет интернета или запрос заблокирован браузером).`, { cause: error });
    }
    if (response.status === 401 || response.status === 403) throw new AiRequestError(`${this.name}: ключ не подошёл — проверьте ключ.`);
    if (response.status === 429) throw new AiRequestError(`${this.name}: превышен лимит бесплатного тарифа — попробуйте позже.`);
    if (!response.ok) throw new AiRequestError(`${this.name}: ошибка HTTP ${response.status}. ${(await response.text()).slice(0, 150)}`);
    return response.json();
  }

  /** Список моделей, доступных по ключу (заодно проверяет ключ). */
  async listModels(): Promise<string[]> {
    const data = await this.request("/models");
    const ids: string[] = (data?.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, ""));
    return ids.filter(id => !/whisper|tts|embed|guard|image|audio|vision|aqa|imagen|veo/i.test(id)).sort();
  }

  async complete(system: string, user: string): Promise<string> {
    const data = await this.request("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: this.settings.model.trim(),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.9,                          // больше разнообразия — тесты не повторяются
        response_format: { type: "json_object" },
      }),
    });
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new AiRequestError(`${this.name}: пустой ответ.`);
    return text;
  }
}

/** Модель по умолчанию: первое правило из preferredModels, под которое что-то подходит; из подходящих — самая новая версия. */
export function pickDefaultModel(service: AiService, models: string[]): string {
  for (const rule of service.preferredModels) {
    const matching = models.filter(m => rule.test(m));
    if (matching.length) return matching.sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];
  }
  return models[0] ?? "";
}

export function createProvider(serviceId: AiServiceId, settings: ServiceSettings): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider(AI_SERVICES.find(s => s.id === serviceId)!, settings);
}

/** Сервисы в порядке использования (только те, где есть ключ и модель): Gemini, затем Groq. */
export function providersInOrder(settings: AiSettings): AiProvider[] {
  return AI_SERVICES.filter(s => isServiceReady(settings[s.id])).map(s => createProvider(s.id, settings[s.id]));
}

/** Настройки из хранилища (в том числе из старого формата с одним сервисом). */
export function normalizeSettings(saved: unknown): AiSettings {
  const result: AiSettings = structuredClone(EMPTY_AI_SETTINGS);
  const value = (saved ?? {}) as Record<string, any>;
  for (const service of AI_SERVICES) {
    if (value[service.id]?.apiKey !== undefined) result[service.id] = { apiKey: value[service.id].apiKey ?? "", model: value[service.id].model ?? "" };
  }
  if (value.preset && (value.preset === "groq" || value.preset === "gemini") && value.apiKey) {   // старый формат
    result[value.preset as AiServiceId] = { apiKey: value.apiKey, model: value.model ?? "" };
  }
  return result;
}
