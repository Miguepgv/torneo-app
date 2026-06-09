import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  equipoId?: string;
  jugadorId?: string;
};

async function delegadoAllowed(admin: ReturnType<typeof createClient>, userId: string, email: string | undefined, delegadoId: string | null) {
  if (!delegadoId) return false;
  const allowed = new Set<string>([userId]);
  const mail = (email ?? "").trim().toLowerCase();
  if (mail) {
    const { data: rows } = await admin.from("usuarios").select("id").eq("correo", mail);
    for (const r of (rows ?? []) as { id: string }[]) allowed.add(r.id);
  }
  return allowed.has(delegadoId);
}

/** Borra jugador con service_role (evita RLS en movil/admin). */
export async function POST(request: NextRequest) {
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

  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin" && me?.rol !== "delegado") {
    return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  }

  const body = (await request.json()) as Body;
  const equipoId = (body.equipoId ?? "").trim();
  const jugadorId = (body.jugadorId ?? "").trim();
  if (!equipoId || !jugadorId) {
    return NextResponse.json({ error: "Equipo y jugador son obligatorios." }, { status: 400 });
  }

  const admin = createClient(url, serviceRoleKey);

  const { data: team, error: teamErr } = await admin
    .from("equipos")
    .select("id,delegado_id")
    .eq("id", equipoId)
    .single();
  if (teamErr || !team) {
    return NextResponse.json({ error: "Equipo no encontrado." }, { status: 404 });
  }

  if (me?.rol === "delegado") {
    const ok = await delegadoAllowed(admin, user.id, user.email, team.delegado_id);
    if (!ok) {
      return NextResponse.json({ error: "Solo puedes borrar jugadores de tu equipo." }, { status: 403 });
    }
  }

  const { data: jugador, error: jugadorErr } = await admin
    .from("jugadores")
    .select(
      "id,equipo_id,dni_delante,dni_detras,dni_tutor_delante,dni_tutor_detras,foto_url",
    )
    .eq("id", jugadorId)
    .single();
  if (jugadorErr || !jugador || jugador.equipo_id !== equipoId) {
    return NextResponse.json({ error: "Jugador no encontrado en este equipo." }, { status: 404 });
  }

  const row = jugador as {
    dni_delante: string | null;
    dni_detras: string | null;
    dni_tutor_delante: string | null;
    dni_tutor_detras: string | null;
    foto_url: string | null;
  };

  const dniPaths = [row.dni_delante, row.dni_detras, row.dni_tutor_delante, row.dni_tutor_detras].filter(
    (p): p is string => Boolean(p?.trim()),
  );
  if (dniPaths.length) {
    await admin.storage.from("dnis_privados").remove(dniPaths);
  }

  if (row.foto_url?.trim()) {
    try {
      const u = new URL(row.foto_url);
      const marker = "/storage/v1/object/public/escudos/";
      const idx = u.pathname.indexOf(marker);
      if (idx >= 0) {
        const path = decodeURIComponent(u.pathname.slice(idx + marker.length));
        if (path) await admin.storage.from("escudos").remove([path]);
      }
    } catch {
      /* ignore URL parse */
    }
  }

  const { error: delErr } = await admin.from("jugadores").delete().eq("id", jugadorId);
  if (delErr) {
    return NextResponse.json({ error: `No se pudo borrar: ${delErr.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
