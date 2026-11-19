<!-- Практика: тесты, «Мои ошибки», неправильные глаголы, диктант. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";

breakIfRequested("practicePage");
const { content, mistakes, progress } = useServices();
const dueMistakes = mistakes.due().length;
const lastTest = progress.testResults().slice(-1)[0];

// Диктант: по умолчанию — последний рассказ, который вы проходили (или первый)
const results = progress.storyResults();
const stories = content.stories();
const lastStory = [...stories].reverse().find(s => results[s.id]) ?? stories[0];
const storyId = ref(lastStory?.id ?? "");
const dictationLink = computed(() => "/dictation/" + storyId.value);
</script>

<template>
  <div class="plan">
    <RouterLink to="/tests" class="plan-card">
      <div class="plan-icon">🎯</div>
      <div class="plan-body"><div class="plan-title">Тесты</div>
        <div class="plan-text">Тест уровня и пробные экзамены B1{{ lastTest ? ` · последний: ${lastTest.score}% (${lastTest.level})` : "" }}</div></div>
      <span class="plan-btn">Открыть</span>
    </RouterLink>
    <RouterLink to="/mistakes" class="plan-card" :class="{ done: !dueMistakes }">
      <div class="plan-icon">{{ dueMistakes ? "🔁" : "✓" }}</div>
      <div class="plan-body"><div class="plan-title">Мои ошибки</div>
        <div class="plan-text">{{ dueMistakes ? `На сегодня: ${dueMistakes}` : "Сегодня повторять нечего" }} · ошибки из упражнений грамматики</div></div>
      <span class="plan-btn">Повторить</span>
    </RouterLink>
    <RouterLink to="/verbs" class="plan-card">
      <div class="plan-icon">🔤</div>
      <div class="plan-body"><div class="plan-title">Неправильные глаголы</div>
        <div class="plan-text">go → went → gone · {{ content.verbs().length }} глаголов, сначала трудные</div></div>
      <span class="plan-btn">Тренировать</span>
    </RouterLink>
    <div class="plan-card">
      <div class="plan-icon">✍️</div>
      <div class="plan-body"><div class="plan-title">Диктант</div>
        <div class="plan-text">Слушаете предложение из рассказа — пишете его</div>
        <select v-model="storyId" class="dictation-select">
          <option v-for="(s, i) in stories" :key="s.id" :value="s.id">{{ i + 1 }}. {{ s.title }}</option>
        </select></div>
      <RouterLink :to="dictationLink" class="plan-btn">Начать</RouterLink>
    </div>
  </div>
</template>
