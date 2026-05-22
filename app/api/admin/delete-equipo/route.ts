import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = { equipoId?: string };

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "Faltan variables de entorno." }, { status: 500 }) };
  }
  if (!token) {
    return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sesion invalida." }, { status: 401 }) };
  }

  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Solo admin puede borrar equipos." }, { status: 403 }) };
  }

  return { url, serviceRoleKey };
}

/** Borra equipo y dependencias con service_role (evita RLS recursivo en movil). */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const { url, serviceRoleKey } = gate as { url: string; serviceRoleKey: string };

  const body = (await request.json()) as Body;
  const equipoId = (body.equipoId ?? "").trim();
  if (!equipoId) {
    return NextResponse.json({ error: "Falta id de equipo." }, { status: 400 });
  }

  const admin = createClient(url, serviceRoleKey);

  const { data: partidos, error: pErr } = await admin
    .from("partidos")
    .select("id")
    .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`);

  if (pErr) {
    return NextResponse.json({ error: `Error leyendo partidos: ${pErr.message}` }, { status: 400 });
  }

  const partidoIds = (partidos ?? []).map((p) => (p as { id: string }).id);

  if (partidoIds.length > 0) {
    const { error: tErr } = await admin.from("tarjetas_partido").delete().in("partido_id", partidoIds);
    if (tErr) {
      return NextResponse.json({ error: `Error borrando tarjetas: ${tErr.message}` }, { status: 400 });
    }
    const { error: gErr } = await admin.from("goles").delete().in("partido_id", partidoIds);
    if (gErr) {
      return NextResponse.json({ error: `Error borrando goles: ${gErr.message}` }, { status: 400 });
    }
    const { error: golEqErr } = await admin.from("goles").delete().eq("equipo_id", equipoId);
    if (golEqErr) {
      return NextResponse.json({ error: `Error borrando goles del equipo: ${golEqErr.message}` }, { status: 400 });
    }
    const { error: tarEqErr } = await admin.from("tarjetas_partido").delete().eq("equipo_id", equipoId);
    if (tarEqErr) {
      return NextResponse.json({ error: `Error borrando tarjetas del equipo: ${tarEqErr.message}` }, { status: 400 });
    }
    const { error: updErr } = await admin
      .from("partidos")
      .update({ equipo_local_id: null, equipo_visitante_id: null })
      .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`);
    if (updErr) {
      const delPart = await admin
        .from("partidos")
        .delete()
        .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`);
      if (delPart.error) {
        return NextResponse.json(
          { error: `No se pudieron actualizar/borrar partidos: ${updErr.message}` },
          { status: 400 },
        );
      }
    }
  } else {
    await admin.from("goles").delete().eq("equipo_id", equipoId);
    await admin.from("tarjetas_partido").delete().eq("equipo_id", equipoId);
  }

  const { error: jErr } = await admin.from("jugadores").delete().eq("equipo_id", equipoId);
  if (jErr) {
    return NextResponse.json({ error: `Error borrando jugadores: ${jErr.message}` }, { status: 400 });
  }

  const { error: eErr } = await admin.from("equipos").delete().eq("id", equipoId);
  if (eErr) {
    return NextResponse.json({ error: `Error borrando equipo: ${eErr.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
