<!-- Словарь по уровням: поиск, фильтр по статусу; в фильтрах «Новые / Учу / Выучено» — кнопки смены статуса.
     «Мои» — слова, добавленные пользователем, по группам: добавить, исправить, удалить. -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import type { WordLevel } from "@/domain/types";
import { MY_LEVEL, type MyWord } from "@/domain/myWords";
import type { WordStatus } from "@/domain/spacedRepetition";
import SegmentedControl from "../components/SegmentedControl.vue";
import SpeakButton from "../components/SpeakButton.vue";
import MyWordForm from "../components/MyWordForm.vue";
import { useWordPlayer } from "../composables/useWordPlayer";
import { PLAY_MODES, type PlayMode } from "@/domain/wordPlayback";

breakIfRequested("wordsPage");
const props = defineProps<{ level?: string }>();
const { content, review, progress, myWords } = useServices();

const PAGE_SIZE = 100;  // показываем по 100 слов: «Ещё 100 →» заменяет текущую сотню следующей
const STATUS_LABEL: Record<WordStatus, string> = { new: "новое", learning: "учу", learned: "выучено" };

const allLevels: WordLevel[] = [...content.levels, MY_LEVEL];
const level = computed<WordLevel>(() => {
  const wanted = (props.level ?? progress.setting("wlevel", content.levels[0])) as WordLevel;
  const chosen = allLevels.includes(wanted) ? wanted : content.levels[0];
  progress.saveSetting("wlevel", chosen);
  return chosen;
});

const version = ref(0);               // меняется после смены статуса или «Моих слов» → перерисовать список
const isMine = computed(() => level.value === MY_LEVEL);
const query = ref("");
const filter = ref<"all" | WordStatus>("all");
const filterOptions: ["all" | WordStatus, string][] = [["all", "Все"], ["new", "Новые"], ["learning", "Учу"], ["learned", "Выучено"]];

// ---------- «Мои слова»: группы ----------
const myGroup = ref("");              // "" — все группы
const myGroups = computed(() => { void version.value; return myWords.groups(); });
const groupOptions = computed<[string, string][]>(() => [["", "Все группы"], ...myGroups.value.map(g => [g, g] as [string, string])]);
watch(myGroups, groups => { if (myGroup.value && !groups.includes(myGroup.value)) myGroup.value = ""; });

const matching = computed(() => {
  void version.value;
  const q = query.value.trim().toLowerCase();
  const words = content.wordsOfLevel(level.value)
    .map(([en, ru]) => ({ en, ru, key: level.value + "|" + en, status: review.status(level.value + "|" + en), group: isMine.value ? myWords.find(en)?.group ?? "" : "" }))
    .filter(w => (filter.value === "all" || w.status === filter.value) && (!q || w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q)))
    .filter(w => !isMine.value || !myGroup.value || w.group === myGroup.value);
  // «Выучено»: последние изученные — сверху (sort устойчивый: при равном времени — порядок словаря)
  if (filter.value === "learned") {
    const at = new Map(words.map(w => [w.key, review.studiedAt(w.key)]));
    words.sort((a, b) => at.get(b.key)! - at.get(a.key)!);
  }
  return words;
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
watch([query, filter, level, myGroup], () => { page.value = 0; });
// слово сменило статус и ушло из фильтра — страниц могло стать меньше
watch(pageCount, count => { if (page.value > count - 1) page.value = count - 1; });

const listTop = ref<HTMLElement | null>(null);
function goToPage(next: number) {
  page.value = Math.min(Math.max(next, 0), pageCount.value - 1);
  listTop.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}
const levelStats = computed(() => { void version.value; return allLevels.map(l => ({ level: l, ...review.levelStats(l) })); });
const due = computed(() => { void version.value; return review.dueWordKeys().length; });
const fresh = computed(() => { void version.value; return review.newWordKeys(review.newWordsLeftToday()).length; });

const lastChange = ref("");
function setStatus(word: { key: string; en: string }, status: "learning" | "learned") {
  if (status === "learning") review.markLearning(word.key);
  else review.markLearned(word.key);
  lastChange.value = `✓ «${word.en}» → ${STATUS_LABEL[status]}` + (status === "learning" ? " (уже в повторении на сегодня)" : "");
  version.value++;
}

// ---------- «Учу»: слушать слова по кругу, пока не нажат «Стоп» ----------
const player = useWordPlayer();
const playMode = ref<PlayMode>(progress.setting("playMode", "en-ru"));
watch(playMode, mode => progress.saveSetting("playMode", mode));
// играются все слова фильтра (все страницы, с учётом поиска и группы); сменили уровень или фильтр — стоп
watch([level, filter], () => player.stop());
const startPlaying = (random: boolean) => player.play(() => matching.value, random, () => playMode.value);

// ---------- «Мои слова»: исправить / удалить ----------
const editing = ref<MyWord | null>(null);
const confirmDelete = ref("");        // слово, для которого нажали ✕ один раз: второе нажатие — удалить
function startEdit(en: string) { editing.value = myWords.find(en) ?? null; confirmDelete.value = ""; window.scrollTo({ top: 0, behavior: "smooth" }); }
function onSaved(message: string) {
  lastChange.value = message;
  editing.value = null;
  version.value++;
}
function remove(en: string) {
  if (confirmDelete.value !== en) { confirmDelete.value = en; return; }
  myWords.remove(en);
  confirmDelete.value = "";
  if (editing.value?.en === en) editing.value = null;
  lastChange.value = `✓ «${en}» удалено`;
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
      <b>{{ s.level === MY_LEVEL ? "Мои" : s.level }}</b><span>{{ s.learned }} / {{ s.total }}</span>
      <i class="chip-bar" :style="{ width: (s.total ? s.learned / s.total : 0) * 100 + '%' }" />
    </RouterLink>
  </div>

  <template v-if="isMine">
    <h3 class="my-words-title">{{ editing ? "Исправить слово" : "Добавить своё слово" }}</h3>
    <MyWordForm :editing="editing" :group="myGroup" @saved="onSaved" @cancel="editing = null" />
    <SegmentedControl v-if="myGroups.length > 1" v-model="myGroup" :options="groupOptions" small />
  </template>

  <input v-model="query" class="search" type="search" placeholder="Поиск по английскому или русскому…">
  <SegmentedControl v-model="filter" :options="filterOptions" small />
  <p v-if="isMine && !content.wordsOfLevel(MY_LEVEL).length" class="muted">Своих слов пока нет — добавьте первое выше.</p>
  <p v-else ref="listTop" class="muted words-range">{{ rangeText }}<template v-if="filter === 'learned' && matching.length"> · последние изученные — сверху</template></p>
  <div v-if="filter === 'learning' && matching.length && player.supported" class="word-player">
    <div class="word-player-buttons">
      <button class="small" :class="{ 'primary-small': player.playing.value === 'order' }" title="Читать все слова «Учу» по порядку, по кругу" @click="startPlaying(false)">▶ Play</button>
      <button class="small" :class="{ 'primary-small': player.playing.value === 'random' }" title="Читать вперемешку, по кругу" @click="startPlaying(true)">🔀 Random</button>
      <button class="small" :disabled="!player.playing.value" @click="player.stop()">⏹ Stop</button>
    </div>
    <SegmentedControl v-model="playMode" :options="PLAY_MODES" small />
    <p v-if="player.current.value" class="word-player-now">🔊 <b>{{ player.current.value.en }}</b> — {{ player.current.value.ru }}</p>
  </div>
  <p v-if="lastChange" class="words-change">{{ lastChange }}</p>
  <ul class="word-list">
    <li v-for="w in shown" :key="w.key" :class="['st-' + w.status, { mine: isMine, playing: player.current.value?.key === w.key }]">
      <span class="speak-cell"><SpeakButton :text="w.en" /></span>
      <span class="en">{{ w.en }}</span>
      <span class="ru">{{ w.ru }}<small v-if="isMine && !myGroup" class="my-group-tag">{{ w.group }}</small></span>
      <span class="word-status">
        <span v-if="filter === 'all'" class="st">{{ STATUS_LABEL[w.status] }}</span>
        <template v-else>
          <button v-if="w.status !== 'learning'" class="st-btn to-learning" title="Учить: слово появится в повторении сегодня" @click="setStatus(w, 'learning')">учу</button>
          <button v-if="w.status !== 'learned'" class="st-btn to-learned" title="Уже знаю: следующий показ через 60 дней" @click="setStatus(w, 'learned')">выучено</button>
        </template>
        <template v-if="isMine">
          <button class="st-btn my-edit" title="Исправить" @click="startEdit(w.en)">✎</button>
          <button class="st-btn my-delete" :class="{ confirm: confirmDelete === w.en }" :title="confirmDelete === w.en ? 'Нажмите ещё раз — слово и его история удалятся' : 'Удалить'" @click="remove(w.en)">{{ confirmDelete === w.en ? "удалить?" : "✕" }}</button>
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
