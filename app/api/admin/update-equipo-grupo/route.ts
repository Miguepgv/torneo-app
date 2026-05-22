import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = { equipoId?: string; grupo?: string };

export async function POST(request: NextRequest) {
  const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return NextResponse.json({ error: "Faltan variables." }, { status: 500 });
  if (!token) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });

  const body = (await request.json()) as Body;
  const equipoId = (body.equipoId ?? "").trim();
  const grupo = (body.grupo ?? "").trim().toUpperCase();
  if (!equipoId) return NextResponse.json({ error: "Equipo obligatorio." }, { status: 400 });

  const admin = createClient(url, serviceRoleKey);
  const { error } = await admin.from("equipos").update({ grupo: grupo || null }).eq("id", equipoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
