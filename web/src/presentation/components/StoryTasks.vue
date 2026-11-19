<!-- Задания к рассказу: вопросы, «вставьте слово», пересказ. Результат сохраняется, когда отвечены все. -->
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { Story } from "@/domain/types";
import { buildGapExercises } from "@/domain/storyTasks";
import { breakIfRequested, reportProblem } from "../problems";
import { useServices } from "../composables/useServices";
import ExerciseList from "./ExerciseList.vue";
import SafeSection from "./SafeSection.vue";

const props = defineProps<{ story: Story }>();
const { progress, content } = useServices();

const questions = computed(() => props.story.questions?.questions ?? []);
const retell = computed(() => props.story.questions?.retell ?? []);

// «вставьте слово» строится автоматически; если не получилось — просто без этого задания
const gaps = computed(() => {
  try {
    breakIfRequested("storyTasks");
    return buildGapExercises(props.story, 8);
  } catch (error) {
    reportProblem("задание «вставьте слово»", error);
    return [];
  }
});
const hasGaps = computed(() => gaps.value.length >= 3);

const scores = reactive<{ questions?: number; gaps?: number }>({});
const finalScore = ref<number | null>(null);
const previous = progress.storyResults()[props.story.id];
const nextStory = content.nextStoryAfter(props.story);

function onComplete(part: "questions" | "gaps", score: number) {
  scores[part] = score;
  const needed = (questions.value.length ? 1 : 0) + (hasGaps.value ? 1 : 0);
  if (Object.keys(scores).length === needed) finish();
}

function finish() {
  const values = Object.values(scores) as number[];
  const score = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) : 100;
  progress.saveStoryResult(props.story.id, score);
  finalScore.value = score;
}
</script>

<template>
  <section class="tasks">
    <h2 class="tasks-title">Задания</h2>

    <SafeSection v-if="questions.length" title="Вопросы по тексту">
      <ExerciseList title="1. Вопросы по тексту" :exercises="questions" @complete="onComplete('questions', $event)" />
    </SafeSection>

    <SafeSection v-if="hasGaps" title="Вставьте пропущенное слово">
      <ExerciseList :title="(questions.length ? 2 : 1) + '. Вставьте пропущенное слово'" :exercises="gaps" @complete="onComplete('gaps', $event)" />
    </SafeSection>

    <div class="task-box">
      <h3>{{ 1 + (questions.length ? 1 : 0) + (hasGaps ? 1 : 0) }}. Перескажите вслух</h3>
      <p class="muted">Расскажите историю своими словами за 1–2 минуты, используя вопросы как план. Говорите вслух — это лучшая тренировка речи.</p>
      <ol v-if="retell.length" class="retell"><li v-for="(item, i) in retell" :key="i">{{ item }}</li></ol>
    </div>

    <div class="task-finish">
      <template v-if="finalScore !== null">
        <p class="done-line">✓ Рассказ пройден! Результат: {{ finalScore }}%</p>
        <RouterLink v-if="nextStory" class="primary" :to="'/story/' + nextStory.id">Следующий рассказ →</RouterLink>
        <RouterLink class="primary ghostbtn" to="/">На главную</RouterLink>
      </template>
      <template v-else>
        <p v-if="previous" class="done-line">✓ Пройдено, результат {{ previous.score }}%</p>
        <button class="primary" @click="finish">Отметить рассказ пройденным</button>
      </template>
    </div>
  </section>
</template>
