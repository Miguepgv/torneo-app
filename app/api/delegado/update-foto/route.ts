import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  equipoId?: string;
  fotoDelegadoUrl?: string | null;
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
  if (roleError || (me?.rol !== "admin" && me?.rol !== "delegado")) {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const body = (await request.json()) as Body;
  const equipoId = (body.equipoId ?? "").trim();
  const fotoDelegadoUrl = body.fotoDelegadoUrl?.trim() || null;
  if (!equipoId || !fotoDelegadoUrl) {
    return NextResponse.json(
      { error: "Equipo y foto son obligatorios." },
      { status: 400 },
    );
  }

  const adminClient = createClient(url, serviceRoleKey);
  const { data: team, error: teamErr } = await adminClient
    .from("equipos")
    .select("id,delegado_id")
    .eq("id", equipoId)
    .single();
  if (teamErr || !team) {
    return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
  }

  if (me?.rol === "delegado" && team.delegado_id !== user.id) {
    return NextResponse.json({ error: "Solo puedes editar tu equipo." }, { status: 403 });
  }
  if (!team.delegado_id) {
    return NextResponse.json({ error: "El equipo no tiene delegado asignado." }, { status: 400 });
  }

  const { error: upErr } = await adminClient
    .from("usuarios")
    .update({ foto_url: fotoDelegadoUrl })
    .eq("id", team.delegado_id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, foto_url: fotoDelegadoUrl });
}
