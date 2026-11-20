// «Мои слова»: добавить, исправить, удалить слово; группы. Хранятся в прогрессе (ключ myWords) —
// попадают в резервную копию. Новое слово сразу попадает в повторение на сегодня (не тратит лимит новых).
import type { ContentRepository } from "@/data/contentRepository";
import type { ProgressRepository } from "@/data/progressRepository";
import { DEFAULT_GROUP, groupsOf, myWordKey, tidy, validateMyWord, type MyWord } from "@/domain/myWords";
import type { WordReviewService } from "./wordReview";

export interface MyWordInput { en: string; ru: string; group: string }

export class MyWordsService {
  private words: MyWord[];

  constructor(
    private readonly content: ContentRepository,
    private readonly progress: ProgressRepository,
    private readonly review: WordReviewService,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.words = progress.myWords();
    content.setMyWords(this.words);
  }

  list(): readonly MyWord[] { return this.words; }
  groups(): string[] { return groupsOf(this.words); }
  find(en: string): MyWord | undefined { return this.words.find(w => w.en.toLowerCase() === en.toLowerCase()); }

  /** Добавить слово. Возвращает текст ошибки или null. */
  add(input: MyWordInput): string | null {
    const word = { en: tidy(input.en), ru: tidy(input.ru), group: tidy(input.group) || DEFAULT_GROUP, added: this.now() };
    const problem = validateMyWord(word);
    if (problem) return problem;
    if (this.find(word.en)) return `«${word.en}» уже есть в «Моих словах».`;
    this.save([...this.words, word]);
    this.review.addWords([myWordKey(word.en)]);
    return null;
  }

  /** Исправить слово, перевод или группу. История повторений сохраняется. Возвращает текст ошибки или null. */
  update(en: string, input: MyWordInput): string | null {
    const old = this.find(en);
    if (!old) return `«${en}» не найдено.`;
    const word = { ...old, en: tidy(input.en), ru: tidy(input.ru), group: tidy(input.group) || DEFAULT_GROUP };
    const problem = validateMyWord(word);
    if (problem) return problem;
    const twin = this.find(word.en);
    if (twin && twin !== old) return `«${word.en}» уже есть в «Моих словах».`;
    this.save(this.words.map(w => (w === old ? word : w)));
    this.review.renameKey(myWordKey(old.en), myWordKey(word.en));
    return null;
  }

  remove(en: string): void {
    const word = this.find(en);
    if (!word) return;
    this.save(this.words.filter(w => w !== word));
    this.review.forget(myWordKey(word.en));
  }

  private save(words: MyWord[]): void {
    this.words = words;
    this.progress.saveMyWords(words);
    this.content.setMyWords(words);
  }
}
