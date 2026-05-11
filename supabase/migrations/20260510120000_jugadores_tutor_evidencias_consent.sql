-- Tutor contacto, evidencias electronicas del consentimiento y envio de correo al tutor (menores).

alter table public.jugadores
  add column if not exists tutor_email text,
  add column if not exists tutor_telefono text,
  add column if not exists consentimiento_ip text,
  add column if not exists consentimiento_user_agent text,
  add column if not exists consentimiento_legal_version text,
  add column if not exists consentimiento_legal_texto text,
  add column if not exists tutor_correo_enviado_at timestamptz;

comment on column public.jugadores.tutor_email is 'Correo del tutor (obligatorio si es menor); recibe resguardo de inscripcion.';
comment on column public.jugadores.tutor_telefono is 'Telefono de contacto urgencias del tutor (obligatorio si es menor).';
comment on column public.jugadores.consentimiento_ip is 'IP del cliente al completar inscripcion (evidencia).';
comment on column public.jugadores.consentimiento_user_agent is 'User-Agent del navegador al completar inscripcion.';
comment on column public.jugadores.consentimiento_legal_version is 'Clave de version del texto legal aceptado (p. ej. 2026-02-v1).';
comment on column public.jugadores.consentimiento_legal_texto is 'Copia literal del texto legal mostrado y aceptado en ese momento.';
comment on column public.jugadores.tutor_correo_enviado_at is 'Si se envio correo al tutor con Resend; null si no hubo envio.';
