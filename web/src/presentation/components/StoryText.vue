<!--
  Текст рассказа: каждое предложение — отдельный элемент (для караоке), словарные слова подсвечены.
  @sentence-click(index) — нажали на предложение;  @word-click(element, word) — нажали на слово.
-->
<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import type { Story, StoryWord } from "@/domain/types";
import { NO_WORD_FINDER, type WordFinder } from "@/domain/wordForms";
import { reportProblem } from "../problems";

const props = defineProps<{
  story: Story;
  finder: WordFinder;
  currentSentence: number;
  scrollToCurrent: boolean;
  clickable: boolean;
  highlight: boolean;
  translate: boolean;
}>();
const emit = defineEmits<{ sentenceClick: [index: number]; wordClick: [element: HTMLElement, word: StoryWord] }>();

type Piece = { text: string; word?: StoryWord };
interface Sentence { index: number; pieces: Piece[] }

/** Делим каждое предложение на куски: обычный текст и словарные слова. */
function splitIntoPieces(text: string): Piece[] {
  let matches;
  try {
    matches = props.finder.find(text);
  } catch (error) {
    reportProblem("подсветка слов", error);
    matches = NO_WORD_FINDER.find(text);
  }
  const pieces: Piece[] = [];
  let position = 0;
  for (const match of matches) {
    if (match.index > position) pieces.push({ text: text.slice(position, match.index) });
    pieces.push({ text: match.text, word: match.word });
    position = match.index + match.text.length;
  }
  if (position < text.length) pieces.push({ text: text.slice(position) });
  return pieces;
}

const paragraphs = computed<Sentence[][]>(() => {
  let index = 1;                                   // 0 — заголовок
  return props.story.paragraphs.map(paragraph => paragraph.map(text => ({ index: index++, pieces: splitIntoPieces(text) })));
});

function onClick(event: MouseEvent, sentence: Sentence) {
  const wordElement = (event.target as HTMLElement).closest<HTMLElement>(".w");
  if (wordElement && props.translate) {
    const piece = sentence.pieces[Number(wordElement.dataset.piece)];
    if (piece?.word) {
      event.stopPropagation();                     // чтобы перевод сразу не закрылся
      emit("wordClick", wordElement, piece.word);
      return;
    }
  }
  emit("sentenceClick", sentence.index);
}

// Предложение ушло за край экрана — прокручиваем к нему
watch(() => props.currentSentence, async index => {
  if (!props.scrollToCurrent || index < 1) return;
  await nextTick();
  const node = document.querySelector<HTMLElement>(`.story .sentence[data-sentence="${index}"]`);
  if (!node) return;
  const rect = node.getBoundingClientRect();
  const player = document.querySelector<HTMLElement>(".player");
  const visibleBottom = window.innerHeight - (player?.offsetHeight ?? 0) - 20;
  if (rect.top < 70 || rect.bottom > visibleBottom) node.scrollIntoView({ behavior: "smooth", block: "center" });
});
</script>

<template>
  <article class="story" :class="{ karaoke: clickable, hl: highlight, tr: translate }">
    <p v-for="(paragraph, p) in paragraphs" :key="p">
      <template v-for="(sentence, s) in paragraph" :key="sentence.index">
        <span class="sentence" :class="{ now: sentence.index === currentSentence }" :data-sentence="sentence.index" @click="onClick($event, sentence)"
          ><template v-for="(piece, k) in sentence.pieces" :key="k"
            ><span v-if="piece.word" class="w" :class="piece.word.level" :data-piece="k">{{ piece.text }}</span
            ><template v-else>{{ piece.text }}</template></template
          ></span
        >{{ s < paragraph.length - 1 ? " " : "" }}
      </template>
    </p>
  </article>
</template>
