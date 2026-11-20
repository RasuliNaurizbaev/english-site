// Кто вошёл — одно состояние на весь сайт (шапка, страница входа, AI, озвучка).
// undefined — ещё спрашиваем сервер; null — сервера нет (npm run dev без Worker'а); { user: null } — гость.
import { ref } from "vue";
import { loadSession, loginWithCode, loginWithPassword, logout, type ServerSession } from "@/data/ai/serverAi";

const session = ref<ServerSession | null | undefined>(undefined);
let loading: Promise<ServerSession | null> | null = null;

async function refresh(): Promise<ServerSession | null> {
  loading = loadSession();
  session.value = await loading;
  return session.value;
}

/** Состояние, загруженное один раз (повторные вызовы ждут ту же загрузку). */
async function ready(): Promise<ServerSession | null> {
  if (session.value !== undefined) return session.value;
  return loading ?? refresh();
}

export function useSession() {
  if (session.value === undefined && !loading) void refresh();
  return {
    session,
    ready,
    refresh,
    async signIn(username: string, password: string) { session.value = await loginWithPassword(username, password); },
    async signInWithCode(code: string) { session.value = await loginWithCode(code); },
    async signOut() {
      try { session.value = await logout(); } catch { session.value = { user: null, role: null, services: [] }; }
    },
  };
}
