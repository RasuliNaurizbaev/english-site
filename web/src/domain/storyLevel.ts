// Уровень рассказа — по номеру: 01–20 — A2 (01–10 ~430 слов, 11–20 ~1000 слов), 21 и дальше — B1.
import type { Level } from "./types";

export const STORY_LEVELS: Level[] = ["A2", "B1"];

export function storyLevel(storyId: string): Level {
  const number = parseInt(storyId, 10);
  return Number.isFinite(number) && number <= 20 ? "A2" : "B1";
}
