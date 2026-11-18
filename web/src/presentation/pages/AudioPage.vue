<!-- mp3 со словами по уровням: по 100 слов в файле, следующая часть включается сама. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useServices } from "../composables/useServices";
import { breakIfRequested } from "../problems";
import { audioUrl } from "@/data/config";
import { formatDuration } from "@/domain/text";
import type { Level } from "@/domain/types";

breakIfRequested("audioPage");
const props = defineProps<{ level?: string }>();
const { content, progress } = useServices();
const levels = content.wordAudioLevels();

const level = computed<Level | undefined>(() => {
  const wanted = (props.level ?? progress.setting("alevel", levels[0])) as Level;
  const chosen = levels.includes(wanted) ? wanted : levels[0];
  if (chosen) progress.saveSetting("alevel", chosen);
  return chosen;
});
const parts = computed(() => (level.value ? content.wordAudioParts(level.value) : []));
const listened = ref(progress.listenedParts());
// Плееры по номеру части (явный индекс: порядок ref-массива в v-for Vue не гарантирует)
const players: HTMLAudioElement[] = [];
function rememberPlayer(element: unknown, index: number) { if (element) players[index] = element as HTMLAudioElement; }

const wordsIn = (l: Level) => content.wordAudioParts(l).reduce((sum, p) => sum + p.count, 0);

/** Играет только одна часть. */
function onPlay(index: number) { players.forEach((p, i) => i !== index && p.pause()); }
/** Часть дослушана: отметка и следующая часть. */
function onEnded(index: number) {
  progress.markPartListened(parts.value[index].file);
  listened.value = progress.listenedParts();
  const next = players[index + 1];
  if (next) {
    next.scrollIntoView({ behavior: "smooth", block: "center" });
    next.play().catch(() => {});
  }
}
</script>

<template>
  <p v-if="!levels.length" class="intro">mp3 пока нет. Запустите tools/make_word_audio.py.</p>
  <template v-else>
    <p class="intro">Слушайте и повторяйте: английское слово → пауза, чтобы повторить вслух. По 100 слов в файле. Следующая часть включается сама.</p>
    <div class="levels">
      <RouterLink v-for="l in levels" :key="l" :to="'/audio/' + l" class="level-chip" :class="[l, { active: l === level }]">
        <b>{{ l }}</b><span>{{ content.wordAudioParts(l).length }} mp3 · {{ wordsIn(l) }} сл.</span>
      </RouterLink>
    </div>
    <div class="audio-list">
      <div v-for="(part, index) in parts" :key="part.file" class="audio-card" :class="{ listened: listened[part.file] }">
        <div class="audio-head">
          <div class="audio-title"><b>Часть {{ part.part }}</b><span class="muted"> · слова {{ part.from }}–{{ part.to }} · {{ formatDuration(part.duration) }}</span></div>
          <span class="audio-mark">{{ listened[part.file] ? "✓ прослушано" : "" }}</span>
        </div>
        <div class="audio-range">{{ part.first }} … {{ part.last }}</div>
        <audio :ref="el => rememberPlayer(el, index)" :src="audioUrl(part.src)" controls preload="none" @play="onPlay(index)" @ended="onEnded(index)" />
      </div>
    </div>
  </template>
</template>
