// Все сервисы приложения в одном объекте. Создаются один раз в main.ts и передаются страницам через provide/inject.
import type { ContentRepository } from "@/data/contentRepository";
import { ProgressRepository } from "@/data/progressRepository";
import type { KeyValueStorage } from "@/data/storage";
import { dayNumber } from "@/domain/text";
import { WordReviewService } from "./wordReview";

export interface Services {
  content: ContentRepository;
  progress: ProgressRepository;
  review: WordReviewService;
  today: () => number;
}

export function createServices(content: ContentRepository, storage: KeyValueStorage): Services {
  const today = () => dayNumber();
  const progress = new ProgressRepository(storage, today);
  return { content, progress, review: new WordReviewService(content, progress, today), today };
}
