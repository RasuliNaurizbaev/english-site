<!-- Повторение слов: карточки с оценками «Снова / Трудно / Хорошо / Легко». -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useServices } from "../composables/useServices";
import { speak } from "../composables/useSpeech";
import { breakIfRequested } from "../problems";
import { plural } from "@/domain/text";
import type { Rating } from "@/domain/spacedRepetition";
import SpeakButton from "../components/SpeakButton.vue";

breakIfRequested("reviewPage");
const { content, review, progress } = useServices();

const queue = ref(review.buildTodayQueue());
const total = ref(queue.value.length);
const finished = ref(0);
const revealed = ref(false);
const direction = ref<"en-ru" | "ru-en">(progress.setting("wdir", "en-ru"));

const item = computed(() => queue.value[0]);
const word = computed(() => (item.value ? content.word(item.value.key) : undefined));
const front = computed(() => (direction.value === "en-ru" ? word.value?.en : word.value?.ru));
const back = computed(() => (direction.value === "en-ru" ? word.value?.ru : word.value?.en));

const RATINGS: { rating: Exclude<Rating, "known">; label: string }[] = [
  { rating: "again", label: "Снова" }, { rating: "hard", label: "Трудно" },
  { rating: "good", label: "Хорошо" }, { rating: "easy", label: "Легко" },
];
function describeInterval(days: number): string {
  if (days < 1) return "сегодня";
  if (days < 30) return days + " " + plural(days, "день", "дня", "дней");
  return Math.round(days / 30) + " мес.";
}
const intervals = computed(() => (item.value ? review.nextIntervals(item.value.key) : null));
const whenLabel = (rating: Rating) => (rating === "again" || !intervals.value ? "сегодня" : describeInterval(intervals.value[rating as "hard" | "good" | "easy"]));

function toggleDirection() {
  direction.value = direction.value === "en-ru" ? "ru-en" : "en-ru";
  progress.saveSetting("wdir", direction.value);
}
function reveal() {
  if (revealed.value || !word.value) return;
  revealed.value = true;
  speak(word.value.en);
}
function answer(rating: Exclude<Rating, "known">) {
  const current = queue.value.shift();
  if (!current) return;
  review.grade(current.key, rating);
  if (rating === "again") queue.value.splice(Math.min(3, queue.value.length), 0, { ...current, isNew: false });   // скоро ещё раз
  else finished.value++;
  revealed.value = false;
}
function alreadyKnown() {
  const current = queue.value.shift();
  if (!current) return;
  review.grade(current.key, "known");
  // вместо знакомого слова — следующее новое (знакомые не тратят лимит)
  const replacement = review.newWordKeys(review.newWordsLeftToday() + 1).find(k => k !== current.key && !queue.value.some(q => q.key === k));
  if (replacement && review.newWordsLeftToday() > 0) queue.value.push({ key: replacement, isNew: true });
  revealed.value = false;
}
function moreWords() {
  progress.updateWordSettings({ newPerDay: progress.wordSettings().newPerDay + 10 });
  queue.value = review.buildTodayQueue();
  total.value = queue.value.length;
  finished.value = 0;
}

function onKey(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.matches("input, textarea")) return;
  if (!revealed.value && (event.code === "Space" || event.key === "Enter")) { event.preventDefault(); reveal(); }
  else if (revealed.value && ["1", "2", "3", "4"].includes(event.key)) answer(RATINGS[Number(event.key) - 1].rating);
}
onMounted(() => document.addEventListener("keydown", onKey));
onUnmounted(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <RouterLink class="back" to="/">← Сегодня</RouterLink>
  <div class="progress"><i :style="{ width: (total ? (finished / total) * 100 : 100) + '%' }" /></div>
  <div class="cards-toolbar">
    <span class="muted">Осталось: {{ queue.length }}</span>
    <button class="small" @click="toggleDirection">{{ direction === "en-ru" ? "EN → RU" : "RU → EN" }}</button>
  </div>

  <template v-if="!item || !word">
    <div class="flashcard done">
      <div class="fc-main">🎉</div>
      <div class="fc-sub">{{ total ? "На сегодня всё! Повторено: " + finished : "Сегодня нечего повторять." }}</div>
    </div>
    <button class="primary" @click="moreWords">Ещё 10 новых слов</button>
    <RouterLink class="primary ghostbtn" to="/">На главную</RouterLink>
  </template>

  <template v-else>
    <div class="flashcard" :class="{ revealed }" @click="reveal">
      <div class="fc-top">
        <span><span class="badge" :class="word.level">{{ word.level }}</span> <span v-if="item.isNew" class="badge plain new">новое</span></span>
        <SpeakButton :text="word.en" />
      </div>
      <div class="fc-main">{{ front }}</div>
      <div v-if="revealed" class="fc-sub">{{ back }}</div>
      <div v-else class="fc-hint">Нажмите, чтобы увидеть перевод</div>
    </div>

    <div v-if="!revealed" class="fc-actions">
      <button class="show" @click="reveal">Показать перевод</button>
      <button v-if="item.isNew" class="skip" @click="alreadyKnown">Я это уже знаю</button>
    </div>
    <div v-else class="fc-actions four">
      <button v-for="r in RATINGS" :key="r.rating" :class="'g-' + r.rating" @click="answer(r.rating)">
        <b>{{ r.label }}</b><small>{{ whenLabel(r.rating) }}</small>
      </button>
    </div>
    <p class="kbd-hint">{{ revealed ? "Клавиши: 1 снова · 2 трудно · 3 хорошо · 4 легко" : "Клавиша: пробел — показать" }}</p>
  </template>
</template>
