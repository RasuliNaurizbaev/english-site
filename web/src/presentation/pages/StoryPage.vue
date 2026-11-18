<!--
  Чтение рассказа. Части страницы независимы (каждая в SafeSection):
    аудио → текст → задания. Если одна упадёт, остальные работают.
  Кто читает вслух:
    1) mp3 с нейроголосом (плеер внизу, караоке);
    2) если mp3 нет, он не загрузился или плеер сломан — голос браузера.
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { useReaderSettings } from "../composables/useReaderSettings";
import { browserVoiceSupported } from "../composables/useBrowserReader";
import { breakIfRequested } from "../problems";
import type { StoryWord } from "@/domain/types";
import SafeSection from "../components/SafeSection.vue";
import StoryAudioPlayer from "../components/StoryAudioPlayer.vue";
import BrowserVoiceBar from "../components/BrowserVoiceBar.vue";
import StoryText from "../components/StoryText.vue";
import StoryTasks from "../components/StoryTasks.vue";
import WordPopover from "../components/WordPopover.vue";
import NotFoundPage from "./NotFoundPage.vue";

breakIfRequested("storyPages");
const props = defineProps<{ id: string }>();
const { content, progress, review } = useServices();
const settings = useReaderSettings(progress);
const story = computed(() => content.story(props.id));

// ---------- кто читает вслух ----------
type Mode = "mp3" | "browser" | "none";
const hasMp3 = computed(() => (story.value?.audio.length ?? 0) > 0);
const mode = ref<Mode>(hasMp3.value ? "mp3" : browserVoiceSupported ? "browser" : "none");
const browserReason = ref(hasMp3.value ? "" : "для этого рассказа нет mp3");

function switchToBrowserVoice(reason: string) {
  browserReason.value = reason;
  mode.value = browserVoiceSupported ? "browser" : "none";
}

const player = ref<InstanceType<typeof StoryAudioPlayer> | null>(null);
const voiceBar = ref<InstanceType<typeof BrowserVoiceBar> | null>(null);
const currentSentence = ref(-1);
const sentences = computed(() => (story.value ? [story.value.title, ...story.value.paragraphs.flat()] : []));
const canPlay = computed(() => mode.value === "browser" || (mode.value === "mp3" && Boolean(player.value?.hasTimings)));
const scrollToCurrent = computed(() =>
  mode.value === "browser" || Boolean(player.value?.karaokeOn() && player.value?.isPlaying()));

function playFrom(index: number) {
  if (mode.value === "mp3") player.value?.playSentence(index);
  else if (mode.value === "browser") voiceBar.value?.readFrom(index);
}

// ---------- слова рассказа → в повторение (карточки) ----------
const storyWordKeys = computed(() => (story.value?.words ?? []).map(w => w.level + "|" + w.en));
const newWordsCount = ref(storyWordKeys.value.filter(k => review.status(k) === "new").length);
const addedWords = ref<number | null>(null);
function addStoryWords() {
  addedWords.value = review.addWords(storyWordKeys.value);
  newWordsCount.value = 0;
}

// ---------- перевод слова ----------
const popover = ref<InstanceType<typeof WordPopover> | null>(null);
function showWord(element: HTMLElement, meanings: StoryWord[]) { popover.value?.show(element, meanings); }

function levelCounts() {
  const counts: Record<string, number> = {};
  story.value?.words.forEach(w => { counts[w.level] = (counts[w.level] ?? 0) + 1; });   // уникальные словарные записи
  return Object.entries(counts).sort();
}
</script>

<template>
  <NotFoundPage v-if="!story" />
  <template v-else>
    <RouterLink class="back" to="/stories">← Все рассказы</RouterLink>
    <h1 class="story-title sentence" :class="{ now: currentSentence === 0 }" data-sentence="0" @click="playFrom(0)">{{ story.title }}</h1>
    <div class="legend">
      Слова из словаря:
      <span v-for="[level, n] in levelCounts()" :key="level" class="badge" :class="level">{{ level }} · {{ n }}</span>
    </div>

    <!-- аудио: если плеер упадёт, SafeSection сообщит — и включится голос браузера -->
    <SafeSection v-if="mode === 'mp3'" title="Плеер" silent @failed="switchToBrowserVoice('плеер не работает')">
      <StoryAudioPlayer ref="player" :title="story.title" :tracks="story.audio"
        @sentence="currentSentence = $event" @error="switchToBrowserVoice('mp3 не загрузился')" />
    </SafeSection>
    <SafeSection v-else-if="mode === 'browser'" title="Голос браузера" @failed="mode = 'none'">
      <BrowserVoiceBar ref="voiceBar" :sentences="sentences" :reason="browserReason" @sentence="currentSentence = $event" />
    </SafeSection>
    <p v-else class="hint-line">🔇 Аудио недоступно{{ browserReason ? ": " + browserReason : "" }}, а браузер не умеет читать вслух.</p>

    <p v-if="canPlay" class="hint-line">▶ Нажмите на предложение, чтобы послушать его. Нажмите на подсвеченное слово, чтобы увидеть перевод.</p>

    <SafeSection title="Текст рассказа">
      <StoryText :story="story" :current-sentence="currentSentence" :scroll-to-current="scrollToCurrent"
        :clickable="canPlay" :highlight="settings.highlight" :translate="settings.translate"
        @sentence-click="playFrom" @word-click="showWord" />
    </SafeSection>

    <div class="story-actions">
      <button v-if="newWordsCount" class="small primary-small" @click="addStoryWords">➕ Добавить {{ newWordsCount }} новых слов рассказа в повторение</button>
      <span v-else-if="addedWords" class="done-line">✓ Добавлено {{ addedWords }} слов — они уже в сегодняшнем повторении</span>
      <span v-else class="muted">Все слова рассказа уже в повторении</span>
      <RouterLink class="small story-dictation" :to="'/dictation/' + story.id">✍️ Диктант по рассказу</RouterLink>
    </div>

    <SafeSection title="Задания">
      <StoryTasks :key="story.id" :story="story" />
    </SafeSection>

    <SafeSection title="Перевод слов" silent>
      <WordPopover ref="popover" />
    </SafeSection>
  </template>
</template>
