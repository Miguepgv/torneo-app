import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  equipoId?: string;
  emailDelegado?: string;
  telefonoDelegado?: string;
};

function appBaseUrl(request: NextRequest) {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
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

  if (!equipoId || !emailDelegado || !telefonoDelegado) {
    return NextResponse.json(
      { error: "Equipo, correo y telefono del delegado son obligatorios." },
      { status: 400 },
    );
  }

  const adminClient = createClient(url, serviceRoleKey);
  const base = appBaseUrl(request);
  const redirectTo = `${base}/login`;

  const { data: team, error: teamErr } = await adminClient
    .from("equipos")
    .select("id,delegado_id")
    .eq("id", equipoId)
    .single();

  if (teamErr || !team) {
    return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
  }

  const { data: targetProfile } = await adminClient
    .from("usuarios")
    .select("id,rol")
    .eq("correo", emailDelegado)
    .maybeSingle();

  if (targetProfile?.rol === "admin") {
    return NextResponse.json(
      { error: "No puedes asignar como delegado a un administrador." },
      { status: 400 },
    );
  }

  let delegadoId: string | null = null;

  const { data: existingByMail } = await adminClient
    .from("usuarios")
    .select("id")
    .eq("correo", emailDelegado)
    .maybeSingle();

  if (existingByMail?.id) {
    delegadoId = existingByMail.id;
  } else {
    const invite = await adminClient.auth.admin.inviteUserByEmail(emailDelegado, {
      redirectTo,
      data: { nombre: "Delegado" },
    });
    if (invite.error || !invite.data.user) {
      return NextResponse.json(
        { error: invite.error?.message ?? "No se pudo invitar al delegado." },
        { status: 400 },
      );
    }
    delegadoId = invite.data.user.id;
  }

  const { error: upsertUserError } = await adminClient.from("usuarios").upsert(
    {
      id: delegadoId,
      correo: emailDelegado,
      telefono: telefonoDelegado,
      rol: "delegado",
      nombre: emailDelegado.split("@")[0],
    },
    { onConflict: "id" },
  );

  if (upsertUserError) {
    return NextResponse.json(
      { error: `No se pudo guardar delegado: ${upsertUserError.message}` },
      { status: 400 },
    );
  }

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

  return NextResponse.json({
    ok: true,
    delegado_id: delegadoId,
    mensaje:
      "Delegado actualizado. Si es nuevo, recibira correo para definir contrasena.",
  });
}
