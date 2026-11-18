<!--
  Настройки AI для генерации новых тестов: Google Gemini (основной) и Groq (запасной).
  Есть ключ Gemini — тест просим у него; нет ключа, ошибка или плохой тест — у Groq.
  Ключи хранятся только в этом браузере.
-->
<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useServices } from "../composables/useServices";
import {
  AI_SERVICES, createProvider, isConfigured, isServiceReady, normalizeSettings, pickDefaultModel, providersInOrder,
  type AiServiceId, type AiSettings,
} from "@/data/ai/aiProvider";

const { progress, aiTests } = useServices();
const router = useRouter();

const settings = reactive<AiSettings>(normalizeSettings(progress.setting("ai", {})));
const models = reactive<Record<AiServiceId, string[]>>({ groq: [], gemini: [] });
const status = reactive<Record<AiServiceId, string>>({ groq: "", gemini: "" });
const level = ref<"A2" | "B1">("B1");
const focus = ref("");
const busy = ref(false);
const message = ref("");

function save() { progress.saveSetting("ai", settings); }

/** Проверить ключ: загрузить список моделей и выбрать подходящую. */
async function checkKey(id: AiServiceId) {
  save();
  status[id] = "Проверяю ключ…";
  try {
    const list = await createProvider(id, settings[id]).listModels();
    models[id] = list;
    if (!list.includes(settings[id].model)) settings[id].model = pickDefaultModel(AI_SERVICES.find(s => s.id === id)!, list);
    save();
    status[id] = `✓ Ключ работает, моделей: ${list.length}`;
  } catch (error) {
    status[id] = "⚠ " + (error instanceof Error ? error.message : String(error));
  }
}

async function generate() {
  save();
  busy.value = true;
  message.value = "AI составляет тест… (обычно 10–40 секунд)";
  try {
    const test = await aiTests.generate(providersInOrder(settings), { level: level.value, focus: focus.value });
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
  <details class="task-box ai-panel" :open="!isConfigured(settings) ? undefined : true">
    <summary><b>🤖 Новый тест с помощью AI</b> <span class="muted">(Gemini, запасной — Groq; бесплатно в пределах лимитов)</span></summary>
    <p class="muted">
      AI каждый раз составляет новый тест и не повторяет вопросы прошлых тестов. Сайт проверяет тест перед показом.
      Если есть ключ Gemini — тест составляет он; если ключа нет или Gemini не ответил — Groq. Достаточно одного ключа. Ключи хранятся только в этом браузере.
    </p>

    <div v-for="service in AI_SERVICES" :key="service.id" class="ai-service">
      <div class="ai-service-head">
        <b>{{ service.label }}</b> <span class="badge plain">{{ service.role }}</span>
        <span v-if="isServiceReady(settings[service.id])" class="badge done-badge">готов</span>
        <a :href="service.keyUrl" target="_blank" rel="noopener" class="muted">получить ключ ↗</a>
      </div>
      <div class="ai-form">
        <label>Ключ API
          <input v-model="settings[service.id].apiKey" class="search" type="password" autocomplete="off" :placeholder="'ключ ' + service.label" @change="save">
        </label>
        <label>Модель
          <select v-if="models[service.id].length" v-model="settings[service.id].model" @change="save">
            <option v-for="m in models[service.id]" :key="m" :value="m">{{ m }}</option>
          </select>
          <input v-else v-model="settings[service.id].model" class="search" placeholder="появится после «Проверить ключ»" @change="save">
        </label>
      </div>
      <div class="voice-controls">
        <button class="small" :disabled="!settings[service.id].apiKey.trim()" @click="checkKey(service.id)">Проверить ключ</button>
        <span class="muted">{{ status[service.id] }}</span>
      </div>
    </div>

    <div class="ai-form">
      <label>Уровень
        <select v-model="level"><option value="A2">A2</option><option value="B1">B1</option></select>
      </label>
      <label>Темы (необязательно) <input v-model="focus" class="search" placeholder="например: Present Perfect, phrasal verbs"></label>
    </div>
    <button class="primary" :disabled="busy || !isConfigured(settings)" @click="generate">✨ Создать тест</button>
    <p v-if="message" class="muted">{{ message }}</p>
  </details>
</template>
