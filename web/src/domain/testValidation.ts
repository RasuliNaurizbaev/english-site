// Проверка теста (тест уровня, пробный экзамен или созданный AI): формат и правильность ответов.
// Тесты от AI проверяются особенно строго — сайт не должен показать «сломанный» вопрос.
import type { Exercise, LevelTest, TestSection } from "./types";

const SECTION_KINDS = ["grammar", "vocabulary", "reading", "listening"];

export function exerciseProblems(e: Partial<Exercise> & Record<string, unknown>, where: string): string[] {
  const problems: string[] = [];
  if (typeof e.q !== "string" || !e.q.trim()) problems.push(`${where}: нет вопроса (q)`);
  switch (e.type) {
    case "tf":
      if (typeof e.answer !== "boolean") problems.push(`${where}: answer должен быть true/false`);
      break;
    case "choice": {
      const options = e.options as unknown;
      if (!Array.isArray(options) || options.length < 2 || new Set(options).size !== options.length) problems.push(`${where}: options — 2+ разных варианта`);
      else if (!Number.isInteger(e.answer) || (e.answer as number) < 0 || (e.answer as number) >= options.length) problems.push(`${where}: answer — номер варианта`);
      break;
    }
    case "input":
      if (!Array.isArray(e.answer) || !e.answer.length) problems.push(`${where}: answer — список вариантов`);
      if (typeof e.q === "string" && e.q.split("___").length !== 2) problems.push(`${where}: в q должен быть ровно один ___`);
      break;
    case "order":
      if (typeof e.answer !== "string" || e.answer.split(/\s+/).length < 3) problems.push(`${where}: answer — предложение из 3+ слов`);
      break;
    default:
      problems.push(`${where}: неизвестный type ${String(e.type)}`);
  }
  return problems;
}

/** Список ошибок; пустой — тест в порядке. */
export function testProblems(value: unknown): string[] {
  const test = value as Partial<LevelTest> | null;
  if (!test || typeof test !== "object") return ["это не объект"];
  const problems: string[] = [];
  if (!test.title) problems.push("нет title");
  if (!Array.isArray(test.sections) || !test.sections.length) return [...problems, "нет sections"];
  test.sections.forEach((section: Partial<TestSection>, s) => {
    const where = `раздел ${s + 1}`;
    if (!SECTION_KINDS.includes(String(section.kind))) problems.push(`${where}: kind должен быть ${SECTION_KINDS.join("/")}`);
    if (section.kind === "reading" && !section.text) problems.push(`${where}: нет text`);
    if (section.kind === "listening" && !section.script) problems.push(`${where}: нет script`);
    if (!Array.isArray(section.exercises) || !section.exercises.length) problems.push(`${where}: нет exercises`);
    else section.exercises.forEach((e, i) => problems.push(...exerciseProblems(e as never, `${where}, вопрос ${i + 1}`)));
  });
  return problems;
}

/** Уровень по проценту правильных ответов (bands отсортированы по min). */
export function levelForScore(test: LevelTest, percent: number): string {
  const bands = [...(test.bands ?? [])].sort((a, b) => a.min - b.min);
  let level = bands[0]?.level ?? "—";
  for (const band of bands) if (percent >= band.min) level = band.level;
  return level;
}

/** Все вопросы теста подряд (для подсчёта результата). */
export const allExercises = (test: LevelTest): Exercise[] => test.sections.flatMap(s => s.exercises);
