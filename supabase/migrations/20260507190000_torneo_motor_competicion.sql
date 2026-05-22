alter table public.configuracion_torneo
  add column if not exists criterios_desempate jsonb default '["goal_difference","goals_for","wins"]'::jsonb,
  add column if not exists fairplay_falta_pts integer default 1,
  add column if not exists fairplay_amarilla_pts integer default 3,
  add column if not exists fairplay_roja_pts integer default 5,
  add column if not exists fairplay_roja_agresion_pts integer default 10,
  add column if not exists champions_direct_positions text default '1',
  add column if not exists champions_best_seconds integer default 0,
  add column if not exists champions_best_thirds integer default 0,
  add column if not exists europa_direct_positions text default '',
  add column if not exists europa_best_seconds integer default 0,
  add column if not exists europa_best_thirds integer default 0,
  add column if not exists conference_direct_positions text default '',
  add column if not exists conference_best_seconds integer default 0,
  add column if not exists conference_best_thirds integer default 0;

alter table public.partidos
  add column if not exists faltas_local integer default 0,
  add column if not exists faltas_visitante integer default 0,
  add column if not exists amarillas_local integer default 0,
  add column if not exists amarillas_visitante integer default 0,
  add column if not exists rojas_local integer default 0,
  add column if not exists rojas_visitante integer default 0,
  add column if not exists rojas_agresion_local integer default 0,
  add column if not exists rojas_agresion_visitante integer default 0;
