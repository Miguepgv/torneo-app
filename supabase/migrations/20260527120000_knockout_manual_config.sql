alter table public.configuracion_torneo
  add column if not exists knockout_manual_config jsonb;
