// Прогресс пользователя. Все ключи хранилища собраны здесь, чтобы было видно, что сохраняется.
// Названия ключей совпадают со старой версией сайта — прогресс переносится.
import type { Card } from "@/domain/spacedRepetition";
import type { Mistake } from "@/domain/mistakes";
import type { VerbStats } from "@/domain/verbs";
import type { Level } from "@/domain/types";
import { dayNumber } from "@/domain/text";
import type { KeyValueStorage } from "./storage";

export type ActivityKind = "reviews" | "newWords" | "stories" | "grammar" | "audio" | "dictation" | "verbs" | "tests" | "mistakes";
export type DayActivity = Partial<Record<ActivityKind, number>>;

export interface StoryResult { score: number; day: number }
export interface GrammarResult { best: number; done: boolean; day: number }
export interface WordSettings { newPerDay: number; levels: Level[] }
export interface TestResult { testId: string; title: string; score: number; level: string; day: number }

export const PASS_SCORE = 80;
const DEFAULT_SETTINGS: WordSettings = { newPerDay: 10, levels: ["A1", "A2", "B1"] };

export class ProgressRepository {
  constructor(private readonly storage: KeyValueStorage, private readonly today: () => number = () => dayNumber()) {}

  get isPersistent(): boolean { return this.storage.persistent; }

  // ---------- активность по дням: { <номер дня>: { reviews: 12, ... } } ----------
  recordActivity(kind: ActivityKind, amount = 1): void {
    const log = this.storage.get<Record<number, DayActivity>>("log", {});
    const day = this.today();
    log[day] = log[day] ?? {};
    log[day][kind] = (log[day][kind] ?? 0) + amount;
    this.storage.set("log", log);
  }

  activityOfDay(day: number): DayActivity | null {
    return this.storage.get<Record<number, DayActivity>>("log", {})[day] ?? null;
  }

  /** Сколько дней подряд были занятия (если сегодня ещё не занимались — считаем до вчера). */
  streak(): number {
    const log = this.storage.get<Record<number, DayActivity>>("log", {});
    let day = this.today();
    if (!log[day]) day--;
    let count = 0;
    while (log[day]) { count++; day--; }
    return count;
  }

  // ---------- рассказы ----------
  storyResults(): Record<string, StoryResult> { return this.storage.get("storyDone", {}); }

  saveStoryResult(storyId: string, score: number): void {
    const all = this.storyResults();
    const isFirstTime = !all[storyId];
    all[storyId] = { score: Math.max(score, all[storyId]?.score ?? 0), day: this.today() };
    this.storage.set("storyDone", all);
    if (isFirstTime) this.recordActivity("stories");
  }

  // ---------- грамматика ----------
  grammarResults(): Record<string, GrammarResult> { return this.storage.get("grammarDone", {}); }
  isGrammarDone(topicId: string): boolean { return Boolean(this.grammarResults()[topicId]?.done); }

  saveGrammarResult(topicId: string, score: number): GrammarResult {
    const all = this.grammarResults();
    const previous = all[topicId];
    all[topicId] = {
      best: Math.max(score, previous?.best ?? 0),
      done: Boolean(previous?.done || score >= PASS_SCORE),
      day: this.today(),
    };
    this.storage.set("grammarDone", all);
    this.recordActivity("grammar");
    return all[topicId];
  }

  // ---------- прослушанные mp3 со словами ----------
  listenedParts(): Record<string, boolean> { return this.storage.get("listened", {}); }

  markPartListened(file: string): void {
    const all = this.listenedParts();
    if (!all[file]) this.recordActivity("audio");
    all[file] = true;
    this.storage.set("listened", all);
  }

  // ---------- настройки новых слов ----------
  wordSettings(): WordSettings { return { ...DEFAULT_SETTINGS, ...this.storage.get<Partial<WordSettings>>("srsSettings", {}) }; }
  updateWordSettings(changes: Partial<WordSettings>): void {
    this.storage.set("srsSettings", { ...this.storage.get("srsSettings", {}), ...changes });
  }

  // ---------- карточки слов (интервальное повторение) ----------
  loadCards(): Record<string, Card> | null { return this.storage.get<Record<string, Card> | null>("srs", null); }
  saveCards(cards: Record<string, Card>): void { this.storage.set("srs", cards); }
  /** Слова, отмеченные «выученными» в самой первой версии сайта (для переноса). */
  legacyKnownWords(): Record<string, string[]> { return this.storage.get("known", {}); }

  // ---------- «Мои ошибки» в грамматике: { "<topicId>#<номер упражнения>": Mistake } ----------
  mistakes(): Record<string, Mistake> { return this.storage.get("mistakes", {}); }
  saveMistakes(all: Record<string, Mistake>): void { this.storage.set("mistakes", all); }

  // ---------- неправильные глаголы: { go: { right: 3, wrong: 1 } } ----------
  verbStats(): Record<string, VerbStats> { return this.storage.get("verbStats", {}); }
  saveVerbAnswer(base: string, correct: boolean): void {
    const all = this.verbStats();
    const stats = all[base] ?? { right: 0, wrong: 0 };
    if (correct) stats.right++; else stats.wrong++;
    all[base] = stats;
    this.storage.set("verbStats", all);
  }

  // ---------- результаты тестов (история) ----------
  testResults(): TestResult[] { return this.storage.get("testResults", []); }
  saveTestResult(result: Omit<TestResult, "day">): void {
    this.storage.set("testResults", [...this.testResults(), { ...result, day: this.today() }]);
    this.recordActivity("tests");
  }

  // ---------- прочие настройки интерфейса ----------
  setting<T>(key: string, defaultValue: T): T { return this.storage.get(key, defaultValue); }
  saveSetting(key: string, value: unknown): void { this.storage.set(key, value); }
}
