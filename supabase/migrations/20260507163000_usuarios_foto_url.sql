alter table public.usuarios
  add column if not exists foto_url text;

comment on column public.usuarios.foto_url is 'URL pública de la foto de perfil del delegado.';
