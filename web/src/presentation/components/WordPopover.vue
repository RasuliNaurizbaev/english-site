<!--
  Перевод слова под нажатым словом. У слова может быть несколько значений
  (left — «левый» и прошедшее время от «to leave») — показываются все.
  Закрывается при нажатии мимо или прокрутке.
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { StoryWord } from "@/domain/types";
import { breakIfRequested } from "../problems";
import SpeakButton from "./SpeakButton.vue";

breakIfRequested("wordPopover");
const meanings = ref<StoryWord[]>([]);
const position = ref({ left: 0, top: 0 });
const box = ref<HTMLElement | null>(null);

function show(element: HTMLElement, values: StoryWord[]) {
  meanings.value = values;
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
function hide() { meanings.value = []; }

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
  <div v-if="meanings.length" ref="box" class="popover">
    <div v-for="(word, i) in meanings" :key="i" class="meaning" :class="{ more: i > 0 }">
      <div class="en">{{ word.en }} <span class="badge" :class="word.level">{{ word.level }}</span><SpeakButton :text="word.en" /></div>
      <div class="ru">{{ word.ru }}</div>
    </div>
    <div v-if="meanings.length > 1" class="meaning-note">несколько значений — выберите по смыслу</div>
  </div>
</template>

<style scoped>
.popover { left: v-bind("position.left + 'px'"); top: v-bind("position.top + 'px'"); }
.meaning.more { border-top: 1px dashed var(--border); margin-top: 6px; padding-top: 6px; }
.meaning-note { font-size: 12px; color: var(--muted); margin-top: 6px; }
</style>
