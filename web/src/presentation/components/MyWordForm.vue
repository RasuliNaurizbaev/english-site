<!-- «Мои слова»: добавить слово или исправить выбранное. Перевод можно попросить у AI (✨). -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useServices } from "../composables/useServices";
import { useAiProviders } from "../composables/useAiProviders";
import { suggestTranslation } from "@/application/aiTranslate";
import { DEFAULT_GROUP, type MyWord } from "@/domain/myWords";

const props = defineProps<{ editing: MyWord | null; group: string }>();
const emit = defineEmits<{ saved: [message: string, group: string]; cancel: [] }>();
const { myWords, progress } = useServices();
const ai = useAiProviders(progress);

const en = ref("");
const ru = ref("");
const group = ref("");
const message = ref("");
const translating = ref(false);
const enInput = ref<HTMLInputElement | null>(null);

// исправление слова — поля заполняются им; добавление — группа та, что выбрана в списке
watch(() => [props.editing, props.group] as const, ([word, current]) => {
  en.value = word?.en ?? "";
  ru.value = word?.ru ?? "";
  group.value = word?.group ?? (current || progress.setting("myGroup", DEFAULT_GROUP));
  message.value = "";
  if (word) nextTick(() => enInput.value?.focus());
}, { immediate: true });

const groups = computed(() => myWords.groups());

function save() {
  const input = { en: en.value, ru: ru.value, group: group.value };
  const problem = props.editing ? myWords.update(props.editing.en, input) : myWords.add(input);
  if (problem) { message.value = "⚠ " + problem; return; }
  const saved = myWords.find(input.en.trim().replace(/\s+/g, " "))!;
  progress.saveSetting("myGroup", saved.group);
  emit("saved", props.editing ? `✓ «${saved.en}» исправлено` : `✓ «${saved.en}» добавлено в «${saved.group}» — уже в повторении на сегодня`, saved.group);
  en.value = ru.value = "";
  message.value = "";
  enInput.value?.focus();
}

async function translate() {
  if (!en.value.trim() || translating.value) return;
  translating.value = true;
  message.value = "";
  try {
    const answer = await suggestTranslation(await ai.providers(), en.value.trim());
    if (answer) ru.value = answer;
    else message.value = "AI не узнал это слово — проверьте написание.";
  } catch (error) {
    message.value = "⚠ " + (error instanceof Error ? error.message : String(error));
  } finally {
    translating.value = false;
  }
}
</script>

<template>
  <form class="my-word-form" @submit.prevent="save">
    <input ref="enInput" v-model="en" class="search" placeholder="English: word или phrase" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en">
    <div class="my-word-ru">
      <input v-model="ru" class="search" placeholder="Перевод" autocomplete="off">
      <button type="button" class="small" :disabled="!en.trim() || translating" title="Подсказать перевод (AI)" @click="translate">{{ translating ? "…" : "✨" }}</button>
    </div>
    <input v-model="group" class="search" list="my-word-groups" placeholder="Группа (например: Кухня)" autocomplete="off">
    <datalist id="my-word-groups"><option v-for="g in groups" :key="g" :value="g" /></datalist>
    <div class="my-word-actions">
      <button type="submit" class="small primary-small">{{ editing ? "Сохранить" : "+ Добавить слово" }}</button>
      <button v-if="editing" type="button" class="small" @click="emit('cancel')">Отмена</button>
    </div>
    <p v-if="message" class="my-word-message">{{ message }}</p>
  </form>
</template>
