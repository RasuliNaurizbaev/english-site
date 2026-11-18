<!-- Прохождение теста: разделы по очереди (грамматика, лексика, чтение, аудирование) и итоговый уровень. -->
<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useServices } from "../composables/useServices";
import { useBrowserReader, browserVoiceSupported } from "../composables/useBrowserReader";
import { breakIfRequested } from "../problems";
import { allExercises, levelForScore } from "@/domain/testValidation";
import SafeSection from "../components/SafeSection.vue";
import ExerciseList from "../components/ExerciseList.vue";
import NotFoundPage from "./NotFoundPage.vue";

breakIfRequested("testRunPage");
const props = defineProps<{ id: string }>();
const { content, progress, aiTests } = useServices();
const test = content.test(props.id) ?? aiTests.generatedTests().find(t => t.id === props.id);
const reader = useBrowserReader();

const correctBySection = reactive<Record<number, number>>({});
const result = ref<null | { percent: number; level: string }>(null);
const total = computed(() => (test ? allExercises(test).length : 0));
const answeredSections = computed(() => Object.keys(correctBySection).length);

/** Аудирование: голос браузера читает текст по строкам (в диалогах — без имён). */
function listen(script: string) {
  const lines = script.split("\n").map(line => line.replace(/^[A-Z][a-zA-Z ]{0,20}:\s*/, "").trim()).filter(Boolean);
  reader.start(lines, 0, () => {});
}

function onSectionComplete(index: number, share: number, count: number) {
  if (!test) return;
  correctBySection[index] = Math.round(share * count);
  if (answeredSections.value === test.sections.length) {
    const correct = Object.values(correctBySection).reduce((a, b) => a + b, 0);
    const percent = Math.round(correct / total.value * 100);
    const level = levelForScore(test, percent);
    result.value = { percent, level };
    progress.saveTestResult({ testId: test.id, title: test.titleRu || test.title, score: percent, level });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }
}
</script>

<template>
  <NotFoundPage v-if="!test" />
  <template v-else>
    <RouterLink class="back" to="/tests">← Все тесты</RouterLink>
    <h1 class="story-title">{{ test.titleRu || test.title }}</h1>
    <p class="intro">{{ test.description }} {{ total }} вопросов · ~{{ test.minutes }} минут.</p>

    <section v-for="(section, index) in test.sections" :key="index" class="tasks">
      <h2 class="tasks-title">{{ index + 1 }}. {{ section.title }}</h2>

      <div v-if="section.kind === 'reading' && section.text" class="task-box reading-text">
        <p v-for="(paragraph, p) in section.text.split(/\n\n+/)" :key="p">{{ paragraph }}</p>
      </div>
      <div v-if="section.kind === 'listening' && section.script" class="task-box">
        <p class="muted">Прослушайте запись (можно 2 раза), затем ответьте на вопросы. Текст скрыт — как на экзамене.</p>
        <div class="voice-controls">
          <button v-if="browserVoiceSupported" class="small primary-small" @click="listen(section.script)">▶ Слушать</button>
          <button v-if="browserVoiceSupported" class="small" @click="reader.stop()">■</button>
          <details class="muted"><summary>Показать текст</summary><p class="script-text">{{ section.script }}</p></details>
        </div>
      </div>

      <SafeSection :title="section.title">
        <ExerciseList :exercises="section.exercises" @complete="onSectionComplete(index, $event, section.exercises.length)" />
      </SafeSection>
    </section>

    <div class="task-finish">
      <div v-if="result" class="flashcard done">
        <div class="fc-main">{{ result.percent }}%</div>
        <div class="fc-sub">Ваш уровень по этому тесту: <b>{{ result.level }}</b></div>
      </div>
      <p v-else class="muted">Ответьте на все вопросы ({{ answeredSections }} из {{ test.sections.length }} разделов готово) — появится итог.</p>
    </div>
  </template>
</template>
