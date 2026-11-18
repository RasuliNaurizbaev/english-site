// Разбор текста теории грамматики (мини-markdown) в список блоков.
// Только разбор — как показывать блоки, решает компонент MarkdownView.vue.
//
// Формат (описан в tools/validate_content.py):
//   ## Заголовок   ### Подзаголовок   - список   1. список   | таблица |
//   > English — перевод      !! совет      ⚠ ошибка → правильно
//   **жирный**  *курсив*  `код`

export type MarkdownBlock =
  | { kind: "heading"; level: 3 | 4; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "examples"; items: { en: string; ru: string | null }[] }
  | { kind: "tip"; lines: string[] }
  | { kind: "mistakes"; items: { wrong: string; right: string | null }[] }
  | { kind: "table"; header: string[]; rows: string[][] };

interface GroupRule {
  test: (line: string) => boolean;
  build: (lines: string[]) => MarkdownBlock;
}

const GROUPS: GroupRule[] = [
  {
    test: line => line.startsWith(">"),
    build: lines => ({
      kind: "examples",
      items: lines.map(line => {
        const [en, ...ru] = line.replace(/^>\s?/, "").split(/\s+[—–]\s+/);
        return { en, ru: ru.length ? ru.join(" — ") : null };
      }),
    }),
  },
  { test: line => line.startsWith("!!"), build: lines => ({ kind: "tip", lines: lines.map(l => l.replace(/^!!\s?/, "")) }) },
  {
    test: line => line.startsWith("⚠"),
    build: lines => ({
      kind: "mistakes",
      items: lines.map(line => {
        const [wrong, ...right] = line.replace(/^⚠\s?/, "").split(/\s*→\s*/);
        return { wrong, right: right.length ? right.join(" → ") : null };
      }),
    }),
  },
  {
    test: line => line.startsWith("|"),
    build: lines => {
      const cells = lines
        .filter(line => !/^[\s|:-]+$/.test(line))                         // строка-разделитель |---|---|
        .map(line => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim()));
      return { kind: "table", header: cells[0] ?? [], rows: cells.slice(1) };
    },
  },
  { test: line => /^[-*•]\s/.test(line), build: lines => ({ kind: "list", ordered: false, items: lines.map(l => l.replace(/^[-*•]\s/, "")) }) },
  { test: line => /^\d+[.)]\s/.test(line), build: lines => ({ kind: "list", ordered: true, items: lines.map(l => l.replace(/^\d+[.)]\s/, "")) }) },
];

const isSpecial = (line: string) => line.startsWith("#") || GROUPS.some(g => g.test(line));

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n").map(line => line.trim());
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }

    if (line.startsWith("### ")) { blocks.push({ kind: "heading", level: 4, text: line.slice(4) }); i++; continue; }
    if (/^##? /.test(line)) { blocks.push({ kind: "heading", level: 3, text: line.replace(/^##? /, "") }); i++; continue; }

    const group = GROUPS.find(g => g.test(line));
    if (group) {
      const groupLines: string[] = [];
      while (i < lines.length && lines[i] && group.test(lines[i])) groupLines.push(lines[i++]);
      blocks.push(group.build(groupLines));
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i] && !isSpecial(lines[i])) paragraph.push(lines[i++]);
    blocks.push({ kind: "paragraph", lines: paragraph });
  }
  return blocks;
}

/** Жирный, курсив, код → HTML. Сначала экранируем HTML, поэтому результат безопасен для v-html. */
export function inlineToHtml(text: string): string {
  return text
    .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

/** Текст без разметки — для озвучки примеров. */
export function plainText(text: string): string {
  return text.replace(/\*\*|\*|`/g, "");
}
