import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreateTeamPayload = {
  nombreEquipo?: string;
  emailDelegado?: string;
  telefonoDelegado?: string;
};

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

  if (!nombreEquipo || !emailDelegado || !telefonoDelegado) {
    return NextResponse.json(
      { error: "Nombre equipo, correo y telefono son obligatorios." },
      { status: 400 },
    );
  }

  const adminClient = createClient(url, serviceRoleKey);

  let delegadoId: string | null = null;
  const { data: existingUser } = await adminClient
    .from("usuarios")
    .select("id")
    .eq("correo", emailDelegado)
    .maybeSingle();

  if (existingUser?.id) {
    delegadoId = existingUser.id;
  } else {
    const invite = await adminClient.auth.admin.inviteUserByEmail(emailDelegado, {
      redirectTo: "http://localhost:3000/login",
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
  });
}
