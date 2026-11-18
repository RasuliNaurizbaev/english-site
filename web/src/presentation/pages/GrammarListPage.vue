<!-- Список тем грамматики по уровням A1 → A2 → B1 -->
<script setup lang="ts">
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import { PASS_SCORE } from "@/data/progressRepository";

breakIfRequested("grammarPages");
const { content, progress } = useServices();
const topics = content.grammarTopics();
const results = progress.grammarResults();
const learned = topics.filter(t => results[t.id]?.done).length;
const levels = content.levels
  .map(level => ({ level, topics: content.grammarTopicsOfLevel(level) }))
  .filter(group => group.topics.length);
</script>

<template>
  <p v-if="!topics.length" class="intro">Тем пока нет.</p>
  <template v-else>
    <p class="intro">
      Темы идут по порядку: A1 → A2 → B1. В каждой теме — подробное объяснение, примеры, типичные ошибки и упражнения.
      Тема считается изученной, если в упражнениях {{ PASS_SCORE }}% и больше. Изучено: {{ learned }} из {{ topics.length }}.
    </p>
    <template v-for="group in levels" :key="group.level">
      <h3 class="section-title">
        <span class="badge" :class="group.level">{{ group.level }}</span> Уровень {{ group.level }}
        <span class="muted">· {{ group.topics.filter(t => results[t.id]?.done).length }} / {{ group.topics.length }}</span>
      </h3>
      <div class="g-list">
        <RouterLink v-for="topic in group.topics" :key="topic.id" :to="'/grammar/' + topic.id" class="g-card" :class="{ done: results[topic.id]?.done }">
          <div class="g-num">{{ results[topic.id]?.done ? "✓" : topic.order }}</div>
          <div class="g-body">
            <div class="g-title">{{ topic.title }}</div>
            <div class="g-ru">{{ topic.titleRu }}</div>
            <div v-if="topic.summary" class="g-sum">{{ topic.summary }}</div>
          </div>
          <span v-if="results[topic.id]" class="g-score">{{ results[topic.id].best }}%</span>
        </RouterLink>
      </div>
    </template>
  </template>
</template>
