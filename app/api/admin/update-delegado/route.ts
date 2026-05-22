import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveDelegadoForTeam } from "@/lib/server/resolve-delegado";

type Body = {
  equipoId?: string;
  emailDelegado?: string;
  telefonoDelegado?: string;
  nombreDelegado?: string;
  apellidosDelegado?: string;
  fotoDelegadoUrl?: string | null;
};

function appBaseUrl(request: NextRequest) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  /** En local, el Origin del navegador debe mandar el redirect (evita fallo Auth si .env apunta a Vercel). */
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
    return NextResponse.json({ error: "Solo admin puede cambiar el delegado." }, { status: 403 });
  }

  const body = (await request.json()) as Body;
  const equipoId = (body.equipoId ?? "").trim();
  const emailDelegado = (body.emailDelegado ?? "").trim().toLowerCase();
  const telefonoDelegado = (body.telefonoDelegado ?? "").trim();
  const nombreDelegado = body.nombreDelegado ?? "";
  const apellidosDelegado = body.apellidosDelegado ?? "";
  const fotoDelegadoUrl = body.fotoDelegadoUrl?.trim() || null;

  if (!equipoId || !emailDelegado || !telefonoDelegado) {
    return NextResponse.json(
      { error: "Equipo, correo y telefono del delegado son obligatorios." },
      { status: 400 },
    );
  }

  const adminClient = createClient(url, serviceRoleKey);
  const base = appBaseUrl(request);
  const setPasswordRedirect = `${base}/reset-password`;

  const { data: team, error: teamErr } = await adminClient
    .from("equipos")
    .select("id,delegado_id")
    .eq("id", equipoId)
    .single();

  if (teamErr || !team) {
    return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
  }

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

  const { error: updateErr } = await adminClient
    .from("equipos")
    .update({ delegado_id: delegadoId })
    .eq("id", equipoId);

  if (updateErr) {
    return NextResponse.json(
      { error: `No se pudo actualizar el equipo: ${updateErr.message}` },
      { status: 400 },
    );
  }

  const { invitedNewUser, accessEmailSent, emailError } = resolved.data;
  let mensaje = "Delegado actualizado.";
  if (invitedNewUser) {
    mensaje =
      "Delegado actualizado. Si el delegado es nuevo, Supabase debe enviar la invitacion (revisa spam y SMTP).";
  } else if (accessEmailSent) {
    mensaje =
      "Delegado actualizado. Se envio el enlace por correo (revisa spam).";
  } else {
    mensaje =
      "Delegado guardado pero el correo NO se envio. Mira el detalle de error abajo (redirect URL o SMTP).";
  }

  return NextResponse.json({
    ok: true,
    delegado_id: delegadoId,
    invited_new_user: invitedNewUser,
    access_email_sent: accessEmailSent,
    email_error: emailError,
    redirect_usado: setPasswordRedirect,
    mensaje,
  });
}
