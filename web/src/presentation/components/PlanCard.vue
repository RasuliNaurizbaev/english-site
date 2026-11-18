<!-- Карточка плана на день (Сегодня) -->
<script setup lang="ts">
import type { PlanItem } from "@/application/todayPlan";
defineProps<{ item: PlanItem }>();
</script>

<template>
  <RouterLink :to="item.link" class="plan-card" :class="{ done: item.done }">
    <div class="plan-icon">{{ item.done ? "✓" : item.icon }}</div>
    <div class="plan-body">
      <div class="plan-title">{{ item.title }}</div>
      <div class="plan-text">{{ item.text }}</div>
      <div v-if="item.note" class="plan-sub">{{ item.note }}</div>
    </div>
    <span class="plan-btn">{{ item.action }}</span>
  </RouterLink>
</template>
