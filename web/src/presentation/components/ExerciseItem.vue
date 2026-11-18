<!--
  Одно упражнение любого типа:
    tf     — верно / неверно            choice — выбор варианта
    input  — вписать слово вместо ___   order  — собрать предложение из слов
  После ответа показывает объяснение и сообщает родителю: @answered(isCorrect).
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { Exercise } from "@/domain/types";
import { normalizeAnswer, shuffled } from "@/domain/text";

const props = defineProps<{ exercise: Exercise; number: number }>();
const emit = defineEmits<{ answered: [isCorrect: boolean] }>();

const result = ref<null | { correct: boolean; correctText: string }>(null);
const answered = computed(() => result.value !== null);

function finish(correct: boolean, correctText: string) {
  if (answered.value) return;
  result.value = { correct, correctText };
  emit("answered", correct);
}

// ---------- tf / choice ----------
const choiceOptions = computed(() => {
  const e = props.exercise;
  if (e.type === "tf") return ["True — верно", "False — неверно"];
  return e.type === "choice" ? e.options : [];
});
const correctIndex = computed(() => {
  const e = props.exercise;
  if (e.type === "tf") return e.answer ? 0 : 1;
  return e.type === "choice" ? e.answer : -1;
});
const pickedIndex = ref<number | null>(null);
function choose(index: number) {
  if (answered.value) return;
  pickedIndex.value = index;
  finish(index === correctIndex.value, choiceOptions.value[correctIndex.value]);
}
function optionClass(index: number) {
  if (!answered.value) return "";
  if (index === correctIndex.value) return "right";
  return index === pickedIndex.value ? "wrong" : "";
}

// ---------- input ----------
const typed = ref("");
function checkInput() {
  const e = props.exercise;
  if (e.type !== "input" || !typed.value.trim() || answered.value) return;
  finish(e.answer.some(a => normalizeAnswer(a) === normalizeAnswer(typed.value)), e.answer[0]);
}
const inputParts = computed(() => (props.exercise.type === "input" ? props.exercise.q.split("___") : []));

// ---------- order ----------
interface Token { id: number; text: string }
const orderTokens: Token[] = (() => {
  const e = props.exercise;
  if (e.type !== "order") return [];
  const tokens = e.answer.split(/\s+/).map((text, id) => ({ id, text }));
  let mixed = shuffled(tokens);
  if (mixed.map(t => t.text).join(" ") === e.answer) mixed = mixed.reverse();   // не показываем уже собранным
  return mixed;
})();
const chosenTokens = ref<Token[]>([]);
const bankTokens = computed(() => orderTokens.filter(t => !chosenTokens.value.includes(t)));
function pickToken(token: Token) { if (!answered.value) chosenTokens.value.push(token); }
function returnToken(position: number) { if (!answered.value) chosenTokens.value.splice(position, 1); }
function checkOrder() {
  const e = props.exercise;
  if (e.type !== "order" || chosenTokens.value.length !== orderTokens.length) return;
  finish(normalizeAnswer(chosenTokens.value.map(t => t.text).join(" ")) === normalizeAnswer(e.answer), e.answer);
}

const questionText = computed(() => props.exercise.q?.replace("___", "_____") ?? "Составьте предложение");
</script>

<template>
  <div class="q-item" :class="['ex-' + exercise.type, answered ? 'answered ' + (result!.correct ? 'ok' : 'bad') : '']">
    <!-- верно/неверно и выбор варианта -->
    <template v-if="exercise.type === 'tf' || exercise.type === 'choice'">
      <div class="q-text">{{ number }}. {{ questionText }}</div>
      <div v-if="exercise.hint" class="q-hint">{{ exercise.hint }}</div>
      <div class="q-opts">
        <button v-for="(option, index) in choiceOptions" :key="index" class="opt" :class="optionClass(index)" @click="choose(index)">
          {{ option }}
        </button>
      </div>
    </template>

    <!-- вписать слово -->
    <template v-else-if="exercise.type === 'input'">
      <div class="q-text">
        {{ number }}. {{ inputParts[0] }}<input
          v-model="typed" class="gap-input" :class="answered ? (result!.correct ? 'ok' : 'bad') : ''" :disabled="answered"
          type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" @keydown.enter="checkInput"
        />{{ inputParts[1] }}
      </div>
      <div v-if="exercise.hint" class="q-hint">{{ exercise.hint }}</div>
      <button v-if="!answered" class="small check" @click="checkInput">Проверить</button>
    </template>

    <!-- собрать предложение -->
    <template v-else>
      <div class="q-text">{{ number }}. {{ questionText }}</div>
      <div class="order-built" :class="answered ? (result!.correct ? 'ok' : 'bad') : ''">
        <span v-if="!chosenTokens.length" class="muted">нажимайте на слова по порядку…</span>
        <button v-for="(token, position) in chosenTokens" :key="token.id" class="tok in" @click="returnToken(position)">{{ token.text }}</button>
      </div>
      <div class="order-bank">
        <button v-for="token in bankTokens" :key="token.id" class="tok" @click="pickToken(token)">{{ token.text }}</button>
      </div>
      <button v-if="!answered" class="small check" @click="checkOrder">Проверить</button>
    </template>

    <div v-if="answered" class="q-explain">
      {{ result!.correct ? "✓ Верно. " : "✗ Правильно: " + result!.correctText + ". " }}{{ exercise.explain ?? "" }}
    </div>
  </div>
</template>
