<!-- Блок упражнений со счётом. Когда отвечены все — @complete(доля правильных от 0 до 1). -->
<script setup lang="ts">
import { ref } from "vue";
import type { Exercise } from "@/domain/types";
import { breakIfRequested } from "../problems";
import ExerciseItem from "./ExerciseItem.vue";

breakIfRequested("exercises");
const props = defineProps<{ title?: string; exercises: Exercise[] }>();
const emit = defineEmits<{ complete: [score: number] }>();

const answered = ref(0);
const correct = ref(0);

function onAnswered(isCorrect: boolean) {
  answered.value++;
  if (isCorrect) correct.value++;
  if (answered.value === props.exercises.length) emit("complete", correct.value / props.exercises.length);
}
</script>

<template>
  <div class="task-box">
    <h3 v-if="title">{{ title }}</h3>
    <ExerciseItem v-for="(exercise, index) in exercises" :key="index" :exercise="exercise" :number="index + 1" @answered="onAnswered" />
    <div class="task-score">
      <template v-if="answered">Правильно: {{ correct }} из {{ answered }}{{ answered === exercises.length ? " — готово!" : "" }}</template>
    </div>
  </div>
</template>
