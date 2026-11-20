<!-- Вход: имя + пароль (аккаунт создаёт админ). Без входа сайт работает как у гостя — прогресс только в этом браузере. -->
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useSession } from "../composables/useSession";

const router = useRouter();
const { session, signIn, signInWithCode, signOut } = useSession();
const username = ref("");
const password = ref("");
const code = ref("");
const useCode = ref(false);
const message = ref("");
const busy = ref(false);

const ROLE_LABEL: Record<string, string> = { admin: "админ", user: "пользователь", code: "вход по коду доступа" };

async function submit() {
  message.value = "";
  busy.value = true;
  try {
    if (useCode.value) await signInWithCode(code.value.trim());
    else await signIn(username.value.trim(), password.value);
    password.value = code.value = "";
    router.push("/");
  } catch (error) {
    message.value = "⚠ " + (error instanceof Error ? error.message : String(error));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1>Вход</h1>
  <p v-if="session === undefined" class="muted">Проверяю…</p>
  <p v-else-if="session === null" class="problem-note">Сервер сайта недоступен (локальный запуск без Worker'а?) — вход невозможен, сайт работает как у гостя.</p>

  <div v-else-if="session.user" class="task-box login-box">
    <p>Вы вошли: <b class="login-name">{{ session.user }}</b> <span class="badge plain">{{ ROLE_LABEL[session.role ?? ""] ?? "" }}</span></p>
    <button class="small" @click="signOut">Выйти</button>
  </div>

  <form v-else class="task-box login-box" @submit.prevent="submit">
    <template v-if="!useCode">
      <label class="login-field">Имя <span class="muted">(регистр важен: Rasul и rasul — разные)</span>
        <input v-model="username" class="search" autocomplete="username" autocapitalize="off" spellcheck="false" required>
      </label>
      <label class="login-field">Пароль
        <input v-model="password" class="search" type="password" autocomplete="current-password" required>
      </label>
    </template>
    <label v-else class="login-field">Код доступа
      <input v-model="code" class="search" type="password" autocomplete="current-password" required>
    </label>
    <button class="primary" type="submit" :disabled="busy">{{ busy ? "Вхожу…" : "Войти" }}</button>
    <p v-if="message" class="my-word-message">{{ message }}</p>
    <p class="muted small-note">
      Аккаунт создаёт админ; забыли пароль — новый задаст админ.
      Без входа сайт работает как у гостя: прогресс хранится только в этом браузере, AI — со своим ключом.
    </p>
    <button type="button" class="link-button" @click="useCode = !useCode; message = ''">
      {{ useCode ? "← Войти по имени и паролю" : "Войти по коду доступа (старый способ)" }}
    </button>
  </form>
</template>
