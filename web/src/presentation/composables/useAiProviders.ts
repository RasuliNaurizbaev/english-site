// Кого спрашивать AI: серверные ключи (если вошли), иначе свои ключи из браузера.
import { normalizeSettings, providersInOrder, type AiProvider } from "@/data/ai/aiProvider";
import { serverProviders } from "@/data/ai/serverAi";
import type { ProgressRepository } from "@/data/progressRepository";
import { useSession } from "./useSession";

export function useAiProviders(progress: ProgressRepository) {
  const { ready } = useSession();
  async function providers(): Promise<AiProvider[]> {
    const server = serverProviders(await ready());
    return server.length ? server : providersInOrder(normalizeSettings(progress.setting("ai", {})));
  }
  return { providers };
}
