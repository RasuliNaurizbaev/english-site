<!-- Словарь по уровням: поиск, фильтр по статусу, отметка «уже знаю». -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import type { Level } from "@/domain/types";
import type { WordStatus } from "@/domain/spacedRepetition";
import SegmentedControl from "../components/SegmentedControl.vue";
import SpeakButton from "../components/SpeakButton.vue";

breakIfRequested("wordsPage");
const props = defineProps<{ level?: string }>();
const { content, review, progress } = useServices();

const MAX_ROWS = 400;   // без поиска не больше 400 строк — так страница не тормозит
const STATUS_LABEL: Record<WordStatus, string> = { new: "новое", learning: "учу", learned: "выучено" };

const level = computed<Level>(() => {
  const wanted = (props.level ?? progress.setting("wlevel", content.levels[0])) as Level;
  const chosen = content.levels.includes(wanted) ? wanted : content.levels[0];
  progress.saveSetting("wlevel", chosen);
  return chosen;
});

const version = ref(0);               // меняется после «уже знаю» → перерисовать статусы
const query = ref("");
const filter = ref<"all" | WordStatus>("all");
const filterOptions: ["all" | WordStatus, string][] = [["all", "Все"], ["new", "Новые"], ["learning", "Учу"], ["learned", "Выучено"]];

const matching = computed(() => {
  void version.value;
  const q = query.value.trim().toLowerCase();
  return content.wordsOfLevel(level.value)
    .map(([en, ru]) => ({ en, ru, key: level.value + "|" + en, status: review.status(level.value + "|" + en) }))
    .filter(w => (filter.value === "all" || w.status === filter.value) && (!q || w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q)));
});
const shown = computed(() => matching.value.slice(0, MAX_ROWS));
const levelStats = computed(() => { void version.value; return content.levels.map(l => ({ level: l, ...review.levelStats(l) })); });
const due = review.dueWordKeys().length;
const fresh = review.newWordKeys(review.newWordsLeftToday()).length;

function toggle(key: string) { review.toggleKnown(key); version.value++; }
</script>

<template>
  <RouterLink to="/review" class="plan-card compact">
    <div class="plan-icon">🔁</div>
    <div class="plan-body"><div class="plan-title">Повторение на сегодня</div><div class="plan-text">К повторению: {{ due }} · новых: {{ fresh }}</div></div>
    <span class="plan-btn">Начать</span>
  </RouterLink>

  <div class="levels">
    <RouterLink v-for="s in levelStats" :key="s.level" :to="'/words/' + s.level" class="level-chip" :class="[s.level, { active: s.level === level }]">
      <b>{{ s.level }}</b><span>{{ s.learned }} / {{ s.total }}</span>
      <i class="chip-bar" :style="{ width: (s.learned / s.total) * 100 + '%' }" />
    </RouterLink>
  </div>

  <input v-model="query" class="search" type="search" placeholder="Поиск по английскому или русскому…">
  <SegmentedControl v-model="filter" :options="filterOptions" small />
  <p class="muted">Показано: {{ shown.length }}{{ matching.length > shown.length ? ` из ${matching.length} (используйте поиск)` : "" }}</p>
  <ul class="word-list">
    <li v-for="w in shown" :key="w.key" :class="'st-' + w.status">
      <span class="en">{{ w.en }}</span>
      <span class="ru">{{ w.ru }}</span>
      <button class="st" :title="w.status === 'new' ? 'Отметить как уже знакомое' : 'Вернуть в новые'" @click="toggle(w.key)">{{ STATUS_LABEL[w.status] }}</button>
      <SpeakButton :text="w.en" />
    </li>
  </ul>
  <p class="muted small-note">Нажмите на «новое», если слово уже знакомо, — оно не будет показываться как новое.</p>
</template>
