// Типы данных сайта. Данные собирает tools/build_site_data.py в web/public/data/*.json.

export type Level = "A1" | "A2" | "B1";

/** Слово из словаря рассказа. */
export interface StoryWord {
  en: string;
  ru: string;
  level: Level;
}

/** Запись рассказа одним голосом. timings[i] = [начало, конец] i-го предложения (0 — заголовок). */
export interface StoryAudioTrack {
  voice: string;
  label: string;
  src: string;                         // путь относительно папки аудио: stories/<id>/<voice>.mp3
  timings: [number, number][] | null;
}

/**
 * Отметка словарного слова в тексте: [номер предложения, начало, длина, номера значений в story.words].
 * Значений может быть несколько: "left" — «левый» и «to leave». Ищет слова tools/story_words.py.
 */
export type WordMark = [sentence: number, start: number, length: number, meanings: number[]];

export interface Story {
  id: string;
  title: string;
  paragraphs: string[][];              // абзацы → предложения (номер предложения считается подряд по всем абзацам)
  words: StoryWord[];
  marks: WordMark[];
  audio: StoryAudioTrack[];
  questions: StoryQuestions | null;
  wordCount: number;
}

export interface StoryQuestions {
  questions: Exercise[];               // только tf и choice
  retell: string[];
}

// ---------- упражнения ----------

export interface TrueFalseExercise { type: "tf"; q: string; answer: boolean; explain?: string; hint?: string }
export interface ChoiceExercise { type: "choice"; q: string; options: string[]; answer: number; explain?: string; hint?: string }
export interface InputExercise { type: "input"; q: string; answer: string[]; explain?: string; hint?: string }
export interface OrderExercise { type: "order"; q?: string; answer: string; explain?: string; hint?: string }
export type Exercise = TrueFalseExercise | ChoiceExercise | InputExercise | OrderExercise;

// ---------- грамматика ----------

export interface GrammarTopic {
  id: string;                          // A2_05_present_perfect
  level: Level;
  order: number;
  title: string;
  titleRu: string;
  summary: string;
  theory: string;                      // мини-markdown, см. domain/markdown.ts
  exercises: Exercise[];
}

// ---------- словарь и аудио слов ----------

/** { A1: [[english, russian], ...], ... } */
export type Vocabulary = Partial<Record<Level, [string, string][]>>;

export interface Word {
  key: string;                         // "A1|apple"
  level: Level;
  en: string;
  ru: string;
}

export interface WordAudioPart {
  file: string;
  src: string;                         // путь относительно папки аудио: words/A1/part_01.mp3
  part: number;
  from: number;
  to: number;
  count: number;
  first: string;
  last: string;
  duration: number;
}

export type WordAudio = Partial<Record<Level, WordAudioPart[]>>;

// ---------- тесты (уровень и пробные экзамены) ----------

export interface TestSection {
  kind: "grammar" | "vocabulary" | "reading" | "listening";
  title: string;
  text?: string;                       // reading: текст для чтения
  script?: string;                     // listening: текст, который читает голос ("Anna: …\nTom: …")
  exercises: Exercise[];
}

export interface LevelTest {
  id: string;
  kind: "placement" | "mock" | "generated";
  title: string;
  titleRu: string;
  description: string;
  minutes: number;
  sections: TestSection[];
  bands: { min: number; level: string }[];     // min — процент правильных ответов
}
