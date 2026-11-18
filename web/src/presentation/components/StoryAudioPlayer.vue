<!--
  Плеер рассказа внизу экрана: выбор голоса, скорость, караоке, «пауза для повтора».
  Сообщает странице, какое предложение звучит: @sentence(index), 0 — заголовок, -1 — ничего.
  Если mp3 не загрузился — @error (страница переключится на голос браузера).
  Снаружи можно вызвать playSentence(index).
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { StoryAudioTrack } from "@/domain/types";
import { audioUrl } from "@/data/config";
import { breakIfRequested } from "../problems";
import { useServices } from "../composables/useServices";
import SegmentedControl from "./SegmentedControl.vue";

breakIfRequested("player");
const props = defineProps<{ title: string; tracks: StoryAudioTrack[] }>();
const emit = defineEmits<{ sentence: [index: number]; error: [] }>();
const { progress } = useServices();

const audio = ref<HTMLAudioElement | null>(null);

// ---------- настройки (запоминаются) ----------
const voice = ref<string>(progress.setting("voice", props.tracks[0].voice));
const speed = ref<number>(progress.setting("rate", 1));
const karaoke = ref<boolean>(progress.setting("follow", true));
const repeatMode = ref<boolean>(progress.setting("repeat", false));
watch(speed, value => { progress.saveSetting("rate", value); if (audio.value) audio.value.playbackRate = value; });
watch(karaoke, value => { progress.saveSetting("follow", value); if (!value) setSentence(-1); });
watch(repeatMode, value => progress.saveSetting("repeat", value));

const track = computed(() => props.tracks.find(t => t.voice === voice.value) ?? props.tracks[0]);
const hasTimings = computed(() => Boolean(track.value.timings));
const voiceOptions = computed(() => props.tracks.map(t => [t.voice, t.label] as [string, string]));

// ---------- смена голоса: продолжаем с того же предложения ----------
let current = -1;
let resumeAfterSwitch: { sentence: number; play: boolean } | null = null;
watch(voice, (value, old) => {
  progress.saveSetting("voice", value);
  if (old && audio.value) resumeAfterSwitch = { sentence: current, play: !audio.value.paused };
});
function onLoaded() {
  if (!audio.value) return;
  audio.value.playbackRate = speed.value;
  if (resumeAfterSwitch) {
    const { sentence, play } = resumeAfterSwitch;
    resumeAfterSwitch = null;
    if (track.value.timings && sentence >= 0) audio.value.currentTime = track.value.timings[sentence][0];
    if (play) audio.value.play().catch(() => {});
  }
}

// ---------- караоке ----------
function setSentence(index: number) {
  if (index === current) return;
  current = index;
  emit("sentence", index);
}

/** Какое предложение звучит в момент time (-1 — до начала). */
function sentenceAt(time: number): number {
  const timings = track.value.timings ?? [];
  for (let i = 0; i < timings.length; i++) {
    const [start, end] = timings[i];
    if (time < start - 0.05) return i - 1;
    if (time <= end + 0.3) return i;
  }
  return timings.length - 1;
}

let repeatTimer: ReturnType<typeof setTimeout> | undefined;
let pausedAfter = -1;

function onTimeUpdate() {
  const timings = track.value.timings;
  if (!timings || !audio.value) return;
  const index = sentenceAt(audio.value.currentTime);
  if (karaoke.value) setSentence(index);

  // «Пауза для повтора»: после предложения — пауза такой же длины, чтобы повторить вслух
  if (repeatMode.value && index >= 1 && pausedAfter !== index && audio.value.currentTime >= timings[index][1] - 0.05) {
    pausedAfter = index;
    audio.value.pause();
    const [start, end] = timings[index];
    repeatTimer = setTimeout(() => audio.value?.play().catch(() => {}), (end - start) / speed.value * 1000 + 600);
  }
}
function onSeeking() { clearTimeout(repeatTimer); pausedAfter = -1; }

function playSentence(index: number) {
  const timings = track.value.timings;
  if (!timings?.[index] || !audio.value) return;
  onSeeking();
  audio.value.currentTime = timings[index][0];
  audio.value.play().catch(() => {});
  setSentence(index);
}

const isPlaying = () => Boolean(audio.value && !audio.value.paused);
const karaokeOn = () => karaoke.value;
defineExpose({ playSentence, hasTimings, isPlaying, karaokeOn });

onMounted(() => document.body.classList.add("has-player"));
onUnmounted(() => {
  clearTimeout(repeatTimer);
  document.body.classList.remove("has-player");
});
</script>

<template>
  <div class="player">
    <div class="player-inner">
      <div class="player-row">
        <div class="player-title">🔊 {{ title }}</div>
        <SegmentedControl v-if="tracks.length > 1" v-model="voice" :options="voiceOptions" small class="voices" />
      </div>
      <audio
        ref="audio" :src="audioUrl(track.src)" controls preload="metadata"
        @loadedmetadata="onLoaded" @timeupdate="onTimeUpdate" @seeking="onSeeking" @ended="setSentence(-1)" @error="emit('error')"
      />
      <div class="player-row2">
        <SegmentedControl v-model="speed" :options="[[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×']]" small />
        <template v-if="hasTimings">
          <label class="toggle"><input v-model="karaoke" type="checkbox"> Караоке</label>
          <label class="toggle"><input v-model="repeatMode" type="checkbox"> Пауза для повтора</label>
        </template>
      </div>
    </div>
  </div>
</template>
