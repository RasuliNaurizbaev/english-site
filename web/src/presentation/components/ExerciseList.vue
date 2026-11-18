<!--
  Блок упражнений со счётом.
  @item-answered(номер, верно ли) — после каждого ответа;  @complete(доля правильных 0..1) — когда отвечены все.
-->
<script setup lang="ts">
import { ref } from "vue";
import type { Exercise } from "@/domain/types";
import { breakIfRequested } from "../problems";
import ExerciseItem from "./ExerciseItem.vue";

breakIfRequested("exercises");
const props = defineProps<{ title?: string; exercises: Exercise[] }>();
const emit = defineEmits<{ complete: [score: number]; itemAnswered: [index: number, isCorrect: boolean] }>();

const answered = ref(0);
const correct = ref(0);

function onAnswered(index: number, isCorrect: boolean) {
  emit("itemAnswered", index, isCorrect);
  answered.value++;
  if (isCorrect) correct.value++;
  if (answered.value === props.exercises.length) emit("complete", correct.value / props.exercises.length);
}
</script>

<template>
  <div class="task-box">
    <h3 v-if="title">{{ title }}</h3>
    <ExerciseItem v-for="(exercise, index) in exercises" :key="index" :exercise="exercise" :number="index + 1" @answered="onAnswered(index, $event)" />
    <div class="task-score">
      <template v-if="answered">Правильно: {{ correct }} из {{ answered }}{{ answered === exercises.length ? " — готово!" : "" }}</template>
    </div>
  </div>
</template>
