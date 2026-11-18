// Сценарий «создать новый тест с помощью AI».
// 1) составить задание для AI (уровень, темы, вопросы, которые уже были — чтобы не повторяться);
// 2) получить ответ и вытащить из него JSON;
// 3) строго проверить тест (domain/testValidation.ts) — неправильный тест не показываем;
// 4) сохранить в списке созданных тестов.
import type { AiProvider } from "@/data/ai/aiProvider";
import type { ProgressRepository } from "@/data/progressRepository";
import { testProblems } from "@/domain/testValidation";
import type { LevelTest } from "@/domain/types";

export interface GenerateOptions {
  level: "A2" | "B1";
  focus: string;                 // например "Present Perfect, phrasal verbs" — можно пустым
}

const SYSTEM_PROMPT = `You write English tests for a Russian-speaking learner (A2 → B1).
Reply with ONE JSON object only, no markdown. Format:
{
  "title": "<English title>", "titleRu": "<Russian title>", "description": "<Russian, 1 sentence>", "minutes": 20,
  "sections": [
    {"kind": "grammar", "title": "Грамматика", "exercises": [ ...8 items... ]},
    {"kind": "vocabulary", "title": "Лексика", "exercises": [ ...6 items... ]},
    {"kind": "reading", "title": "Чтение", "text": "<English text, 150-250 words>", "exercises": [ ...5 items... ]}
  ]
}
Exercise formats (exactly one correct answer each; "explain" is one sentence in Russian):
  {"type":"choice","q":"She ___ here since 2020.","options":["lives","has lived","is living","lived"],"answer":1,"explain":"..."}
  {"type":"input","q":"If I ___ (have) time, I would help.","answer":["had"],"explain":"..."}   (exactly one ___ in q)
  {"type":"tf","q":"<statement about the reading text>","answer":true,"explain":"..."}   (only in reading)
Use natural, everyday English. Do not repeat questions the learner has already seen.`;

/** Задание для AI: уровень, темы и уже заданные вопросы (последние 60), чтобы не было повторов. */
export function buildUserPrompt(options: GenerateOptions, seenQuestions: string[]): string {
  const seen = seenQuestions.slice(-60).map(q => "- " + q).join("\n");
  return [
    `Level: ${options.level}.`,
    options.focus.trim() ? `Focus on: ${options.focus.trim()}.` : "Mix grammar topics typical for this level.",
    seen ? `Already used questions (write different ones):\n${seen}` : "",
  ].filter(Boolean).join("\n\n");
}

/** Вытащить JSON из ответа (на случай, если AI всё же обернул его в ```json ... ```). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{"), end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("В ответе нет JSON");
  return JSON.parse(body.slice(start, end + 1));
}

export class AiTestService {
  constructor(private readonly progress: ProgressRepository, private readonly now: () => number = () => Date.now()) {}

  generatedTests(): LevelTest[] { return this.progress.setting<LevelTest[]>("generatedTests", []); }

  /** Вопросы из всех созданных ранее тестов — чтобы AI не повторялся. */
  private seenQuestions(): string[] {
    return this.generatedTests().flatMap(t => t.sections.flatMap(s => s.exercises.map(e => e.q ?? "")));
  }

  async generate(provider: AiProvider, options: GenerateOptions): Promise<LevelTest> {
    const answer = await provider.complete(SYSTEM_PROMPT, buildUserPrompt(options, this.seenQuestions()));
    const raw = extractJson(answer) as Partial<LevelTest>;
    const problems = testProblems(raw);
    if (problems.length) throw new Error("AI прислал тест с ошибками: " + problems.slice(0, 3).join("; "));

    const test: LevelTest = {
      ...(raw as LevelTest),
      id: "ai_" + this.now(),
      kind: "generated",
      minutes: raw.minutes ?? 20,
      description: raw.description ?? "",
      titleRu: raw.titleRu ?? raw.title ?? "",
      bands: options.level === "B1"
        ? [{ min: 0, level: "A2" }, { min: 60, level: "B1" }, { min: 85, level: "B1+" }]
        : [{ min: 0, level: "A1" }, { min: 60, level: "A2" }, { min: 85, level: "A2+" }],
    };
    this.progress.saveSetting("generatedTests", [...this.generatedTests(), test].slice(-20));   // храним последние 20
    return test;
  }

  remove(id: string): void {
    this.progress.saveSetting("generatedTests", this.generatedTests().filter(t => t.id !== id));
  }
}
