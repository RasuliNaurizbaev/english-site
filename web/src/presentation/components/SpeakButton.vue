<!-- Кнопка 🔊 — произнести текст голосом устройства. -->
<script setup lang="ts">
import { speak, speechSupported } from "../composables/useSpeech";
defineProps<{ text: string }>();
</script>

<template>
  <button v-if="speechSupported" class="speak" title="Произнести" @click.stop="speak(text)">🔊</button>
</template>
