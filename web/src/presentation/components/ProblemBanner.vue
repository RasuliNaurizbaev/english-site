<!-- Предупреждение вверху: что не загрузилось. Нажмите, чтобы скрыть. -->
<script setup lang="ts">
import { problems } from "../problems";
</script>

<template>
  <div v-if="problems.list.length && !problems.hidden" id="problemBanner" class="problem-banner" @click="problems.hidden = true">
    ⚠ Не загрузилось: {{ problems.list.join(", ") }}. Остальное работает. (нажмите, чтобы скрыть)
  </div>
</template>
