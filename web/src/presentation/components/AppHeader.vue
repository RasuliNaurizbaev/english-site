<!-- Шапка: вкладки разделов + настройки чтения (только на странице рассказа). -->
<script setup lang="ts">
import { useRoute } from "vue-router";
import { useServices } from "../composables/useServices";
import { changeFontSize, useReaderSettings } from "../composables/useReaderSettings";

const route = useRoute();
const settings = useReaderSettings(useServices().progress);

const TABS = [
  { tab: "today", to: "/", icon: "☀️", label: "Сегодня" },
  { tab: "stories", to: "/stories", icon: "📖", label: "Рассказы" },
  { tab: "words", to: "/words", icon: "🗂", label: "Слова" },
  { tab: "grammar", to: "/grammar", icon: "📐", label: "Грамматика" },
  { tab: "audio", to: "/audio", icon: "🎧", label: "Аудио" },
] as const;
</script>

<template>
  <header class="top">
    <div class="nav">
      <RouterLink to="/" class="brand">English</RouterLink>
      <nav class="tabs">
        <RouterLink v-for="t in TABS" :key="t.tab" :to="t.to" :class="{ active: route.meta.tab === t.tab }">
          {{ t.icon }} <span>{{ t.label }}</span>
        </RouterLink>
      </nav>
    </div>
    <div v-if="route.meta.reader" class="controls">
      <button title="Меньше шрифт" @click="changeFontSize(settings, -1)">A−</button>
      <button title="Больше шрифт" @click="changeFontSize(settings, +1)">A+</button>
      <label class="toggle"><input v-model="settings.highlight" type="checkbox"> Подсветка</label>
      <label class="toggle"><input v-model="settings.translate" type="checkbox"> Перевод</label>
    </div>
  </header>
</template>
