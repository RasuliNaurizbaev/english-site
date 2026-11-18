<!-- Диктант: слушаете предложение из рассказа, пишете его — сайт показывает, какие слова верно, а какие нет. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { useSentenceAudio } from "../composables/useSentenceAudio";
import { breakIfRequested } from "../problems";
import { checkDictation, pickDictationSentences, type DictationResult } from "@/domain/dictation";
import NotFoundPage from "./NotFoundPage.vue";

breakIfRequested("dictationPage");
const props = defineProps<{ id: string }>();
const { content, progress } = useServices();
const story = content.story(props.id);
const sentences = story ? story.paragraphs.flat() : [];
const chosen = pickDictationSentences(sentences, 10);
const audio = story ? useSentenceAudio(story, progress.setting("voice", "jenny")) : null;

const position = ref(0);
const typed = ref("");
const result = ref<DictationResult | null>(null);
const scores = ref<number[]>([]);
const finished = computed(() => position.value >= chosen.length);
const current = computed(() => chosen[position.value]);
const average = computed(() => (scores.value.length ? Math.round(scores.value.reduce((a, b) => a + b, 0) / scores.value.length * 100) : 0));

function listen(slow = false) { if (current.value !== undefined) audio?.play(current.value, sentences[current.value], slow); }
function check() {
  if (!typed.value.trim() || result.value) return;
  result.value = checkDictation(sentences[current.value], typed.value);
  scores.value.push(result.value.score);
}
function next() {
  position.value++;
  typed.value = "";
  result.value = null;
  if (finished.value) progress.recordActivity("dictation");
  else setTimeout(() => listen(), 300);
}
</script>

<template>
  <NotFoundPage v-if="!story" />
  <template v-else>
    <RouterLink class="back" :to="'/story/' + story.id">← К рассказу</RouterLink>
    <h1 class="story-title">Диктант: {{ story.title }}</h1>
    <p class="intro">Прослушайте предложение и напишите его. Регистр и знаки препинания не важны. Можно слушать сколько угодно раз.</p>
    <p v-if="audio?.source.value === 'none'" class="error-box">🔇 Нет аудио, и браузер не умеет читать вслух — диктант недоступен.</p>

    <template v-else-if="!finished">
      <div class="progress"><i :style="{ width: (position / chosen.length) * 100 + '%' }" /></div>
      <p class="muted">Предложение {{ position + 1 }} из {{ chosen.length }} · {{ audio?.source.value === "mp3" ? "голос из mp3" : "голос браузера" }}</p>
      <div class="dictation-controls">
        <button class="primary-small small" @click="listen()">▶ Слушать</button>
        <button class="small" @click="listen(true)">🐢 Медленно</button>
      </div>
      <textarea v-model="typed" class="dictation-input" rows="3" placeholder="Напишите, что услышали…" :disabled="!!result"
        autocapitalize="off" autocomplete="off" spellcheck="false" @keydown.enter.prevent="result ? next() : check()" />

      <button v-if="!result" class="primary" @click="check">Проверить</button>
      <template v-else>
        <div class="dictation-result">
          <span v-for="(w, i) in result.words" :key="i" :class="w.ok ? 'ok-word' : 'bad-word'">{{ w.word }} </span>
          <div v-if="result.extra.length" class="muted">Лишние слова: <s>{{ result.extra.join(" ") }}</s></div>
          <div class="task-score">Верно: {{ Math.round(result.score * 100) }}%</div>
        </div>
        <button class="primary" @click="next">{{ position + 1 < chosen.length ? "Следующее →" : "Завершить" }}</button>
      </template>
    </template>

    <template v-else>
      <div class="flashcard done">
        <div class="fc-main">{{ average }}%</div>
        <div class="fc-sub">Диктант завершён: {{ chosen.length }} предложений</div>
      </div>
      <RouterLink class="primary" :to="'/story/' + story.id">К рассказу</RouterLink>
      <RouterLink class="primary ghostbtn" to="/practice">К практике</RouterLink>
    </template>
  </template>
</template>
