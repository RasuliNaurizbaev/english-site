<!-- Настройки AI для генерации новых тестов (заготовка). Ключ хранится только в этом браузере. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useServices } from "../composables/useServices";
import { AI_PRESETS, EMPTY_AI_SETTINGS, createAiProvider, isConfigured, type AiSettings } from "@/data/ai/aiProvider";

const { progress, aiTests } = useServices();
const router = useRouter();

const settings = ref<AiSettings>({ ...EMPTY_AI_SETTINGS, ...progress.setting<Partial<AiSettings>>("ai", {}) });
const level = ref<"A2" | "B1">("B1");
const focus = ref("");
const busy = ref(false);
const message = ref("");
const preset = computed(() => AI_PRESETS.find(p => p.id === settings.value.preset));

function choosePreset(id: string) {
  const found = AI_PRESETS.find(p => p.id === id);
  settings.value = { ...settings.value, preset: id, baseUrl: found?.baseUrl || settings.value.baseUrl };
}
function save() {
  progress.saveSetting("ai", settings.value);
  message.value = "Сохранено в этом браузере.";
}
async function generate() {
  save();
  busy.value = true;
  message.value = "AI составляет тест… (обычно 10–40 секунд)";
  try {
    const test = await aiTests.generate(createAiProvider(settings.value), { level: level.value, focus: focus.value });
    message.value = "";
    router.push("/tests/" + test.id);
  } catch (error) {
    message.value = "⚠ " + (error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <details class="task-box ai-panel">
    <summary><b>🤖 Новый тест с помощью AI</b> <span class="muted">(нужен ключ API — бесплатный тариф подойдёт)</span></summary>
    <p class="muted">
      AI каждый раз составляет новый тест и не повторяет вопросы прошлых тестов. Сайт проверяет тест перед показом.
      Ключ хранится только в этом браузере и не попадает в код.
    </p>
    <div class="ai-form">
      <label>Сервис
        <select :value="settings.preset" @change="choosePreset(($event.target as HTMLSelectElement).value)">
          <option v-for="p in AI_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
      </label>
      <label>Адрес API <input v-model="settings.baseUrl" class="search" placeholder="https://…/v1"></label>
      <label>Модель
        <input v-model="settings.model" class="search" placeholder="название модели из документации сервиса">
        <a v-if="preset?.docs" :href="preset.docs" target="_blank" rel="noopener" class="muted">список моделей ↗</a>
      </label>
      <label>Ключ API <input v-model="settings.apiKey" class="search" type="password" autocomplete="off" placeholder="ключ из личного кабинета сервиса"></label>
      <label>Уровень
        <select v-model="level"><option value="A2">A2</option><option value="B1">B1</option></select>
      </label>
      <label>Темы (необязательно) <input v-model="focus" class="search" placeholder="например: Present Perfect, phrasal verbs"></label>
    </div>
    <div class="voice-controls">
      <button class="small" @click="save">Сохранить настройки</button>
      <button class="small primary-small" :disabled="busy || !isConfigured(settings)" @click="generate">✨ Создать тест</button>
    </div>
    <p v-if="message" class="muted">{{ message }}</p>
  </details>
</template>
