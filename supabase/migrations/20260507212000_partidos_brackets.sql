alter table public.partidos
  add column if not exists competicion text,
  add column if not exists ronda text,
  add column if not exists orden integer;
