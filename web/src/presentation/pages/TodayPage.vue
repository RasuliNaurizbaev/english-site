<!-- «Сегодня»: план на день, серия дней, прогресс по словам, настройки новых слов. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import { audioPlan, grammarPlan, storyPlan, wordsPlan, type PlanItem } from "@/application/todayPlan";
import { plural } from "@/domain/text";
import type { Level } from "@/domain/types";
import PlanCard from "../components/PlanCard.vue";
import SafeSection from "../components/SafeSection.vue";
import SegmentedControl from "../components/SegmentedControl.vue";

breakIfRequested("todayPage");
const services = useServices();
const { content, progress, review } = services;
const today = services.today();
const version = ref(0);                          // меняется после настроек → пересчитать план

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const WEEKDAYS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const now = new Date();
const dateTitle = `${now.getDate()} ${MONTHS[now.getMonth()]}, ${WEEKDAYS_FULL[now.getDay()]}`;
const streak = progress.streak();

/** Последние 7 дней: были ли занятия. */
const week = Array.from({ length: 7 }, (_, k) => {
  const day = today - (6 - k);
  const weekday = new Date(day * 86_400_000 + now.getTimezoneOffset() * 60_000).getDay();
  return { label: WEEKDAYS[weekday], active: Boolean(progress.activityOfDay(day)), isToday: k === 6 };
});

/** План: каждая карточка строится отдельно — если одна упадёт, остальные покажутся. */
const plan = computed(() => {
  void version.value;
  const builders: [string, () => PlanItem | null][] = [
    ["Слова", () => wordsPlan(services, today)], ["Рассказ", () => storyPlan(services, today)],
    ["Грамматика", () => grammarPlan(services, today)], ["Аудио", () => audioPlan(services, today)],
  ];
  return builders.map(([title, build]) => {
    try {
      breakIfRequested("plan:" + title);
      return { title, item: build(), failed: false };
    } catch (error) {
      console.error(error);
      return { title, item: null, failed: true };
    }
  });
});

const stats = computed(() => { void version.value; return content.levels.map(level => ({ level, ...review.levelStats(level) })); });

// ---------- настройки новых слов ----------
const newPerDay = ref(progress.wordSettings().newPerDay);
const chosenLevels = ref<Level[]>(progress.wordSettings().levels);
function saveNewPerDay(value: number) { newPerDay.value = value; progress.updateWordSettings({ newPerDay: value }); version.value++; }
function toggleLevel(level: Level) {
  const next = chosenLevels.value.includes(level) ? chosenLevels.value.filter(l => l !== level) : [...chosenLevels.value, level];
  if (!next.length) return;                       // хотя бы один уровень
  chosenLevels.value = content.levels.filter(l => next.includes(l));
  progress.updateWordSettings({ levels: chosenLevels.value });
  version.value++;
}
const perDayOptions: [number, string][] = [5, 10, 15, 20, 30].map(n => [n, String(n)]);
</script>

<template>
  <div class="today-head">
    <h1 class="today-title">{{ dateTitle }}</h1>
    <div class="streak">🔥 {{ streak }} {{ plural(streak, "день", "дня", "дней") }} подряд</div>
  </div>

  <div class="week">
    <div v-for="(day, i) in week" :key="i" class="day" :class="{ on: day.active, now: day.isToday }"><i /><span>{{ day.label }}</span></div>
  </div>

  <div class="plan">
    <template v-for="card in plan" :key="card.title">
      <div v-if="card.failed" class="error-box">⚠ {{ card.title }} — временно не работает.</div>
      <SafeSection v-else-if="card.item" :title="'План: ' + card.title"><PlanCard :item="card.item" /></SafeSection>
    </template>
  </div>

  <SafeSection title="Прогресс по словам">
    <h3 class="section-title">Прогресс по словам</h3>
    <div class="stats">
      <div v-for="s in stats" :key="s.level" class="stat" :class="s.level">
        <b>{{ s.level }}</b>
        <span>{{ s.learned }} выучено</span>
        <span class="muted">{{ s.learning }} в процессе · {{ s.total }} всего</span>
        <div class="progress small">
          <i class="mature" :style="{ width: (s.learned / s.total) * 100 + '%' }" />
          <i class="learning" :style="{ width: (s.learning / s.total) * 100 + '%' }" />
        </div>
      </div>
    </div>
  </SafeSection>

  <SafeSection title="Настройки">
    <div class="settings">
      <span class="muted">Новых слов в день:</span>
      <SegmentedControl :model-value="newPerDay" :options="perDayOptions" small @update:model-value="saveNewPerDay" />
      <span class="muted">Уровни новых слов:</span>
      <div class="segmented small">
        <button v-for="level in content.levels" :key="level" :class="{ active: chosenLevels.includes(level) }" @click="toggleLevel(level)">{{ level }}</button>
      </div>
    </div>
    <p class="muted small-note">Новые слова берутся по порядку: сначала A1, потом A2, потом B1. Если слово уже знакомо, нажмите «Я это уже знаю» — оно не будет считаться новым.</p>
  </SafeSection>
</template>
