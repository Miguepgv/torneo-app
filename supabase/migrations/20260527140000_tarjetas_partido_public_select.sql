-- Lectura pública de incidencias (tarjetas) para la página /incidencias.
drop policy if exists "tarjetas_partido_select_public" on public.tarjetas_partido;
create policy "tarjetas_partido_select_public"
  on public.tarjetas_partido
  for select
  to anon, authenticated
  using (true);
