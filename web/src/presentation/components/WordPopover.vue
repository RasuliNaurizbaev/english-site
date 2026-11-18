<!-- Перевод слова под нажатым словом. Закрывается при нажатии мимо или прокрутке. -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { StoryWord } from "@/domain/types";
import { breakIfRequested } from "../problems";
import SpeakButton from "./SpeakButton.vue";

breakIfRequested("wordPopover");
const word = ref<StoryWord | null>(null);
const position = ref({ left: 0, top: 0 });
const box = ref<HTMLElement | null>(null);

function show(element: HTMLElement, value: StoryWord) {
  word.value = value;
  const rect = element.getBoundingClientRect();
  position.value = { left: window.scrollX + rect.left, top: window.scrollY + rect.bottom + 6 };
  // после отрисовки — выровнять по центру слова и не выйти за край экрана
  requestAnimationFrame(() => {
    const width = box.value?.offsetWidth ?? 200;
    const screen = document.documentElement.clientWidth;
    const left = window.scrollX + rect.left + rect.width / 2 - width / 2;
    position.value.left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + screen - width - 8));
  });
}
function hide() { word.value = null; }

function onDocumentClick(event: MouseEvent) {
  if (!(event.target as HTMLElement).closest(".popover")) hide();
}
onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("scroll", hide, { passive: true });
});
onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  window.removeEventListener("scroll", hide);
});

defineExpose({ show, hide });
</script>

<template>
  <div v-if="word" ref="box" class="popover" :style="{ left: position.left + 'px', top: position.top + 'px' }">
    <div class="en">{{ word.en }} <span class="badge" :class="word.level">{{ word.level }}</span><SpeakButton :text="word.en" /></div>
    <div class="ru">{{ word.ru }}</div>
  </div>
</template>
