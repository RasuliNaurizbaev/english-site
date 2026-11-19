<!-- Словарь по уровням: поиск, фильтр по статусу; в фильтрах «Новые / Учу / Выучено» — кнопки смены статуса. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import type { Level } from "@/domain/types";
import type { WordStatus } from "@/domain/spacedRepetition";
import SegmentedControl from "../components/SegmentedControl.vue";
import SpeakButton from "../components/SpeakButton.vue";

breakIfRequested("wordsPage");
const props = defineProps<{ level?: string }>();
const { content, review, progress } = useServices();

const PAGE_SIZE = 100;  // показываем по 100 слов: «Ещё 100 →» заменяет текущую сотню следующей
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
// ---------- страницы по 100 слов ----------
const page = ref(0);
const pageCount = computed(() => Math.max(1, Math.ceil(matching.value.length / PAGE_SIZE)));
const shown = computed(() => matching.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE));
const rangeText = computed(() => {
  if (!matching.value.length) return "Ничего не найдено";
  const from = page.value * PAGE_SIZE + 1;
  return `Слова ${from}–${from + shown.value.length - 1} из ${matching.value.length}`;
});
// новый поиск, фильтр или уровень — снова с первой сотни
watch([query, filter, level], () => { page.value = 0; });
// слово сменило статус и ушло из фильтра — страниц могло стать меньше
watch(pageCount, count => { if (page.value > count - 1) page.value = count - 1; });

const listTop = ref<HTMLElement | null>(null);
function goToPage(next: number) {
  page.value = Math.min(Math.max(next, 0), pageCount.value - 1);
  listTop.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}
const levelStats = computed(() => { void version.value; return content.levels.map(l => ({ level: l, ...review.levelStats(l) })); });
const due = computed(() => { void version.value; return review.dueWordKeys().length; });
const fresh = computed(() => { void version.value; return review.newWordKeys(review.newWordsLeftToday()).length; });

const lastChange = ref("");
function setStatus(word: { key: string; en: string }, status: "learning" | "learned") {
  if (status === "learning") review.markLearning(word.key);
  else review.markLearned(word.key);
  lastChange.value = `✓ «${word.en}» → ${STATUS_LABEL[status]}` + (status === "learning" ? " (уже в повторении на сегодня)" : "");
  version.value++;
}
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
  <p ref="listTop" class="muted words-range">{{ rangeText }}</p>
  <p v-if="lastChange" class="words-change">{{ lastChange }}</p>
  <ul class="word-list">
    <li v-for="w in shown" :key="w.key" :class="'st-' + w.status">
      <span class="speak-cell"><SpeakButton :text="w.en" /></span>
      <span class="en">{{ w.en }}</span>
      <span class="ru">{{ w.ru }}</span>
      <span class="word-status">
        <span v-if="filter === 'all'" class="st">{{ STATUS_LABEL[w.status] }}</span>
        <template v-else>
          <button v-if="w.status !== 'learning'" class="st-btn to-learning" title="Учить: слово появится в повторении сегодня" @click="setStatus(w, 'learning')">учу</button>
          <button v-if="w.status !== 'learned'" class="st-btn to-learned" title="Уже знаю: следующий показ через 60 дней" @click="setStatus(w, 'learned')">выучено</button>
        </template>
      </span>
    </li>
  </ul>
  <div v-if="pageCount > 1" class="pager">
    <button class="small" :disabled="page === 0" @click="goToPage(page - 1)">← Назад</button>
    <span class="muted">{{ page + 1 }} / {{ pageCount }}</span>
    <button class="small primary-small" :disabled="page >= pageCount - 1" @click="goToPage(page + 1)">Ещё 100 →</button>
  </div>
  <p class="muted small-note">
    Статус меняется в фильтрах «Новые», «Учу», «Выучено»: «учу» — слово попадёт в повторение уже сегодня,
    «выучено» — следующий показ через 60 дней.
  </p>
</template>
