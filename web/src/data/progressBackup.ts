// Резервная копия прогресса: сохранить всё в JSON-файл и восстановить из него.
// Зачем: прогресс хранится в браузере и привязан к адресу сайта (localhost, 192.168…, 172.20…).
// Файл позволяет перенести прогресс на другой адрес, другой браузер или восстановить после очистки.
import type { KeyValueStorage } from "./storage";

const FORMAT = "english-site-progress";
const VERSION = 1;

/** Эти ключи в файл не попадают: секреты (ключи AI) не должны оказаться в файле, который можно переслать. */
const NOT_EXPORTED = new Set(["ai"]);

export interface ProgressFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;           // дата и время (ISO)
  data: Record<string, unknown>;
}

export interface BackupSummary {
  keys: number;
  words: number;                // карточек слов
  stories: number;              // пройденных рассказов
  grammar: number;              // тем с результатом
}

export class ProgressBackup {
  constructor(private readonly storage: KeyValueStorage, private readonly now: () => Date = () => new Date()) {}

  /** Весь прогресс в виде объекта для файла. */
  export(): ProgressFile {
    const data: Record<string, unknown> = {};
    for (const key of this.storage.keys().sort()) {
      if (!NOT_EXPORTED.has(key)) data[key] = this.storage.get(key, null);
    }
    return { format: FORMAT, version: VERSION, exportedAt: this.now().toISOString(), data };
  }

  /** Имя файла: english-progress-2026-11-18.json */
  fileName(): string {
    return `english-progress-${this.now().toISOString().slice(0, 10)}.json`;
  }

  /** Проверить файл. Возвращает описание содержимого или бросает понятную ошибку. */
  inspect(text: string): { file: ProgressFile; summary: BackupSummary } {
    let file: ProgressFile;
    try {
      file = JSON.parse(text);
    } catch {
      throw new Error("Это не файл прогресса: не удалось прочитать JSON.");
    }
    if (file?.format !== FORMAT || typeof file.data !== "object" || file.data === null) {
      throw new Error("Это не файл прогресса этого сайта.");
    }
    if (file.version > VERSION) throw new Error("Файл создан более новой версией сайта — обновите сайт.");
    const count = (key: string) => Object.keys((file.data[key] as object) ?? {}).length;
    return {
      file,
      summary: { keys: Object.keys(file.data).length, words: count("srs"), stories: count("storyDone"), grammar: count("grammarDone") },
    };
  }

  /** Заменить текущий прогресс прогрессом из файла (ключи AI не трогаем). */
  restore(file: ProgressFile): void {
    for (const key of this.storage.keys()) {
      if (!NOT_EXPORTED.has(key)) this.storage.remove(key);
    }
    for (const [key, value] of Object.entries(file.data)) {
      if (!NOT_EXPORTED.has(key)) this.storage.set(key, value);
    }
  }
}
