<!--
  Текст рассказа: каждое предложение — отдельный элемент (для караоке), словарные слова подсвечены.
  Слова уже найдены заранее (tools/story_words.py) — здесь только отображение.
  @sentence-click(index) — нажали на предложение;  @word-click(element, meanings) — нажали на слово.
-->
<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import type { Story, StoryWord } from "@/domain/types";
import { highestLevel, marksBySentence, splitSentence, type TextPiece } from "@/domain/storyText";
import { breakIfRequested, reportProblem } from "../problems";

const props = defineProps<{
  story: Story;
  currentSentence: number;
  scrollToCurrent: boolean;
  clickable: boolean;
  highlight: boolean;
  translate: boolean;
}>();
const emit = defineEmits<{ sentenceClick: [index: number]; wordClick: [element: HTMLElement, meanings: StoryWord[]] }>();

interface Sentence { index: number; pieces: TextPiece[] }

/** Если подсветка не сработает — текст без подсветки, но рассказ всё равно читается. */
function pieces(text: string, marks: Story["marks"]): TextPiece[] {
  try {
    breakIfRequested("wordMarks");
    return splitSentence(text, marks, props.story.words);
  } catch (error) {
    reportProblem("подсветка слов", error);
    return [{ text }];
  }
}

const paragraphs = computed<Sentence[][]>(() => {
  const marks = marksBySentence(props.story);
  let number = 0;                                  // номер предложения в данных (с 0)
  return props.story.paragraphs.map(paragraph => paragraph.map(text => {
    const sentence = { index: number + 1, pieces: pieces(text, marks.get(number) ?? []) };   // +1: 0 — заголовок
    number++;
    return sentence;
  }));
});

function onClick(event: MouseEvent, sentence: Sentence) {
  const wordElement = (event.target as HTMLElement).closest<HTMLElement>(".w");
  if (wordElement && props.translate) {
    const piece = sentence.pieces[Number(wordElement.dataset.piece)];
    if (piece?.meanings?.length) {
      event.stopPropagation();                     // чтобы перевод сразу не закрылся
      emit("wordClick", wordElement, piece.meanings);
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
            ><span v-if="piece.meanings" class="w" :class="highestLevel(piece.meanings)" :data-piece="k">{{ piece.text }}</span
            ><template v-else>{{ piece.text }}</template></template
          ></span
        >{{ s < paragraph.length - 1 ? " " : "" }}
      </template>
    </p>
  </article>
</template>
