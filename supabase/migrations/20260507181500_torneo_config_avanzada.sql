alter table public.equipos
  add column if not exists grupo text;

alter table public.configuracion_torneo
  add column if not exists total_grupos integer default 1,
  add column if not exists clasifica_champions integer default 0,
  add column if not exists clasifica_europa integer default 0,
  add column if not exists clasifica_conference integer default 0,
  add column if not exists desempate_1 text default 'goal_difference',
  add column if not exists desempate_2 text default 'goals_for',
  add column if not exists desempate_3 text default 'wins',
  add column if not exists excluir_ultimo_grupo_mayor boolean default true,
  add column if not exists limite_cambios_hasta timestamptz;
