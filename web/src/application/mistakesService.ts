// «Мои ошибки»: какие упражнения грамматики повторить сегодня и что делать с ответом.
import type { ContentRepository } from "@/data/contentRepository";
import type { ProgressRepository } from "@/data/progressRepository";
import { mistakeKey, recordMistake, reviewMistake } from "@/domain/mistakes";
import type { Exercise, GrammarTopic } from "@/domain/types";

export interface DueMistake {
  key: string;
  topic: GrammarTopic;
  exercise: Exercise;
}

export class MistakesService {
  constructor(
    private readonly content: ContentRepository,
    private readonly progress: ProgressRepository,
    private readonly today: () => number,
  ) {}

  /** Ответ в теме грамматики: ошибка попадает в «Мои ошибки». */
  recordAnswer(topicId: string, exerciseIndex: number, correct: boolean): void {
    if (correct) return;
    const all = this.progress.mistakes();
    all[mistakeKey(topicId, exerciseIndex)] = recordMistake(topicId, exerciseIndex, this.today());
    this.progress.saveMistakes(all);
  }

  /** Упражнения, которые пора повторить сегодня. */
  due(): DueMistake[] {
    const today = this.today();
    return Object.entries(this.progress.mistakes())
      .filter(([, m]) => m.due <= today)
      .map(([key, m]) => {
        const topic = this.content.grammarTopic(m.topicId);
        const exercise = topic?.exercises[m.exercise];
        return topic && exercise ? { key, topic, exercise } : null;
      })
      .filter((m): m is DueMistake => m !== null);
  }

  total(): number { return Object.keys(this.progress.mistakes()).length; }

  /** Ответ при повторении: верно — интервал растёт (после 4 раз ошибка убирается), неверно — снова завтра. */
  review(key: string, correct: boolean): void {
    const all = this.progress.mistakes();
    if (!all[key]) return;
    const next = reviewMistake(all[key], correct, this.today());
    if (next) all[key] = next; else delete all[key];
    this.progress.saveMistakes(all);
    this.progress.recordActivity("mistakes");
  }
}
