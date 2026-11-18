<!--
  Защитная обёртка: если что-то внутри упадёт, вместо этой части покажется сообщение,
  а остальная страница продолжит работать.

    <SafeSection title="Задания" @failed="...">
      <StoryTasks ... />
    </SafeSection>
-->
<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";
import { reportProblem } from "../problems";

const props = defineProps<{ title: string; silent?: boolean }>();
const emit = defineEmits<{ failed: [] }>();
const failed = ref(false);

onErrorCaptured(error => {
  failed.value = true;
  reportProblem(props.title, error);
  emit("failed");
  return false;               // ошибка дальше не идёт — остальной сайт не затронут
});
</script>

<template>
  <div v-if="failed && !silent" class="error-box">⚠ {{ title }} — временно не работает. Остальная часть страницы доступна.</div>
  <slot v-else-if="!failed" />
</template>
