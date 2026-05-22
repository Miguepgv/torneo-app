alter table public.jugadores
  add column if not exists foto_url text;

comment on column public.jugadores.foto_url is 'URL pública de foto de perfil del jugador.';
