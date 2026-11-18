<!-- Список рассказов -->
<script setup lang="ts">
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import { plural } from "@/domain/text";
import type { Story } from "@/domain/types";

breakIfRequested("storiesPage");
const { content, progress } = useServices();
const stories = content.stories();
const results = progress.storyResults();

function levelCounts(story: Story) {
  const counts: Record<string, number> = {};
  story.words.forEach(w => { counts[w.level] = (counts[w.level] ?? 0) + 1; });
  return Object.entries(counts).sort();
}
const voices = (n: number) => `🔊 ${n} ${plural(n, "голос", "голоса", "голосов")}`;
</script>

<template>
  <p class="intro">
    {{ stories.length ? "Читайте, слушайте и отвечайте на вопросы. Нажмите на подсвеченное слово, чтобы увидеть перевод." : "Рассказов пока нет." }}
  </p>
  <div class="cards">
    <RouterLink v-for="(story, index) in stories" :key="story.id" :to="'/story/' + story.id" class="card" :class="{ 'card-done': results[story.id] }">
      <h2>
        {{ index + 1 }}. {{ story.title }}
        <span v-if="results[story.id]" class="badge done-badge">✓ {{ results[story.id].score }}%</span>
      </h2>
      <p>{{ story.paragraphs[0].join(" ").slice(0, 140) }}…</p>
      <div class="meta">
        <span v-for="[level, n] in levelCounts(story)" :key="level" class="badge" :class="level">{{ level }} · {{ n }}</span>
        <span class="badge plain">{{ story.wordCount }} слов</span>
        <span v-if="story.audio.length" class="badge plain">{{ voices(story.audio.length) }}</span>
        <span v-if="story.questions" class="badge plain">❓ вопросы</span>
      </div>
    </RouterLink>
  </div>
</template>
