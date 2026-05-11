-- Identificador del tutor en texto (resguardo correo/PDF), ademas de las fotos del DNI en storage.
alter table public.jugadores
  add column if not exists tutor_dni text;

comment on column public.jugadores.tutor_dni is 'DNI/NIE del tutor tal como lo indica en el formulario (menores); resguardo formal junto a imagenes.';
