alter table public.configuracion_torneo
  add column if not exists conference_best_fourths integer default 0,
  add column if not exists conference_best_fifths integer default 0;
