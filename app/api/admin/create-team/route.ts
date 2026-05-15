import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setPasswordAuthCallbackUrl } from "@/lib/server/auth-redirect";
import { resolveDelegadoForTeam } from "@/lib/server/resolve-delegado";

type CreateTeamPayload = {
  nombreEquipo?: string;
  emailDelegado?: string;
  telefonoDelegado?: string;
  nombreDelegado?: string;
  apellidosDelegado?: string;
  fotoDelegadoUrl?: string | null;
};

function appBaseUrl(request: NextRequest) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return origin;
  }
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  if (origin) return origin;
  return "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 },
    );
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
  if (roleError || me?.rol !== "admin") {
    return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  }

  const body = (await request.json()) as CreateTeamPayload;
  const nombreEquipo = (body.nombreEquipo ?? "").trim();
  const emailDelegado = (body.emailDelegado ?? "").trim().toLowerCase();
  const telefonoDelegado = (body.telefonoDelegado ?? "").trim();
  const nombreDelegado = body.nombreDelegado ?? "";
  const apellidosDelegado = body.apellidosDelegado ?? "";
  const fotoDelegadoUrl = body.fotoDelegadoUrl?.trim() || null;

  if (!nombreEquipo || !emailDelegado || !telefonoDelegado) {
    return NextResponse.json(
      { error: "Nombre equipo, correo y telefono son obligatorios." },
      { status: 400 },
    );
  }

  const adminClient = createClient(url, serviceRoleKey);
  const setPasswordRedirect = setPasswordAuthCallbackUrl(request);

  const resolved = await resolveDelegadoForTeam(
    adminClient,
    emailDelegado,
    telefonoDelegado,
    nombreDelegado,
    apellidosDelegado,
    fotoDelegadoUrl,
    {
      setPasswordRedirect,
      supabaseUrl: url,
      anonKey: anonKey,
    },
  );
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const delegadoId = resolved.data.delegadoId;

  const { data: codigoData, error: codigoError } = await adminClient.rpc(
    "generar_codigo_inscripcion",
    { p_len: 6 },
  );
  if (codigoError) {
    return NextResponse.json(
      { error: `No se pudo generar codigo: ${codigoError.message}` },
      { status: 400 },
    );
  }

  const codigoInscripcion = typeof codigoData === "string" ? codigoData : "";
  const { data: team, error: teamError } = await adminClient
    .from("equipos")
    .insert({
      nombre: nombreEquipo,
      codigo_inscripcion: codigoInscripcion,
      delegado_id: delegadoId,
    })
    .select("id,codigo_inscripcion")
    .single();

  if (teamError) {
    return NextResponse.json(
      { error: `No se pudo crear equipo: ${teamError.message}` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    equipo_id: team.id,
    codigo_inscripcion: team.codigo_inscripcion,
    invited_new_user: resolved.data.invitedNewUser,
    access_email_sent: resolved.data.accessEmailSent,
    email_error: resolved.data.emailError,
    redirect_usado: setPasswordRedirect,
  });
}
