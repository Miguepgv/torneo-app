-- Ejecutar en Supabase SQL Editor si aún no existe la columna.
alter table public.usuarios
  add column if not exists apellidos text;

comment on column public.usuarios.apellidos is 'Apellidos del usuario (delegado, etc.).';
