-- 002 · Права для Worker'а (роль service_role — секретный ключ).
-- В новых проектах Supabase таблицы не открываются для REST API автоматически — права нужно выдать явно
-- (иначе: «permission denied for table … current role service_role»). anon/authenticated по-прежнему без прав.

grant usage on schema public to service_role;
grant select, insert, update, delete on public.users, public.sessions, public.login_attempts, public.user_ai_keys, public.usage to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Таблицы и последовательности из будущих миграций (их создаёт та же роль, что применяет миграции) — сразу с правами для service_role.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
