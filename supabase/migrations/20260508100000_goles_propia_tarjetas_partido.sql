-- Gol en propia meta (suma para el rival)
alter table public.goles
  add column if not exists propia_meta boolean not null default false;

comment on column public.goles.propia_meta is 'Si es verdadero el gol cuenta para el rival del equipo del jugador.';

create table if not exists public.tarjetas_partido (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos (id) on delete cascade,
  jugador_id uuid not null references public.jugadores (id) on delete cascade,
  equipo_id uuid not null references public.equipos (id) on delete cascade,
  tipo text not null check (tipo in ('amarilla', 'doble_amarilla', 'roja', 'roja_agresion')),
  created_at timestamptz not null default now()
);

create index if not exists tarjetas_partido_partido_id_idx on public.tarjetas_partido (partido_id);

comment on table public.tarjetas_partido is 'Incidencias de tarjeta por jugador en un partido; los totales fair play en partidos se recalculan desde aquí.';

