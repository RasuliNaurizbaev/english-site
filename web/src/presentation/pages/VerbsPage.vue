<!-- Неправильные глаголы: тренировка (впишите 2-ю и 3-ю формы) и таблица всех глаголов. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import { isCorrectForm, pickVerbsForPractice, type IrregularVerb } from "@/domain/verbs";
import type { Level } from "@/domain/types";
import SegmentedControl from "../components/SegmentedControl.vue";
import SpeakButton from "../components/SpeakButton.vue";

breakIfRequested("verbsPage");
const { content, progress } = useServices();
const allVerbs = content.verbs();

const mode = ref<"practice" | "table">("practice");
const levels = ref<Level[]>(progress.setting("verbLevels", ["A1", "A2"]));
const levelOptions: Level[] = ["A1", "A2", "B1"];
function toggleLevel(level: Level) {
  const next = levels.value.includes(level) ? levels.value.filter(l => l !== level) : [...levels.value, level];
  if (!next.length) return;
  levels.value = next;
  progress.saveSetting("verbLevels", next);
  startSession();
}
const pool = computed(() => allVerbs.filter(v => levels.value.includes(v.level)));

// ---------- тренировка: 10 глаголов, сначала трудные ----------
const session = ref<IrregularVerb[]>([]);
const position = ref(0);
const past = ref("");
const participle = ref("");
const checked = ref<null | { past: boolean; participle: boolean }>(null);
const correctCount = ref(0);
const current = computed(() => session.value[position.value]);

function startSession() {
  session.value = pickVerbsForPractice(pool.value, progress.verbStats(), 10);
  position.value = 0;
  correctCount.value = 0;
  resetAnswer();
}
function resetAnswer() { past.value = ""; participle.value = ""; checked.value = null; }
function check() {
  const verb = current.value;
  if (!verb || checked.value) return;
  checked.value = { past: isCorrectForm(past.value, verb.past), participle: isCorrectForm(participle.value, verb.participle) };
  const correct = checked.value.past && checked.value.participle;
  if (correct) correctCount.value++;
  progress.saveVerbAnswer(verb.base, correct);
}
function next() {
  position.value++;
  resetAnswer();
  if (position.value >= session.value.length) progress.recordActivity("verbs");
}
startSession();

// ---------- таблица ----------
const query = ref("");
const stats = computed(() => { void position.value; return progress.verbStats(); });
const table = computed(() => {
  const q = query.value.trim().toLowerCase();
  return pool.value.filter(v => !q || [v.base, ...v.past, ...v.participle, v.ru].some(x => x.toLowerCase().includes(q)));
});
</script>

<template>
  <RouterLink class="back" to="/practice">← Практика</RouterLink>
  <h1 class="story-title">Неправильные глаголы</h1>
  <p v-if="!allVerbs.length" class="error-box">Список глаголов пока не загружен (content/irregular_verbs.csv → tools/build_site_data.py).</p>
  <template v-else>
    <div class="settings">
      <SegmentedControl v-model="mode" :options="[['practice', 'Тренировка'], ['table', 'Таблица']]" small />
      <div class="segmented small">
        <button v-for="level in levelOptions" :key="level" :class="{ active: levels.includes(level) }" @click="toggleLevel(level)">{{ level }}</button>
      </div>
      <span class="muted">{{ pool.length }} глаголов</span>
    </div>

    <template v-if="mode === 'practice'">
      <template v-if="current">
        <div class="progress"><i :style="{ width: (position / session.length) * 100 + '%' }" /></div>
        <div class="flashcard verb-card">
          <div class="fc-top"><span class="badge" :class="current.level">{{ current.level }}</span><SpeakButton :text="current.base" /></div>
          <div class="fc-main">{{ current.base }}</div>
          <div class="fc-sub">{{ current.ru }}</div>
        </div>
        <div class="verb-inputs">
          <label>Past Simple (2-я форма)
            <input v-model="past" class="search" :class="checked ? (checked.past ? 'ok' : 'bad') : ''" :disabled="!!checked" autocapitalize="off" autocomplete="off" spellcheck="false" @keydown.enter="check">
          </label>
          <label>Past Participle (3-я форма)
            <input v-model="participle" class="search" :class="checked ? (checked.participle ? 'ok' : 'bad') : ''" :disabled="!!checked" autocapitalize="off" autocomplete="off" spellcheck="false" @keydown.enter="checked ? next() : check()">
          </label>
        </div>
        <button v-if="!checked" class="primary" @click="check">Проверить</button>
        <template v-else>
          <div class="q-explain">{{ checked.past && checked.participle ? "✓ Верно: " : "✗ Правильно: " }}<b>{{ current.base }} — {{ current.past.join(" / ") }} — {{ current.participle.join(" / ") }}</b></div>
          <button class="primary" @click="next">Дальше →</button>
        </template>
      </template>
      <template v-else>
        <div class="flashcard done"><div class="fc-main">{{ correctCount }} / {{ session.length }}</div><div class="fc-sub">Тренировка завершена</div></div>
        <button class="primary" @click="startSession">Ещё 10 глаголов</button>
      </template>
    </template>

    <template v-else>
      <input v-model="query" class="search" type="search" placeholder="Поиск: go, went, идти…">
      <div class="table-wrap">
        <table class="verbs-table">
          <tr><th>Глагол</th><th>Past</th><th>Participle</th><th>Перевод</th><th>✓/✗</th></tr>
          <tr v-for="v in table" :key="v.base">
            <td><b>{{ v.base }}</b></td><td>{{ v.past.join(" / ") }}</td><td>{{ v.participle.join(" / ") }}</td><td class="muted">{{ v.ru }}</td>
            <td class="muted">{{ stats[v.base] ? stats[v.base].right + "/" + stats[v.base].wrong : "" }}</td>
          </tr>
        </table>
      </div>
    </template>
  </template>
</template>
