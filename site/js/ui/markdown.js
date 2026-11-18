// Превращает текст теории грамматики (мини-markdown) в HTML.
//
// Поддерживается (формат описан в tools/validate_content.py):
//   ## Заголовок   ### Подзаголовок   - список   1. список   | таблица |
//   > English — перевод   (блок примеров, с кнопкой 🔊)
//   !! совет               ⚠ ошибка → правильно
//   **жирный**  *курсив*  `код`
App.module("markdown", function () {
  "use strict";

  const { el } = App.dom;

  function escapeHtml(text) {
    return text.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /** Жирный, курсив, код — внутри строки. Сначала экранируем HTML, поэтому это безопасно. */
  function inline(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }

  function htmlElement(tag, className, text) {
    const node = el(tag, className);
    node.innerHTML = inline(text);
    return node;
  }

  // ---------- блоки: каждый получает строки, которые начинаются с его маркера ----------

  function exampleBlock(lines) {
    const box = el("div", "examples");
    lines.forEach(line => {
      const [english, ...translation] = line.replace(/^>\s?/, "").split(/\s+[—–]\s+/);
      const row = el("div", "ex", [htmlElement("span", "ex-en", english)]);
      if (translation.length) row.append(htmlElement("span", "ex-ru", translation.join(" — ")));
      const plain = english.replace(/\*\*|\*|`/g, "");
      if (/[a-z]/i.test(plain)) row.append(App.speech.speakButton(plain));
      box.append(row);
    });
    return box;
  }

  function tipBlock(lines) {
    const box = el("div", "tip");
    box.innerHTML = "💡 " + lines.map(line => inline(line.replace(/^!!\s?/, ""))).join("<br>");
    return box;
  }

  function mistakesBlock(lines) {
    const box = el("div", "mistakes");
    lines.forEach(line => {
      const [wrong, ...right] = line.replace(/^⚠\s?/, "").split(/\s*→\s*/);
      const row = el("div", "mistake");
      if (right.length) row.append(htmlElement("span", "wrong", wrong), el("span", "arrow", "→"), htmlElement("span", "rightans", right.join(" → ")));
      else row.innerHTML = inline(wrong);
      box.append(row);
    });
    return box;
  }

  function tableBlock(lines) {
    const table = el("table");
    lines
      .filter(line => !/^[\s|:-]+$/.test(line))          // строка-разделитель |---|---|
      .forEach((line, rowIndex) => {
        const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|");
        table.append(el("tr", "", cells.map(cell => htmlElement(rowIndex === 0 ? "th" : "td", "", cell.trim()))));
      });
    return el("div", "table-wrap", [table]);
  }

  function listBlock(lines, ordered) {
    const marker = ordered ? /^\d+[.)]\s/ : /^[-*•]\s/;
    return el(ordered ? "ol" : "ul", "", lines.map(line => htmlElement("li", "", line.replace(marker, ""))));
  }

  // ---------- разбор текста ----------

  const BLOCKS = [
    { test: line => line.startsWith(">"), render: exampleBlock },
    { test: line => line.startsWith("!!"), render: tipBlock },
    { test: line => line.startsWith("⚠"), render: mistakesBlock },
    { test: line => line.startsWith("|"), render: tableBlock },
    { test: line => /^[-*•]\s/.test(line), render: lines => listBlock(lines, false) },
    { test: line => /^\d+[.)]\s/.test(line), render: lines => listBlock(lines, true) },
  ];
  const isSpecial = line => /^#/.test(line) || BLOCKS.some(block => block.test(line));

  function render(source) {
    const root = el("div", "md");
    const lines = source.replace(/\r\n/g, "\n").split("\n").map(line => line.trim());
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line) { i++; continue; }

      if (line.startsWith("### ")) { root.append(htmlElement("h4", "", line.slice(4))); i++; continue; }
      if (/^##? /.test(line)) { root.append(htmlElement("h3", "", line.replace(/^##? /, ""))); i++; continue; }

      // Блок из нескольких строк одного вида подряд
      const block = BLOCKS.find(b => b.test(line));
      if (block) {
        const group = [];
        while (i < lines.length && lines[i] && block.test(lines[i])) group.push(lines[i++]);
        root.append(block.render(group));
        continue;
      }

      // Обычный абзац: строки до пустой строки или до особого блока
      const paragraph = [];
      while (i < lines.length && lines[i] && !isSpecial(lines[i])) paragraph.push(lines[i++]);
      const p = el("p");
      p.innerHTML = paragraph.map(inline).join("<br>");
      root.append(p);
    }
    return root;
  }

  return { render };
});
