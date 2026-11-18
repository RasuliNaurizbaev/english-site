<!-- Переключатель вариантов: <SegmentedControl v-model="speed" :options="[[0.75, '0.75×'], [1, '1×']]" /> -->
<script setup lang="ts" generic="T extends string | number">
defineProps<{ options: [T, string][]; small?: boolean }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="segmented" :class="{ small }">
    <button v-for="[value, label] in options" :key="String(value)" :class="{ active: value === model }" @click="model = value">
      {{ label }}
    </button>
  </div>
</template>
