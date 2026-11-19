<!--
  «Мои ошибки»: упражнения грамматики, где была ошибка, повторяются через 1 → 3 → 7 → 14 дней.
  Четыре верных ответа подряд — ошибка исправлена и исчезает из списка.
-->
<script setup lang="ts">
import { ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import ExerciseItem from "../components/ExerciseItem.vue";

breakIfRequested("mistakesPage");
const { mistakes } = useServices();
const due = ref(mistakes.due());
const total = mistakes.total();
const answered = ref(0);
const correct = ref(0);

function onAnswered(key: string, isCorrect: boolean) {
  mistakes.review(key, isCorrect);
  answered.value++;
  if (isCorrect) correct.value++;
}
</script>

<template>
  <RouterLink class="back" to="/practice">← Практика</RouterLink>
  <h1 class="story-title">Мои ошибки</h1>
  <p class="intro">
    Сюда попадают упражнения грамматики, в которых вы ошиблись. Они возвращаются через 1, 3, 7 и 14 дней;
    после четырёх верных ответов подряд ошибка считается исправленной.
  </p>
  <div v-if="!due.length" class="flashcard done">
    <div class="fc-main">{{ total ? "✓" : "🎉" }}</div>
    <div class="fc-sub">{{ total ? `Сегодня повторять нечего. В списке ещё ${total} — они вернутся позже.` : "Ошибок нет. Делайте упражнения в «Грамматике» — ошибки появятся здесь сами." }}</div>
  </div>
  <div v-else class="task-box">
    <h3>На сегодня: {{ due.length }}</h3>
    <div v-for="(item, index) in due" :key="item.key">
      <RouterLink class="muted mistake-topic" :to="'/grammar/' + item.topic.id">{{ item.topic.level }} · {{ item.topic.title }}</RouterLink>
      <ExerciseItem :exercise="item.exercise" :number="index + 1" @answered="onAnswered(item.key, $event)" />
    </div>
    <div v-if="answered" class="task-score">Правильно: {{ correct }} из {{ answered }}</div>
  </div>
</template>
