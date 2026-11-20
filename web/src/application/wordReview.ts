// Сценарии повторения слов: какие слова показать сегодня, оценка, статистика.
import type { ContentRepository } from "@/data/contentRepository";
import type { ProgressRepository } from "@/data/progressRepository";
import { applyRating, nextIntervals, statusOf, studiedAtMs, KNOWN_INTERVAL, type Card, type Rating, type WordStatus } from "@/domain/spacedRepetition";
import type { WordLevel } from "@/domain/types";

export interface QueueItem { key: string; isNew: boolean }
export interface LevelStats { total: number; learning: number; learned: number }

export class WordReviewService {
  private cards: Record<string, Card>;

  constructor(
    private readonly content: ContentRepository,
    private readonly progress: ProgressRepository,
    private readonly today: () => number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.cards = progress.loadCards() ?? this.migrateLegacyProgress();
  }

  /** Первый запуск: слова, отмеченные «выученными» в первой версии сайта, становятся карточками. */
  private migrateLegacyProgress(): Record<string, Card> {
    const cards: Record<string, Card> = {};
    const legacy = this.progress.legacyKnownWords();
    for (const level of Object.keys(legacy)) {
      for (const en of legacy[level] ?? []) {
        cards[level + "|" + en] = { i: 30, e: 2.5, d: this.today() + 5 + Math.floor(Math.random() * 25), r: 1, l: 0 };
      }
    }
    this.progress.saveCards(cards);
    return cards;
  }

  /** Слова, которые пора повторить (самые просроченные — первыми). */
  dueWordKeys(): string[] {
    const today = this.today();
    return Object.keys(this.cards)
      .filter(key => this.cards[key].d <= today && this.content.hasWord(key))
      .sort((a, b) => this.cards[a].d - this.cards[b].d);
  }

  /** Следующие новые слова по порядку словарей (A1 → A2 → B1) из выбранных уровней. */
  newWordKeys(limit: number): string[] {
    const result: string[] = [];
    const chosen = this.progress.wordSettings().levels;
    for (const level of this.content.levels) {
      if (!chosen.includes(level)) continue;
      for (const [en] of this.content.wordsOfLevel(level)) {
        if (result.length >= limit) return result;
        const key = level + "|" + en;
        if (!this.cards[key]) result.push(key);
      }
    }
    return result;
  }

  newWordsLeftToday(): number {
    const todayActivity = this.progress.activityOfDay(this.today()) ?? {};
    return Math.max(0, this.progress.wordSettings().newPerDay - (todayActivity.newWords ?? 0));
  }

  /** Очередь на сегодня: просроченные слова, новые — вперемешку с ними. */
  buildTodayQueue(): QueueItem[] {
    const queue: QueueItem[] = this.dueWordKeys().slice(0, 150).map(key => ({ key, isNew: false }));
    for (const key of this.newWordKeys(this.newWordsLeftToday())) {
      queue.splice(Math.floor(Math.random() * (queue.length + 1)), 0, { key, isNew: true });
    }
    return queue;
  }

  nextIntervals(key: string) { return nextIntervals(this.cards[key]); }

  grade(key: string, rating: Rating): void {
    const isNew = !this.cards[key];
    this.cards[key] = { ...applyRating(this.cards[key], rating, this.today()), t: this.now() };
    this.progress.saveCards(this.cards);
    if (rating !== "known") {
      this.progress.recordActivity("reviews");
      if (isNew) this.progress.recordActivity("newWords");
    }
  }

  status(key: string): WordStatus { return statusOf(this.cards[key]); }

  /** Когда слово изучали последний раз (мс); 0 — ещё не изучали. Для сортировки «последние сверху». */
  studiedAt(key: string): number {
    const card = this.cards[key];
    return card ? studiedAtMs(card) : 0;
  }

  /**
   * Добавить слова (например, из рассказа) в повторение: они появятся в карточках уже сегодня,
   * не занимая лимит «новых слов в день». Уже изучаемые слова не трогаем. Возвращает, сколько добавлено.
   */
  addWords(keys: string[]): number {
    let added = 0;
    for (const key of keys) {
      if (this.cards[key] || !this.content.hasWord(key)) continue;
      this.cards[key] = { i: 0, e: 2.5, d: this.today(), r: 0, l: 0, t: this.now() };
      added++;
    }
    if (added) this.progress.saveCards(this.cards);
    return added;
  }

  /**
   * Из списка слов: «учу» — слово появится в повторении уже сегодня (не занимая лимит новых слов).
   * Выученное слово начинает учиться заново маленькими шагами; история (лёгкость, ошибки) сохраняется.
   */
  markLearning(key: string): void {
    if (!this.content.hasWord(key)) return;
    const card = this.cards[key];
    this.cards[key] = { ...(card ?? { e: 2.5, r: 0, l: 0 }), i: 0, d: this.today(), t: this.now() };
    this.progress.saveCards(this.cards);
  }

  /** Из списка слов: «выучено» — следующий показ через 60 дней. */
  markLearned(key: string): void {
    if (!this.content.hasWord(key)) return;
    const card = this.cards[key] ?? { i: 0, e: 2.5, d: this.today(), r: 0, l: 0 };
    this.cards[key] = { ...card, i: KNOWN_INTERVAL, d: this.today() + KNOWN_INTERVAL, r: Math.max(card.r, 1), t: this.now() };
    this.progress.saveCards(this.cards);
  }

  /** Слово удалено: история повторений больше не нужна. */
  forget(key: string): void {
    if (!this.cards[key]) return;
    delete this.cards[key];
    this.progress.saveCards(this.cards);
  }

  /** Слово переименовано (исправили написание): история повторений переходит к новому ключу. */
  renameKey(from: string, to: string): void {
    if (from === to || !this.cards[from]) return;
    this.cards[to] = this.cards[from];
    delete this.cards[from];
    this.progress.saveCards(this.cards);
  }

  levelStats(level: WordLevel): LevelStats {
    const stats: LevelStats = { total: 0, learning: 0, learned: 0 };
    for (const [en] of this.content.wordsOfLevel(level)) {
      stats.total++;
      const status = this.status(level + "|" + en);
      if (status === "learning") stats.learning++;
      if (status === "learned") stats.learned++;
    }
    return stats;
  }
}
