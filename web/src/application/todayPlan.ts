// План на сегодня: что повторить, какой рассказ и какую тему взять следующими.
import type { Services } from "./services";
import { formatDuration } from "@/domain/text";
import { storyLevel } from "@/domain/storyLevel";
import type { Level, Story } from "@/domain/types";

export interface PlanItem {
  key: "words" | "story" | "grammar" | "mistakes" | "audio";
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

// ---------- рассказ дня: пользователь выбирает уровень → случайный рассказ этого уровня ----------

/** Выбранный сегодня рассказ (ключ хранилища «storyPick»). */
export interface StoryPick { day: number; level: Level; id: string }

/** Случайный рассказ уровня: сначала из непройденных (если пройдены все — из всех), по возможности не тот же самый. */
export function randomStory({ content, progress }: Services, level: Level, exceptId?: string, random = Math.random): Story | undefined {
  const results = progress.storyResults();
  const ofLevel = content.stories().filter(s => storyLevel(s.id) === level);
  const unfinished = ofLevel.filter(s => !results[s.id]);
  const pool = unfinished.length ? unfinished : ofLevel;
  const candidates = pool.length > 1 ? pool.filter(s => s.id !== exceptId) : pool;
  return candidates[Math.floor(random() * candidates.length)];
}

/** Рассказ, выбранный сегодня (вчерашний выбор не считается). */
export function todayStoryPick({ content, progress }: Services, today: number): StoryPick | null {
  const pick = progress.setting<StoryPick | null>("storyPick", null);
  return pick && pick.day === today && content.story(pick.id) ? pick : null;
}

/** Выбрать уровень (или «другой рассказ» того же уровня) → случайный рассказ, запомнить на сегодня. */
export function pickStory(services: Services, today: number, level: Level, random = Math.random): StoryPick | null {
  const current = todayStoryPick(services, today);
  const story = randomStory(services, level, current?.id, random);
  if (!story) return null;
  const pick: StoryPick = { day: today, level, id: story.id };
  services.progress.saveSetting("storyPick", pick);
  return pick;
}

export function storyPlan(services: Services, today: number): PlanItem {
  const { content, progress } = services;
  const results = progress.storyResults();
  const stories = content.stories();
  const finished = stories.filter(s => results[s.id]).length;
  const pick = todayStoryPick(services, today);
  const story = pick ? content.story(pick.id) : undefined;
  return {
    key: "story", icon: "📖", title: "Рассказ",
    done: (progress.activityOfDay(today)?.stories ?? 0) > 0,
    text: story ? `${pick!.level} · ${story.title}${results[story.id] ? " (уже пройден)" : ""}` : "Выберите уровень — откроется случайный рассказ",
    note: `Пройдено ${finished} из ${stories.length}`,
    link: story ? "/story/" + story.id : "/stories", action: story ? "Открыть" : "Список",
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

/** «Мои ошибки»: показываем, только если на сегодня есть что повторить. */
export function mistakesPlan({ mistakes }: Services): PlanItem | null {
  const due = mistakes.due().length;
  if (!due) return null;
  return {
    key: "mistakes", icon: "🔁", title: "Мои ошибки", done: false, link: "/mistakes",
    text: `Повторить упражнения с ошибками: ${due}`, action: "Повторить",
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
