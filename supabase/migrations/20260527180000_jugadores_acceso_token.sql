-- Enlace privado para que cada jugador consulte sus datos (DNI, fotos, consentimiento).
alter table public.jugadores
  add column if not exists acceso_token text;

create unique index if not exists jugadores_acceso_token_key
  on public.jugadores (acceso_token)
  where acceso_token is not null;

comment on column public.jugadores.acceso_token is 'Token secreto en URL /mis-datos/[token] para consultar los propios datos.';
