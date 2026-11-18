<!--
  Корень приложения: шапка, предупреждение о сбоях и текущая страница.
  Каждая страница обёрнута в SafeSection: если она упадёт, остальные вкладки работают.
-->
<script setup lang="ts">
import { useRoute } from "vue-router";
import AppHeader from "./presentation/components/AppHeader.vue";
import ProblemBanner from "./presentation/components/ProblemBanner.vue";
import SafeSection from "./presentation/components/SafeSection.vue";

const route = useRoute();
</script>

<template>
  <ProblemBanner />
  <SafeSection title="Шапка сайта" silent>
    <AppHeader />
  </SafeSection>
  <main>
    <RouterView v-slot="{ Component }">
      <!-- key: при переходе на другую страницу «сломанное» состояние сбрасывается -->
      <SafeSection :key="route.fullPath" title="Этот раздел">
        <component :is="Component" v-if="Component" />
      </SafeSection>
    </RouterView>
  </main>
</template>
