alter table public.configuracion_torneo
  add column if not exists total_equipos integer default 16;
