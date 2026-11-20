// Загрузка контента (рассказы, словари, грамматика, аудио слов) из public/data/*.json.
// Каждый файл грузится отдельно: если один не загрузится, остальные разделы работают.
import type { GrammarTopic, Level, LevelTest, Story, Vocabulary, Word, WordAudio, WordAudioPart, WordLevel } from "@/domain/types";
import { MY_LEVEL, myWordKey, type MyWord } from "@/domain/myWords";
import type { IrregularVerb } from "@/domain/verbs";
import { dataUrl } from "./config";

export interface LoadProblem {
  what: string;
  error: unknown;
}

export class ContentRepository {
  readonly levels: Level[];
  private readonly wordsByKey = new Map<string, Word>();
  private myWordList: [string, string][] = [];

  constructor(
    private readonly storyList: Story[],
    private readonly vocabulary: Vocabulary,
    private readonly grammar: GrammarTopic[],
    private readonly wordAudio: WordAudio,
    private readonly verbList: IrregularVerb[] = [],
    private readonly testList: LevelTest[] = [],
  ) {
    this.levels = Object.keys(vocabulary) as Level[];
    for (const level of this.levels) {
      for (const [en, ru] of vocabulary[level] ?? []) {
        const key = level + "|" + en;
        this.wordsByKey.set(key, { key, level, en, ru });
      }
    }
  }

  // ---------- рассказы ----------
  stories(): Story[] { return this.storyList; }
  story(id: string): Story | undefined { return this.storyList.find(s => s.id === id); }
  nextStoryAfter(story: Story): Story | undefined { return this.storyList[this.storyList.indexOf(story) + 1]; }

  // ---------- слова ----------
  wordsOfLevel(level: WordLevel): [string, string][] { return level === MY_LEVEL ? this.myWordList : this.vocabulary[level] ?? []; }
  word(key: string): Word | undefined { return this.wordsByKey.get(key); }
  hasWord(key: string): boolean { return this.wordsByKey.has(key); }

  /** «Мои слова» (из прогресса пользователя): после каждого изменения список заменяется целиком. */
  setMyWords(words: readonly MyWord[]): void {
    for (const [en] of this.myWordList) this.wordsByKey.delete(myWordKey(en));
    this.myWordList = words.map(w => [w.en, w.ru]);
    for (const w of words) this.wordsByKey.set(myWordKey(w.en), { key: myWordKey(w.en), level: MY_LEVEL, en: w.en, ru: w.ru });
  }

  // ---------- грамматика ----------
  grammarTopics(): GrammarTopic[] { return this.grammar; }
  grammarTopic(id: string): GrammarTopic | undefined { return this.grammar.find(t => t.id === id); }
  grammarTopicsOfLevel(level: Level): GrammarTopic[] { return this.grammar.filter(t => t.level === level); }
  nextGrammarTopicAfter(topic: GrammarTopic): GrammarTopic | undefined { return this.grammar[this.grammar.indexOf(topic) + 1]; }

  // ---------- аудио слов ----------
  wordAudioLevels(): Level[] { return (Object.keys(this.wordAudio) as Level[]).filter(l => (this.wordAudio[l] ?? []).length); }
  wordAudioParts(level: Level): WordAudioPart[] { return this.wordAudio[level] ?? []; }

  // ---------- неправильные глаголы и тесты ----------
  verbs(): IrregularVerb[] { return this.verbList; }
  tests(): LevelTest[] { return this.testList; }
  test(id: string): LevelTest | undefined { return this.testList.find(t => t.id === id); }
}

async function loadJson<T>(name: string, fallback: T, problems: LoadProblem[]): Promise<T> {
  try {
    const response = await fetch(dataUrl(name));
    if (!response.ok) throw new Error("HTTP " + response.status);
    return (await response.json()) as T;
  } catch (error) {
    problems.push({ what: "данные " + name, error });
    return fallback;
  }
}

/** Загружает весь контент. Ошибки не выбрасываются — они возвращаются списком problems. */
export async function loadContent(): Promise<{ content: ContentRepository; problems: LoadProblem[] }> {
  const problems: LoadProblem[] = [];
  const [stories, vocabulary, grammar, wordAudio, verbs, tests] = await Promise.all([
    loadJson<Story[]>("stories.json", [], problems),
    loadJson<Vocabulary>("words.json", {}, problems),
    loadJson<GrammarTopic[]>("grammar.json", [], problems),
    loadJson<WordAudio>("audio.json", {}, problems),
    loadJson<IrregularVerb[]>("verbs.json", [], problems),
    loadJson<LevelTest[]>("tests.json", [], problems),
  ]);
  return { content: new ContentRepository(stories, vocabulary, grammar, wordAudio, verbs, tests), problems };
}
