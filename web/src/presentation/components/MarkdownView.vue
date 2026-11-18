<!-- Теория грамматики: разбор в domain/markdown.ts, здесь — только отображение блоков. -->
<script setup lang="ts">
import { computed } from "vue";
import { inlineToHtml, parseMarkdown, plainText } from "@/domain/markdown";
import { breakIfRequested } from "../problems";
import SpeakButton from "./SpeakButton.vue";

breakIfRequested("markdown");
const props = defineProps<{ source: string }>();
const blocks = computed(() => parseMarkdown(props.source));
// v-html безопасен: inlineToHtml сначала экранирует весь HTML
const html = inlineToHtml;
</script>

<template>
  <div class="md">
    <template v-for="(block, index) in blocks" :key="index">
      <h3 v-if="block.kind === 'heading' && block.level === 3" v-html="html(block.text)" />
      <h4 v-else-if="block.kind === 'heading'" v-html="html(block.text)" />

      <p v-else-if="block.kind === 'paragraph'" v-html="block.lines.map(html).join('<br>')" />

      <ol v-else-if="block.kind === 'list' && block.ordered"><li v-for="(item, i) in block.items" :key="i" v-html="html(item)" /></ol>
      <ul v-else-if="block.kind === 'list'"><li v-for="(item, i) in block.items" :key="i" v-html="html(item)" /></ul>

      <div v-else-if="block.kind === 'examples'" class="examples">
        <div v-for="(example, i) in block.items" :key="i" class="ex">
          <span class="ex-en" v-html="html(example.en)" />
          <span v-if="example.ru" class="ex-ru" v-html="html(example.ru)" />
          <SpeakButton v-if="/[a-z]/i.test(example.en)" :text="plainText(example.en)" />
        </div>
      </div>

      <div v-else-if="block.kind === 'tip'" class="tip" v-html="'💡 ' + block.lines.map(html).join('<br>')" />

      <div v-else-if="block.kind === 'mistakes'" class="mistakes">
        <div v-for="(mistake, i) in block.items" :key="i" class="mistake">
          <template v-if="mistake.right">
            <span class="wrong" v-html="html(mistake.wrong)" /><span class="arrow">→</span><span class="rightans" v-html="html(mistake.right)" />
          </template>
          <span v-else v-html="html(mistake.wrong)" />
        </div>
      </div>

      <div v-else-if="block.kind === 'table'" class="table-wrap">
        <table>
          <tr><th v-for="(cell, i) in block.header" :key="i" v-html="html(cell)" /></tr>
          <tr v-for="(row, r) in block.rows" :key="r"><td v-for="(cell, i) in row" :key="i" v-html="html(cell)" /></tr>
        </table>
      </div>
    </template>
  </div>
</template>
