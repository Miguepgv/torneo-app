create table if not exists public.pistas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table public.partidos
  add column if not exists slot_local text,
  add column if not exists slot_visitante text;
