// Кого спрашивать AI: серверные ключи (если вошли по коду), иначе свои ключи из браузера.
import { ref } from "vue";
import { normalizeSettings, providersInOrder, type AiProvider } from "@/data/ai/aiProvider";
import { loadSession, serverProviders, type ServerSession } from "@/data/ai/serverAi";
import type { ProgressRepository } from "@/data/progressRepository";

export function useAiProviders(progress: ProgressRepository) {
  const session = ref<ServerSession | null | undefined>(undefined);     // undefined — ещё не спросили сервер
  async function providers(): Promise<AiProvider[]> {
    if (session.value === undefined) session.value = await loadSession();
    const server = serverProviders(session.value);
    return server.length ? server : providersInOrder(normalizeSettings(progress.setting("ai", {})));
  }
  return { providers };
}
