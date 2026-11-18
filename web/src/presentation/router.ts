// Адреса страниц. Используется «хеш»-режим (#/story/...): работает на любом статическом хостинге
// без настройки сервера и при открытии с локального сервера на телефоне.
//
// Страницы загружаются лениво (отдельными файлами): если одна не загрузится, остальные работают.
import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

declare module "vue-router" {
  interface RouteMeta {
    tab: "today" | "stories" | "words" | "grammar" | "audio";
    reader?: boolean;            // показать настройки чтения в шапке
  }
}

const routes: RouteRecordRaw[] = [
  { path: "/", name: "today", component: () => import("./pages/TodayPage.vue"), meta: { tab: "today" } },
  { path: "/review", name: "review", component: () => import("./pages/ReviewPage.vue"), meta: { tab: "today" } },
  { path: "/stories", name: "stories", component: () => import("./pages/StoriesPage.vue"), meta: { tab: "stories" } },
  { path: "/story/:id", name: "story", component: () => import("./pages/StoryPage.vue"), props: true, meta: { tab: "stories", reader: true } },
  { path: "/words/:level?", name: "words", component: () => import("./pages/WordsPage.vue"), props: true, meta: { tab: "words" } },
  { path: "/grammar", name: "grammar", component: () => import("./pages/GrammarListPage.vue"), meta: { tab: "grammar" } },
  { path: "/grammar/:id", name: "grammarTopic", component: () => import("./pages/GrammarTopicPage.vue"), props: true, meta: { tab: "grammar" } },
  { path: "/audio/:level?", name: "audio", component: () => import("./pages/AudioPage.vue"), props: true, meta: { tab: "audio" } },
  { path: "/:pathMatch(.*)*", name: "notFound", component: () => import("./pages/NotFoundPage.vue"), meta: { tab: "today" } },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
