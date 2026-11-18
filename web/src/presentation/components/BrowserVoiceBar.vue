<!-- Чтение рассказа голосом браузера (если нет mp3 / mp3 не загрузился / плеер не работает). -->
<script setup lang="ts">
import { computed } from "vue";
import { breakIfRequested } from "../problems";
import { useBrowserReader } from "../composables/useBrowserReader";
import SegmentedControl from "./SegmentedControl.vue";

breakIfRequested("browserReader");
const props = defineProps<{ sentences: string[]; reason: string }>();
const emit = defineEmits<{ sentence: [index: number] }>();
const reader = useBrowserReader();

function readFrom(index: number) {
  reader.start(props.sentences, index, current => emit("sentence", current));
}
function togglePlay() {
  if (reader.reading.value && !reader.paused.value) reader.pause();
  else if (reader.paused.value) reader.resume();
  else readFrom(0);
}
function stop() {
  reader.stop();
  emit("sentence", -1);
}
const playLabel = computed(() => (reader.reading.value && !reader.paused.value ? "⏸ Пауза" : "▶ Читать вслух"));

defineExpose({ readFrom });
</script>

<template>
  <div class="voice-bar">
    <div class="voice-note">🗣 Читает голос браузера ({{ reader.voiceName() }}) — {{ reason }}.</div>
    <div class="voice-controls">
      <button class="small primary-small" @click="togglePlay">{{ playLabel }}</button>
      <button class="small" title="Остановить" @click="stop">■</button>
      <SegmentedControl v-model="reader.speed.value" :options="[[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×']]" small />
    </div>
  </div>
</template>
