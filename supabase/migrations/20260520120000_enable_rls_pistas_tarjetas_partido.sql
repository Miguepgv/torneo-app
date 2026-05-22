-- RLS para tablas expuestas por PostgREST (avisos del linter de Supabase).
-- La app accede a estas tablas con service_role en rutas /api/admin/* (bypass RLS).
-- Las políticas bloquean acceso directo con anon key salvo lectura de pistas.

create or replace function public.is_tournament_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.rol in ('admin', 'director_campo')
  );
$$;

comment on function public.is_tournament_staff() is
  'True si el usuario autenticado es admin o director de campo.';

alter table public.pistas enable row level security;
alter table public.tarjetas_partido enable row level security;

-- Pistas: nombres de canchas (dato de referencia, lectura publica).
drop policy if exists "pistas_select_public" on public.pistas;
create policy "pistas_select_public"
  on public.pistas
  for select
  to anon, authenticated
  using (true);

drop policy if exists "pistas_staff_write" on public.pistas;
create policy "pistas_staff_write"
  on public.pistas
  for all
  to authenticated
  using (public.is_tournament_staff())
  with check (public.is_tournament_staff());

-- Tarjetas por partido: solo personal del torneo (no lectura anon).
drop policy if exists "tarjetas_partido_staff_all" on public.tarjetas_partido;
create policy "tarjetas_partido_staff_all"
  on public.tarjetas_partido
  for all
  to authenticated
  using (public.is_tournament_staff())
  with check (public.is_tournament_staff());
