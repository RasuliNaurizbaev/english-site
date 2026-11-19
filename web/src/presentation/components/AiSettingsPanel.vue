<!--
  Новый тест с помощью AI: Google Gemini (основной) и Groq (запасной).
  Основной способ — вход по личному коду доступа: ключи хранятся на сервере сайта (секреты Worker'а).
  Запасной — свои ключи в этом браузере (работает и при локальном запуске без сервера).
  Порядок: Gemini, потом Groq; ошибка или плохой тест — пробуем следующий.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useServices } from "../composables/useServices";
import {
  AI_SERVICES, createProvider, isConfigured, isServiceReady, normalizeSettings, pickDefaultModel, providersInOrder,
  type AiServiceId, type AiSettings,
} from "@/data/ai/aiProvider";
import { loadSession, login, logout, serverProviders, type ServerSession } from "@/data/ai/serverAi";

const { progress, aiTests } = useServices();
const router = useRouter();

const settings = reactive<AiSettings>(normalizeSettings(progress.setting("ai", {})));
const models = reactive<Record<AiServiceId, string[]>>({ groq: [], gemini: [] });
const status = reactive<Record<AiServiceId, string>>({ groq: "", gemini: "" });
const level = ref<"A2" | "B1">("B1");
const focus = ref("");
const busy = ref(false);
const message = ref("");

// вход по коду доступа: undefined — ещё проверяем, null — сервера нет (локальный запуск)
const session = ref<ServerSession | null | undefined>(undefined);
const code = ref("");
const loginMessage = ref("");
// раскрыты ли блоки — решается один раз при загрузке, дальше их открывает и закрывает пользователь
const panelOpen = ref(isConfigured(settings) ? true : undefined);
const ownKeysOpen = ref<true | undefined>(undefined);
onMounted(async () => {
  session.value = await loadSession();
  if (canGenerate.value) panelOpen.value = true;
  if (session.value === null) ownKeysOpen.value = true;            // сервера нет — остаются только свои ключи
});

const serverNames = computed(() => serverProviders(session.value ?? null).map(p => p.name).join(", "));
/** Кого спрашивать: серверные ключи, если вошли и они есть; иначе свои ключи из браузера. */
const providers = () => {
  const server = serverProviders(session.value ?? null);
  return server.length ? server : providersInOrder(settings);
};
const canGenerate = computed(() => serverNames.value !== "" || isConfigured(settings));

async function signIn() {
  loginMessage.value = "";
  try {
    session.value = await login(code.value.trim());
    code.value = "";
    if (!session.value.services.length) loginMessage.value = "Вы вошли, но на сервере пока нет ключей AI.";
  } catch (error) {
    loginMessage.value = "⚠ " + (error instanceof Error ? error.message : String(error));
  }
}

async function signOut() {
  try { session.value = await logout(); } catch { session.value = { user: null, services: [] }; }
}

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
    const test = await aiTests.generate(providers(), { level: level.value, focus: focus.value });
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
  <details class="task-box ai-panel" :open="panelOpen">
    <summary><b>🤖 Новый тест с помощью AI</b> <span class="muted">(Gemini, запасной — Groq)</span></summary>
    <p class="muted">
      AI каждый раз составляет новый тест и не повторяет вопросы прошлых тестов. Сайт проверяет тест перед показом.
    </p>

    <div v-if="session" class="ai-service">
      <template v-if="session.user">
        <div class="ai-service-head">
          <b>Вы вошли: {{ session.user }}</b>
          <span v-if="serverNames" class="badge done-badge">AI сайта: {{ serverNames }}</span>
          <button class="small" @click="signOut">Выйти</button>
        </div>
      </template>
      <template v-else>
        <div class="ai-service-head"><b>Вход по коду доступа</b> <span class="muted">— тогда AI работает на ключах сайта</span></div>
        <form class="voice-controls" @submit.prevent="signIn">
          <input v-model="code" class="search" type="password" autocomplete="current-password" placeholder="код доступа">
          <button class="small" type="submit" :disabled="!code.trim()">Войти</button>
        </form>
      </template>
      <p v-if="loginMessage" class="muted">{{ loginMessage }}</p>
    </div>

    <details class="ai-own-keys" :open="ownKeysOpen">
      <summary>Свои ключи <span class="muted">(запасной вариант; хранятся только в этом браузере{{ serverNames ? ", сейчас не используются" : "" }})</span></summary>
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
    </details>

    <div class="ai-form">
      <label>Уровень
        <select v-model="level"><option value="A2">A2</option><option value="B1">B1</option></select>
      </label>
      <label>Темы (необязательно) <input v-model="focus" class="search" placeholder="например: Present Perfect, phrasal verbs"></label>
    </div>
    <button class="primary" :disabled="busy || !canGenerate" @click="generate">✨ Создать тест</button>
    <p v-if="message" class="muted">{{ message }}</p>
  </details>
</template>
