<!--
  Резервная копия прогресса: «Сохранить в файл» и «Загрузить из файла».
  Перед заменой прогресса показывает, что в файле, и просит подтвердить.
-->
<script setup lang="ts">
import { ref } from "vue";
import { useServices } from "../composables/useServices";
import type { BackupSummary, ProgressFile } from "@/data/progressBackup";

const { backup } = useServices();
const fileInput = ref<HTMLInputElement | null>(null);
const pending = ref<{ file: ProgressFile; summary: BackupSummary; name: string } | null>(null);
const message = ref("");

/** Скачать файл с прогрессом. */
function saveToFile() {
  const json = JSON.stringify(backup.export(), null, 1);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = backup.fileName();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message.value = "✓ Файл сохранён: " + backup.fileName();
}

/** Выбран файл: проверить и показать, что в нём (пока ничего не меняем). */
async function onFileChosen(event: Event) {
  const chosen = (event.target as HTMLInputElement).files?.[0];
  if (!chosen) return;
  message.value = "";
  try {
    pending.value = { ...backup.inspect(await chosen.text()), name: chosen.name };
  } catch (error) {
    pending.value = null;
    message.value = "⚠ " + (error instanceof Error ? error.message : String(error));
  } finally {
    if (fileInput.value) fileInput.value.value = "";      // чтобы можно было выбрать тот же файл ещё раз
  }
}

function confirmRestore() {
  if (!pending.value) return;
  backup.restore(pending.value.file);
  location.reload();                                       // перечитать прогресс на всех страницах
}
</script>

<template>
  <details class="task-box backup-panel">
    <summary><b>💾 Резервная копия прогресса</b></summary>
    <p class="muted">
      Прогресс хранится в этом браузере и привязан к адресу сайта. Сохраните его в файл, чтобы перенести на другой адрес,
      в другой браузер или восстановить после очистки. Ключи AI в файл не попадают.
    </p>
    <div class="voice-controls">
      <button class="small primary-small" @click="saveToFile">Сохранить в файл</button>
      <button class="small" @click="fileInput?.click()">Загрузить из файла</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFileChosen">
    </div>

    <div v-if="pending" class="restore-confirm">
      <p>
        Файл <b>{{ pending.name }}</b> от {{ new Date(pending.file.exportedAt).toLocaleString("ru-RU") }}:
        слов в изучении — {{ pending.summary.words }}, рассказов — {{ pending.summary.stories }}, тем грамматики — {{ pending.summary.grammar }}.
      </p>
      <p class="muted">Текущий прогресс в этом браузере будет заменён прогрессом из файла.</p>
      <div class="voice-controls">
        <button class="small danger" @click="confirmRestore">Заменить прогресс</button>
        <button class="small" @click="pending = null">Отмена</button>
      </div>
    </div>
    <p v-if="message" class="muted">{{ message }}</p>
  </details>
</template>
