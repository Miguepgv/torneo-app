import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SIGNED_URL_TTL_SEC = 3600;

type JugadorDocsRow = {
  id: string;
  equipo_id: string;
  foto_url: string | null;
  dni_delante: string | null;
  dni_detras: string | null;
  dni_tutor_delante: string | null;
  dni_tutor_detras: string | null;
  es_menor: boolean | null;
  equipos: { delegado_id: string | null } | { delegado_id: string | null }[] | null;
};

async function signedUrl(
  admin: ReturnType<typeof createClient>,
  path: string | null,
): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data, error } = await admin.storage
    .from("dnis_privados")
    .createSignedUrl(path.trim(), SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: jugadorId } = await context.params;
  if (!jugadorId) {
    return NextResponse.json({ error: "Falta id de jugador." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Faltan variables de entorno." }, { status: 500 });
  }

  if (!token) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
  }

  const { data: me, error: roleError } = await userClient
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (roleError || (me?.rol !== "admin" && me?.rol !== "delegado")) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const admin = createClient(url, serviceRoleKey);
  const { data: row, error: qErr } = await admin
    .from("jugadores")
    .select(
      "id,equipo_id,foto_url,dni_delante,dni_detras,dni_tutor_delante,dni_tutor_detras,es_menor,equipos(delegado_id)",
    )
    .eq("id", jugadorId)
    .maybeSingle();

  if (qErr || !row) {
    return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });
  }

  const jugador = row as JugadorDocsRow;
  const equipoRel = jugador.equipos;
  const delegadoId = Array.isArray(equipoRel)
    ? equipoRel[0]?.delegado_id
    : equipoRel?.delegado_id;

  if (me?.rol === "delegado") {
    const allowedIds = new Set<string>([user.id]);
    const email = (user.email ?? "").trim().toLowerCase();
    if (email) {
      const { data: rows } = await admin.from("usuarios").select("id").eq("correo", email);
      for (const r of (rows ?? []) as { id: string }[]) allowedIds.add(r.id);
    }
    if (!delegadoId || !allowedIds.has(delegadoId)) {
      return NextResponse.json({ error: "Solo puedes ver jugadores de tu equipo." }, { status: 403 });
    }
  }

  const [dniDelanteUrl, dniDetrasUrl, dniTutorDelanteUrl, dniTutorDetrasUrl] = await Promise.all([
    signedUrl(admin, jugador.dni_delante),
    signedUrl(admin, jugador.dni_detras),
    signedUrl(admin, jugador.dni_tutor_delante),
    signedUrl(admin, jugador.dni_tutor_detras),
  ]);

  return NextResponse.json({
    fotoUrl: jugador.foto_url,
    dniDelanteUrl,
    dniDetrasUrl,
    dniTutorDelanteUrl,
    dniTutorDetrasUrl,
    esMenor: Boolean(jugador.es_menor),
  });
}
