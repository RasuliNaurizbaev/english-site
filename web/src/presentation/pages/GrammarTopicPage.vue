<!-- Тема грамматики: теория и упражнения — независимые части (если одна сломается, другая работает). -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import { PASS_SCORE } from "@/data/progressRepository";
import SafeSection from "../components/SafeSection.vue";
import MarkdownView from "../components/MarkdownView.vue";
import ExerciseList from "../components/ExerciseList.vue";
import NotFoundPage from "./NotFoundPage.vue";

breakIfRequested("grammarPages");
const props = defineProps<{ id: string }>();
const { content, progress, mistakes } = useServices();
const topic = computed(() => content.grammarTopic(props.id));
const next = computed(() => (topic.value ? content.nextGrammarTopicAfter(topic.value) : undefined));

const attempt = ref(0);                         // «Пройти заново» — новая попытка
const previous = ref(topic.value ? progress.grammarResults()[topic.value.id] : undefined);
const score = ref<number | null>(null);

function onComplete(share: number) {
  if (!topic.value) return;
  score.value = Math.round(share * 100);
  previous.value = progress.saveGrammarResult(topic.value.id, score.value);
}
/** Ошибка в упражнении → в «Мои ошибки» (повторится через 1, 3, 7, 14 дней). */
function onItemAnswered(index: number, correct: boolean) {
  if (topic.value) mistakes.recordAnswer(topic.value.id, index, correct);
}
function retry() {
  score.value = null;
  attempt.value++;
  window.scrollTo({ top: 0 });
}
</script>

<template>
  <NotFoundPage v-if="!topic" />
  <template v-else>
    <RouterLink class="back" to="/grammar">← Все темы</RouterLink>
    <h1 class="story-title">{{ topic.title }}</h1>
    <div class="legend"><span class="badge" :class="topic.level">{{ topic.level }}</span> {{ topic.titleRu }}</div>
    <p v-if="topic.summary" class="g-summary">{{ topic.summary }}</p>

    <SafeSection title="Объяснение темы">
      <MarkdownView :source="topic.theory" />
    </SafeSection>

    <section class="tasks">
      <h2 class="tasks-title">Упражнения ({{ topic.exercises.length }})</h2>
      <SafeSection title="Упражнения">
        <ExerciseList :key="topic.id + attempt" :exercises="topic.exercises" @complete="onComplete" @item-answered="onItemAnswered" />
      </SafeSection>

      <div class="task-finish">
        <template v-if="score !== null">
          <p class="done-line">
            {{ score >= PASS_SCORE ? `✓ Отлично! ${score}% — тема изучена.` : `Результат: ${score}% — нужно ${PASS_SCORE}%, чтобы тема считалась изученной. Перечитайте объяснение и попробуйте ещё раз.` }}
          </p>
          <button class="primary ghostbtn" @click="retry">Пройти заново</button>
          <RouterLink v-if="next" class="primary" :to="'/grammar/' + next.id">Следующая тема →</RouterLink>
        </template>
        <p v-else-if="previous" class="done-line">{{ previous.done ? "✓ Тема изучена. " : "" }}Лучший результат: {{ previous.best }}%</p>
      </div>
    </section>
  </template>
</template>
