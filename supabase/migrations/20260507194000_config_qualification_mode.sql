alter table public.configuracion_torneo
  add column if not exists qualification_mode text default 'advanced';
