// Создание HTML-элементов в одну строку.
App.module("dom", function () {
  "use strict";

  /**
   * el("div", "card", "Текст")            → <div class="card">Текст</div>
   * el("a", "link", "Открыть", { href })  → с атрибутами/свойствами
   * el("div", "row", [child1, child2])    → с дочерними элементами
   */
  function el(tag, className, content, props) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (Array.isArray(content)) content.forEach(child => child != null && node.append(child));
    else if (content !== undefined && content !== null) node.textContent = content;
    if (props) Object.assign(node, props);
    return node;
  }

  /** Цветная метка: badge("A2", "A2") */
  function badge(text, className) {
    return el("span", "badge " + className, text);
  }

  function link(className, text, href) {
    return el("a", className, text, { href });
  }

  function button(className, text, onClick) {
    const node = el("button", className, text);
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  /** Переключатель вариантов: segmented([["5","5"],["10","10"]], "10", value => ...) */
  function segmented(options, activeValue, onSelect, className) {
    const box = el("div", "segmented" + (className ? " " + className : ""));
    options.forEach(([value, label]) => {
      const btn = button(value === activeValue ? "active" : "", label, () => {
        box.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
        onSelect(value);
      });
      box.append(btn);
    });
    return box;
  }

  /** Полоса прогресса: progressBar([{ value: 0.4, className: "mature" }]) */
  function progressBar(parts, className) {
    const bar = el("div", "progress" + (className ? " " + className : ""));
    parts.forEach(part => {
      const fill = el("i", part.className || "");
      fill.style.width = Math.round(part.value * 100) + "%";
      bar.append(fill);
    });
    return bar;
  }

  return { el, badge, link, button, segmented, progressBar };
});
