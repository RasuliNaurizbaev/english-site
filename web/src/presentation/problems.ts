// Список сбоев для предупреждения вверху страницы + «поломка нарочно» для проверки защиты.
import { reactive } from "vue";

export const problems = reactive<{ list: string[]; hidden: boolean }>({ list: [], hidden: false });

export function reportProblem(where: string, error: unknown): void {
  console.error("[" + where + "]", error);
  if (!problems.list.includes(where)) problems.list.push(where);
  problems.hidden = false;
}

// Для проверки: index.html?break=player,markdown — эти части «сломаются» при запуске
const brokenOnPurpose = new URLSearchParams(location.search).get("break")?.split(",") ?? [];

/** Вызывается в начале компонента: если его попросили сломать — бросает ошибку. */
export function breakIfRequested(name: string): void {
  if (brokenOnPurpose.includes(name)) throw new Error(`сломано нарочно (?break=${name})`);
}
