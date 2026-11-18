// Доступ к сервисам приложения из любого компонента: const { content, review } = useServices();
import { inject, type InjectionKey } from "vue";
import type { Services } from "@/application/services";

export const SERVICES: InjectionKey<Services> = Symbol("services");

export function useServices(): Services {
  const services = inject(SERVICES);
  if (!services) throw new Error("Сервисы не переданы (app.provide(SERVICES, ...) в main.ts)");
  return services;
}
