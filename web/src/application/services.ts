// Все сервисы приложения в одном объекте. Создаются один раз в main.ts и передаются страницам через provide/inject.
import type { ContentRepository } from "@/data/contentRepository";
import { ProgressRepository } from "@/data/progressRepository";
import type { KeyValueStorage } from "@/data/storage";
import { ProgressBackup } from "@/data/progressBackup";
import { dayNumber } from "@/domain/text";
import { WordReviewService } from "./wordReview";
import { MistakesService } from "./mistakesService";
import { AiTestService } from "./aiTests";

export interface Services {
  content: ContentRepository;
  progress: ProgressRepository;
  review: WordReviewService;
  mistakes: MistakesService;
  aiTests: AiTestService;
  backup: ProgressBackup;
  today: () => number;
}

export function createServices(content: ContentRepository, storage: KeyValueStorage): Services {
  const today = () => dayNumber();
  const progress = new ProgressRepository(storage, today);
  return {
    content, progress, today,
    review: new WordReviewService(content, progress, today),
    mistakes: new MistakesService(content, progress, today),
    aiTests: new AiTestService(progress),
    backup: new ProgressBackup(storage),
  };
}
