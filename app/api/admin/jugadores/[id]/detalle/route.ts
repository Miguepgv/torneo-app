import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/server/require-admin";

const SIGNED_URL_TTL_SEC = 60 * 60;

async function signedImageUrl(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path.trim(), SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const { id: jugadorId } = await context.params;
  if (!jugadorId) {
    return NextResponse.json({ error: "Falta id de jugador." }, { status: 400 });
  }

  const admin = createClient(gate.url, gate.serviceRoleKey);
  const { data: row, error: qErr } = await admin
    .from("jugadores")
    .select(
      `
      id,
      nombre,
      apellidos,
      alias,
      fecha_nacimiento,
      es_menor,
      foto_url,
      dni_delante,
      dni_detras,
      dni_tutor_delante,
      dni_tutor_detras,
      tutor_email,
      tutor_telefono,
      tutor_dni,
      consentimiento_firma,
      consentimiento_aceptado_at,
      consentimiento_ip,
      consentimiento_user_agent,
      consentimiento_legal_version,
      consentimiento_legal_texto,
      tutor_correo_enviado_at,
      equipo_id,
      equipos ( id, nombre, codigo_inscripcion )
    `,
    )
    .eq("id", jugadorId)
    .maybeSingle();

  if (qErr || !row) {
    return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });
  }

  const r = row as {
    id: string;
    nombre: string;
    apellidos: string;
    alias: string | null;
    fecha_nacimiento: string | null;
    es_menor: boolean | null;
    foto_url: string | null;
    dni_delante: string | null;
    dni_detras: string | null;
    dni_tutor_delante: string | null;
    dni_tutor_detras: string | null;
    tutor_email: string | null;
    tutor_telefono: string | null;
    tutor_dni: string | null;
    consentimiento_firma: string | null;
    consentimiento_aceptado_at: string | null;
    consentimiento_ip: string | null;
    consentimiento_user_agent: string | null;
    consentimiento_legal_version: string | null;
    consentimiento_legal_texto: string | null;
    tutor_correo_enviado_at: string | null;
    equipo_id: string;
    equipos: { id: string; nombre: string; codigo_inscripcion: string } | null;
  };

  const [dniDelanteUrl, dniDetrasUrl, dniTutorDelanteUrl, dniTutorDetrasUrl] = await Promise.all([
    signedImageUrl(admin, "dnis_privados", r.dni_delante),
    signedImageUrl(admin, "dnis_privados", r.dni_detras),
    signedImageUrl(admin, "dnis_privados", r.dni_tutor_delante),
    signedImageUrl(admin, "dnis_privados", r.dni_tutor_detras),
  ]);

  return NextResponse.json({
    ok: true,
    jugador: {
      id: r.id,
      nombre: r.nombre,
      apellidos: r.apellidos,
      alias: r.alias,
      fechaNacimiento: r.fecha_nacimiento,
      esMenor: Boolean(r.es_menor),
      fotoUrl: r.foto_url,
      tutorEmail: r.tutor_email,
      tutorTelefono: r.tutor_telefono,
      tutorDni: r.tutor_dni,
      firma: r.consentimiento_firma,
      aceptadoAt: r.consentimiento_aceptado_at,
      ip: r.consentimiento_ip,
      userAgent: r.consentimiento_user_agent,
      legalVersion: r.consentimiento_legal_version,
      legalTexto: r.consentimiento_legal_texto,
      tutorCorreoEnviadoAt: r.tutor_correo_enviado_at,
      equipo: r.equipos,
      equipoId: r.equipo_id,
      imagenes: {
        dniDelante: dniDelanteUrl,
        dniDetras: dniDetrasUrl,
        dniTutorDelante: dniTutorDelanteUrl,
        dniTutorDetras: dniTutorDetrasUrl,
      },
      imagenesFaltan: {
        dniDelante: Boolean(r.dni_delante && !dniDelanteUrl),
        dniDetras: Boolean(r.dni_detras && !dniDetrasUrl),
        dniTutorDelante: Boolean(r.dni_tutor_delante && !dniTutorDelanteUrl),
        dniTutorDetras: Boolean(r.dni_tutor_detras && !dniTutorDetrasUrl),
      },
    },
    urlsExpiranEnSegundos: SIGNED_URL_TTL_SEC,
  });
}
