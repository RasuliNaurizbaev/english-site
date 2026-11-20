-- 001 · Аккаунты: пользователи, сессии, защита от перебора паролей, ключи AI, дневные лимиты.
-- Правила миграций (HANDOFF → «Изменения структуры базы»): файл после применения не меняется; новые изменения — новым файлом;
-- столбцы только добавляются (с default/null), удаление и переименование — отдельной миграцией позже.
--
-- Доступ: только Worker сайта с секретным ключом (роль service_role обходит RLS).
-- RLS включён везде и политик нет → публичный ключ (anon) и вошедшие через Supabase Auth (authenticated) не видят ничего.

-- ---------------------------------------------------------------- updated_at сам обновляется при изменении строки
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- пользователи
-- username с учётом регистра: Rasul и rasul — разные имена (обычный unique для text различает регистр).
create table public.users (
  id                  bigint generated always as identity primary key,
  username            text not null unique check (username ~ '^[A-Za-z0-9_]{3,32}$'),
  password_hash       text not null,                       -- PBKDF2-SHA256, base64
  password_salt       text not null,                       -- своя соль у каждого, base64
  password_iterations integer not null check (password_iterations > 0),
  role                text not null default 'user' check (role in ('user', 'admin')),
  last_login_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  extra               jsonb not null default '{}'          -- запасное поле для новых данных без миграции
);
create trigger users_updated_at before update on public.users for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- сессии (вход помнится 30 дней)
-- В cookie — случайный токен; здесь только его хеш (SHA-256): утечка таблицы не даёт войти.
create table public.sessions (
  token_hash   text primary key,
  user_id      bigint not null references public.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_expires_at_idx on public.sessions (expires_at);

-- ---------------------------------------------------------------- неудачные входы (защита от перебора)
-- key: 'user:<username>' или 'ip:<хеш IP>'. После нескольких ошибок — пауза до locked_until.
create table public.login_attempts (
  key             text primary key,
  failures        integer not null default 0,
  last_failure_at timestamptz not null default now(),
  locked_until    timestamptz
);

-- ---------------------------------------------------------------- ключи AI пользователей
-- mode own    — свой ключ (вписал пользователь в профиле или админ), хранится зашифрованным (AES-GCM, ключ — секрет Worker'а KEYS_SECRET);
-- mode shared — общий ключ сайта (секреты Worker'а GEMINI_API_KEY / GROQ_API_KEY), выдаёт админ.
create table public.user_ai_keys (
  user_id       bigint not null references public.users (id) on delete cascade,
  service       text not null check (service in ('gemini', 'groq')),
  mode          text not null check (mode in ('own', 'shared')),
  key_encrypted text,                                      -- только для own
  key_hint      text,                                      -- последние 4 символа — показать в профиле/админке
  set_by        text not null check (set_by in ('user', 'admin')),
  updated_at    timestamptz not null default now(),
  primary key (user_id, service),
  check ((mode = 'own') = (key_encrypted is not null))
);
create trigger user_ai_keys_updated_at before update on public.user_ai_keys for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- дневные лимиты
-- subject: 'user:<id>' или 'guest:<хеш IP>'; day — номер дня (как dayNumber на сайте); kind: ai_test (5/день), tts (300 / гость 50).
create table public.usage (
  subject    text not null,
  day        integer not null,
  kind       text not null check (kind in ('ai_test', 'tts')),
  count      integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject, day, kind)
);

-- Атомарно потратить amount из лимита: новое значение счётчика или null, если лимит превышен (тогда ничего не меняется).
-- Одна операция в базе — два одновременных запроса не обойдут лимит.
create function public.use_quota(p_subject text, p_day integer, p_kind text, p_amount integer, p_limit integer)
returns integer
language plpgsql set search_path = '' as $$
declare
  result integer;
begin
  if p_amount <= 0 or p_amount > p_limit then
    return null;
  end if;
  insert into public.usage as u (subject, day, kind, count)
  values (p_subject, p_day, p_kind, p_amount)
  on conflict (subject, day, kind) do update
    set count = u.count + excluded.count, updated_at = now()
    where u.count + excluded.count <= p_limit
  returning u.count into result;
  return result;
end $$;

-- ---------------------------------------------------------------- доступ: только service_role (Worker)
alter table public.users          enable row level security;
alter table public.sessions       enable row level security;
alter table public.login_attempts enable row level security;
alter table public.user_ai_keys   enable row level security;
alter table public.usage          enable row level security;

revoke all on public.users, public.sessions, public.login_attempts, public.user_ai_keys, public.usage from anon, authenticated;
revoke all on function public.use_quota(text, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.use_quota(text, integer, text, integer, integer) to service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;
