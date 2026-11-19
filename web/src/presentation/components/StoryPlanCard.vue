<!-- Карточка «Рассказ» на «Сегодня»: выбор уровня → случайный рассказ; повторное нажатие — другой рассказ. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { pickStory, storyPlan, todayStoryPick } from "@/application/todayPlan";
import { STORY_LEVELS } from "@/domain/storyLevel";
import type { Level } from "@/domain/types";

const services = useServices();
const today = services.today();
const version = ref(0);                      // меняется после выбора → пересчитать карточку

const item = computed(() => { void version.value; return storyPlan(services, today); });
const pick = computed(() => { void version.value; return todayStoryPick(services, today); });

function choose(level: Level) {
  pickStory(services, today, level);
  version.value++;
}
</script>

<template>
  <div class="plan-card story-plan" :class="{ done: item.done }">
    <div class="plan-icon">{{ item.done ? "✓" : item.icon }}</div>
    <div class="plan-body">
      <div class="plan-title">{{ item.title }}</div>
      <div class="plan-text">{{ item.text }}</div>
      <div class="story-levels">
        <button v-for="level in STORY_LEVELS" :key="level" class="small level-pick" :class="[level, { active: pick?.level === level }]"
                :title="pick?.level === level ? 'Другой случайный рассказ ' + level : 'Случайный рассказ ' + level" @click="choose(level)">
          {{ pick?.level === level ? "🎲 " : "" }}{{ level }}
        </button>
      </div>
      <div class="plan-sub">{{ pick ? "Нажмите уровень ещё раз — другой рассказ · " : "" }}{{ item.note }}</div>
    </div>
    <RouterLink v-if="pick" :to="item.link" class="plan-btn">{{ item.action }}</RouterLink>
  </div>
</template>
