// Точка входа: загрузить контент, создать сервисы, запустить Vue.
//
// Слои (каждый зависит только от слоёв выше по списку):
//   domain/        типы и логика без Vue: интервальное повторение, формы слов, задания, разбор теории
//   data/          хранилище, загрузка контента, прогресс, адрес аудио
//   application/   сценарии: очередь повторения, план на день
//   presentation/  Vue: страницы, компоненты, composables, роутер
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./presentation/router";
import { SERVICES } from "./presentation/composables/useServices";
import { reportProblem } from "./presentation/problems";
import { loadContent } from "./data/contentRepository";
import { createBrowserStorage } from "./data/storage";
import { createServices } from "./application/services";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/mobile.css";

async function start() {
  const storage = createBrowserStorage();
  const { content, problems } = await loadContent();
  problems.forEach(p => reportProblem(p.what, p.error));
  if (!storage.persistent) reportProblem("сохранение прогресса (браузер запретил хранилище)", null);

  const app = createApp(App);
  app.provide(SERVICES, createServices(content, storage));
  app.use(router);

  // Ошибки, которые не поймала ни одна SafeSection, — только предупреждение, сайт продолжает работать
  app.config.errorHandler = (error, _instance, info) => reportProblem("интерфейс (" + info + ")", error);
  window.addEventListener("unhandledrejection", event => reportProblem("фоновая операция", event.reason));
  // Страница не загрузилась (например, нет сети) — сообщение вместо пустого экрана
  router.onError(error => reportProblem("загрузка страницы", error));

  app.mount("#app");
}

start().catch(error => {
  document.getElementById("app")!.innerHTML =
    '<div class="error-box">⚠ Сайт не смог запуститься. Обновите страницу. Подробности — в консоли браузера.</div>';
  console.error(error);
});
