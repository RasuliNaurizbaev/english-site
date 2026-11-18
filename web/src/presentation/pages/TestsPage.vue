<!-- Тесты: тест уровня, пробные экзамены B1, тесты от AI и история результатов. -->
<script setup lang="ts">
import { ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import { allExercises } from "@/domain/testValidation";
import type { LevelTest } from "@/domain/types";
import SafeSection from "../components/SafeSection.vue";
import AiSettingsPanel from "../components/AiSettingsPanel.vue";

breakIfRequested("testsPage");
const { content, progress, aiTests } = useServices();
const tests = content.tests();
const generated = ref(aiTests.generatedTests());
const results = progress.testResults().slice().reverse();

const lastResult = (test: LevelTest) => results.find(r => r.testId === test.id);
function removeGenerated(id: string) { aiTests.remove(id); generated.value = aiTests.generatedTests(); }
</script>

<template>
  <RouterLink class="back" to="/practice">← Практика</RouterLink>
  <h1 class="story-title">Тесты</h1>
  <p class="intro">
    Начните с теста уровня, потом раз в 1–2 месяца проходите пробный экзамен B1 — так виден реальный прогресс.
    Раздел «Аудирование» читает голос браузера.
  </p>

  <div class="g-list">
    <RouterLink v-for="test in tests" :key="test.id" :to="'/tests/' + test.id" class="g-card">
      <div class="g-num">{{ test.kind === "placement" ? "🎯" : "📝" }}</div>
      <div class="g-body">
        <div class="g-title">{{ test.titleRu }}</div>
        <div class="g-sum">{{ test.description }} · {{ allExercises(test).length }} вопросов · ~{{ test.minutes }} мин</div>
      </div>
      <span v-if="lastResult(test)" class="g-score">{{ lastResult(test)!.score }}% · {{ lastResult(test)!.level }}</span>
    </RouterLink>
  </div>

  <template v-if="generated.length">
    <h3 class="section-title">Созданные AI</h3>
    <div class="g-list">
      <div v-for="test in generated" :key="test.id" class="g-card">
        <div class="g-num">🤖</div>
        <RouterLink :to="'/tests/' + test.id" class="g-body"><div class="g-title">{{ test.titleRu || test.title }}</div>
          <div class="g-sum">{{ allExercises(test).length }} вопросов</div></RouterLink>
        <button class="small" title="Удалить" @click="removeGenerated(test.id)">✕</button>
      </div>
    </div>
  </template>

  <SafeSection title="Настройки AI">
    <AiSettingsPanel />
  </SafeSection>

  <template v-if="results.length">
    <h3 class="section-title">История</h3>
    <ul class="word-list">
      <li v-for="(r, i) in results.slice(0, 15)" :key="i"><span class="en">{{ r.title }}</span><span class="ru">{{ r.score }}% · уровень {{ r.level }}</span></li>
    </ul>
  </template>
</template>
