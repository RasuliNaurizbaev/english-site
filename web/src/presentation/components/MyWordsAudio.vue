<!-- «Аудио → Мои»: mp3 из своих слов по группам (слово → пауза). Озвучка — на сервере сайта (edge-tts),
     mp3 хранится только на этом устройстве (IndexedDB) и удаляется кнопкой. -->
<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from "vue";
import { useServices } from "../composables/useServices";
import { createBrowserAudioStore, createMemoryAudioStore, type GroupAudio } from "@/data/audioStore";
import { fetchSpeech } from "@/data/ttsClient";
import { DEFAULT_PAUSE, MY_AUDIO_VOICES, MyAudioService, isOutdated } from "@/application/myAudio";
import { formatDuration } from "@/domain/text";

const { myWords, progress } = useServices();
const browserStore = createBrowserAudioStore();
const service = new MyAudioService(browserStore ?? createMemoryAudioStore(), fetchSpeech);

const settings = reactive(progress.setting("myAudio", { voice: "jenny", pause: DEFAULT_PAUSE }));
const saveSettings = () => progress.saveSetting("myAudio", { ...settings });
const PAUSES = [1.2, 1.8, 2.5, 3.5];

const recordings = ref<GroupAudio[]>([]);
const urls = new Map<string, string>();          // group → blob: адрес для плеера и скачивания
const building = ref("");                        // группа, для которой сейчас делается mp3
const progressText = ref("");
const message = ref("");
const confirmDelete = ref("");

function urlOf(audio: GroupAudio): string {
  const key = audio.group + "@" + audio.createdAt;
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(new Blob([audio.mp3 as BlobPart], { type: "audio/mpeg" })));
  return urls.get(key)!;
}
onUnmounted(() => urls.forEach(url => URL.revokeObjectURL(url)));

async function reload() {
  try {
    recordings.value = await service.recordings();
  } catch (error) {
    message.value = "⚠ Не удалось прочитать mp3 с устройства: " + (error instanceof Error ? error.message : String(error));
  }
}
reload();

const wordsOf = (group: string) => myWords.list().filter(w => w.group === group).map(w => w.en);
/** Группы со словами + mp3 групп, где слов уже не осталось (их можно только удалить). */
const cards = computed(() => {
  const groups = myWords.groups().map(group => ({ group, words: wordsOf(group), audio: recordings.value.find(a => a.group === group) }));
  const orphans = recordings.value.filter(a => !groups.some(g => g.group === a.group)).map(audio => ({ group: audio.group, words: [] as string[], audio }));
  return [...groups, ...orphans];
});

async function build(group: string) {
  if (building.value) return;
  building.value = group;
  message.value = confirmDelete.value = "";
  try {
    await service.build(group, wordsOf(group), {
      voice: settings.voice, pause: settings.pause,
      onProgress: (done, total) => { progressText.value = `Озвучка: ${done} из ${total}…`; },
    });
    await reload();
  } catch (error) {
    message.value = "⚠ " + (error instanceof Error ? error.message : String(error));
  } finally {
    building.value = progressText.value = "";
  }
}

async function remove(group: string) {
  if (confirmDelete.value !== group) { confirmDelete.value = group; return; }
  confirmDelete.value = "";
  await service.remove(group);
  await reload();
}

const fileName = (group: string) => `my-words-${group.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "group"}.mp3`;
const created = (ms: number) => new Date(ms).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
</script>

<template>
  <p class="intro">
    mp3 из ваших слов по группам: английское слово → пауза, чтобы повторить вслух.
    Слова озвучивает сервер сайта (нужен вход по коду), а mp3 хранится <b>только на этом устройстве</b> — на сервер не загружается.
  </p>
  <p v-if="!browserStore" class="problem-note">⚠ Браузер не даёт сохранять файлы на устройстве (приватный режим?) — mp3 пропадёт после перезагрузки страницы.</p>

  <p v-if="!cards.length" class="muted">Своих слов пока нет. <RouterLink to="/words/MY">Добавить слова →</RouterLink></p>
  <template v-else>
    <div class="ai-form my-audio-settings">
      <label>Голос
        <select v-model="settings.voice" @change="saveSettings"><option v-for="v in MY_AUDIO_VOICES" :key="v.id" :value="v.id">{{ v.label }}</option></select>
      </label>
      <label>Пауза после слова
        <select v-model.number="settings.pause" @change="saveSettings"><option v-for="p in PAUSES" :key="p" :value="p">{{ p }} с</option></select>
      </label>
    </div>
    <p v-if="message" class="my-word-message">{{ message }}</p>

    <div class="audio-list">
      <div v-for="card in cards" :key="card.group" class="audio-card my-audio-card">
        <div class="audio-head">
          <div class="audio-title"><b>{{ card.group }}</b><span class="muted"> · {{ card.words.length }} сл.<template v-if="card.audio"> · {{ formatDuration(card.audio.seconds) }} · {{ created(card.audio.createdAt) }}</template></span></div>
          <span v-if="card.audio && card.words.length && isOutdated(card.audio, card.words)" class="my-audio-outdated">слова изменились</span>
        </div>
        <div class="audio-range">{{ card.words.join(", ") || "слов в группе больше нет" }}</div>
        <audio v-if="card.audio" :src="urlOf(card.audio)" controls preload="metadata" />
        <div class="my-audio-actions">
          <span v-if="building === card.group" class="muted">{{ progressText }}</span>
          <template v-else>
            <button v-if="card.words.length" class="small" :class="{ 'primary-small': !card.audio || isOutdated(card.audio, card.words) }" :disabled="!!building" @click="build(card.group)">
              {{ card.audio ? "🔄 Пересоздать mp3" : "🎙 Сделать mp3" }}
            </button>
            <a v-if="card.audio" class="small-link" :href="urlOf(card.audio)" :download="fileName(card.group)">⬇ Скачать</a>
            <button v-if="card.audio" class="small" :class="{ danger: confirmDelete === card.group }" @click="remove(card.group)">
              {{ confirmDelete === card.group ? "Удалить mp3?" : "🗑 Удалить mp3" }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </template>
</template>
