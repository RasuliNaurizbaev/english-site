// План на сегодня: что повторить, какой рассказ и какую тему взять следующими.
import type { Services } from "./services";
import { formatDuration } from "@/domain/text";

export interface PlanItem {
  key: "words" | "story" | "grammar" | "audio";
  icon: string;
  title: string;
  text: string;
  note?: string;
  link: string;          // адрес страницы в роутере
  action: string;
  done: boolean;
}

export function wordsPlan({ review, progress }: Services, today: number): PlanItem {
  const due = review.dueWordKeys().length;
  const fresh = review.newWordKeys(review.newWordsLeftToday()).length;
  const done = due === 0 && fresh === 0;
  return {
    key: "words", icon: "🗂", title: "Слова", done, link: "/review",
    text: done ? "Готово! Сегодня повторено: " + (progress.activityOfDay(today)?.reviews ?? 0) : `К повторению: ${due} · новых: ${fresh}`,
    action: done ? "Ещё слова" : "Начать",
  };
}

export function storyPlan({ content, progress }: Services, today: number): PlanItem {
  const results = progress.storyResults();
  const stories = content.stories();
  const next = stories.find(s => !results[s.id]);
  const finished = stories.filter(s => results[s.id]).length;
  return {
    key: "story", icon: "📖", title: "Рассказ",
    done: !next || (progress.activityOfDay(today)?.stories ?? 0) > 0,
    text: next ? next.title + " · прочитать, послушать, ответить на вопросы" : "Все рассказы пройдены!",
    note: `Пройдено ${finished} из ${stories.length}`,
    link: next ? "/story/" + next.id : "/stories", action: next ? "Открыть" : "Список",
  };
}

export function grammarPlan({ content, progress }: Services, today: number): PlanItem {
  const topics = content.grammarTopics();
  const next = topics.find(t => !progress.isGrammarDone(t.id));
  const finished = topics.filter(t => progress.isGrammarDone(t.id)).length;
  return {
    key: "grammar", icon: "📐", title: "Грамматика",
    done: !next || (progress.activityOfDay(today)?.grammar ?? 0) > 0,
    text: next ? `${next.level} · ${next.title}${next.titleRu ? " — " + next.titleRu : ""}` : "Все темы изучены!",
    note: `Изучено ${finished} из ${topics.length} тем`,
    link: next ? "/grammar/" + next.id : "/grammar", action: next ? "Учить" : "Список",
  };
}

/** Аудио по желанию: следующая непрослушанная часть. null — всё прослушано. */
export function audioPlan({ content, progress }: Services, today: number): PlanItem | null {
  const listened = progress.listenedParts();
  for (const level of content.wordAudioLevels()) {
    const part = content.wordAudioParts(level).find(p => !listened[p.file]);
    if (part) {
      return {
        key: "audio", icon: "🎧", title: "Слушать слова (по желанию)",
        done: (progress.activityOfDay(today)?.audio ?? 0) > 0,
        text: `${level} · часть ${part.part} · ${formatDuration(part.duration)}`,
        link: "/audio/" + level, action: "Слушать",
      };
    }
  }
  return null;
}
