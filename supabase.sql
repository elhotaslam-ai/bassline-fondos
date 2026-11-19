-- Bassline · lista de espera de la beta (tabla bassline_waitlist)
-- Ejecutar en Supabase: SQL Editor → New query → Run.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.

-- 0. Tabla (solo se crea si no existe)
create table if not exists public.bassline_waitlist (
  id bigint generated always as identity primary key,
  email text,
  name text,
  consent boolean not null default false,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 1. Columnas que usa la web (por si la tabla ya existía con otra forma)
alter table public.bassline_waitlist add column if not exists email text;
alter table public.bassline_waitlist add column if not exists name text;
alter table public.bassline_waitlist add column if not exists consent boolean not null default false;
alter table public.bassline_waitlist add column if not exists consent_at timestamptz not null default now();
alter table public.bassline_waitlist add column if not exists created_at timestamptz not null default now();

-- 2. Evita emails duplicados (sin distinguir mayúsculas)
create unique index if not exists bassline_waitlist_email_key
  on public.bassline_waitlist (lower(email));

-- 3. Activa la seguridad por filas
alter table public.bassline_waitlist enable row level security;

-- 4. La web solo puede INSERTAR (nadie puede leer la lista desde fuera)
drop policy if exists "anon insert waitlist" on public.bassline_waitlist;
create policy "anon insert waitlist"
  on public.bassline_waitlist
  for insert
  to anon
  with check (
    email is not null
    and length(email) <= 254
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and name is not null
    and length(trim(name)) between 1 and 80
    and consent = true
  );

-- 5. anon solo puede escribir name, email y consent
--    (id, consent_at y created_at los rellena siempre la base de datos)
revoke insert on public.bassline_waitlist from anon;
grant insert (name, email, consent) on public.bassline_waitlist to anon;
