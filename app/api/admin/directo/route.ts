import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recalcPartidoStats } from "@/lib/server/recalc-partido-stats";

export const dynamic = "force-dynamic";

type Body =
  | { action: "add_goal"; partido_id?: string; jugador_id?: string; equipo_id?: string; propia_meta?: boolean; minuto?: number | null }
  | { action: "remove_goal"; gol_id?: string }
  | {
      action: "add_tarjeta";
      partido_id?: string;
      jugador_id?: string;
      equipo_id?: string;
      tipo?: string;
    }
  | { action: "remove_tarjeta"; tarjeta_id?: string };

async function ensureStaff(request: NextRequest) {
  const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey || !token) {
    return { ok: false as const, error: "No autenticado o faltan variables." };
  }
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesion invalida." };
  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin" && me?.rol !== "director_campo") {
    return { ok: false as const, error: "Solo admin o director de campo." };
  }
  return { ok: true as const, admin: createClient(url, serviceRoleKey) };
}

export async function GET(request: NextRequest) {
  const auth = await ensureStaff(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { admin } = auth;
  const partidoId = request.nextUrl.searchParams.get("partido_id");
  if (!partidoId) return NextResponse.json({ error: "Falta partido_id." }, { status: 400 });

  const { data: p, error: pErr } = await admin
    .from("partidos")
    .select(
      "id,fase,estado,fecha_hora,goles_local,goles_visitante,equipo_local_id,equipo_visitante_id,amarillas_local,amarillas_visitante,rojas_local,rojas_visitante,rojas_agresion_local,rojas_agresion_visitante",
    )
    .eq("id", partidoId)
    .single();

  if (pErr || !p) return NextResponse.json({ error: pErr?.message ?? "No encontrado" }, { status: 400 });

  const localId = p.equipo_local_id as string | null;
  const visitId = p.equipo_visitante_id as string | null;

  let jugadoresLoc: Record<string, unknown>[] = [];
  let jugadoresVis: Record<string, unknown>[] = [];
  let eqNames: Record<string, string> = {};

  const idsEq = [localId, visitId].filter(Boolean) as string[];
  if (idsEq.length) {
    const { data: eqRows } = await admin.from("equipos").select("id,nombre").in("id", idsEq);
    for (const e of eqRows ?? []) {
      eqNames[(e as { id: string }).id] = (e as { nombre: string }).nombre;
    }

    const { data: jRows, error: jErr } = await admin
      .from("jugadores")
      .select("id,equipo_id,nombre,apellidos,alias,foto_url")
      .in("equipo_id", idsEq)
      .order("apellidos", { ascending: true });

    if (jErr) return NextResponse.json({ error: `Jugadores: ${jErr.message}` }, { status: 400 });

    for (const j of jRows ?? []) {
      const row = j as { equipo_id: string };
      if (row.equipo_id === localId) jugadoresLoc.push(j as Record<string, unknown>);
      else if (row.equipo_id === visitId) jugadoresVis.push(j as Record<string, unknown>);
    }
  }

  let golesOut: unknown[] = [];
  const golEmbed = "jugadores(nombre,apellidos,alias,foto_url)";
  const selFull =
    `id,minuto,jugador_id,equipo_id,propia_meta,created_at,${golEmbed}` as const;
  let gsel = await admin.from("goles").select(selFull).eq("partido_id", partidoId).order("created_at", { ascending: true });
  if (gsel.error) {
    const selNoCt = `id,minuto,jugador_id,equipo_id,propia_meta,${golEmbed}`;
    gsel = await admin.from("goles").select(selNoCt).eq("partido_id", partidoId).order("id", { ascending: true });
    if (!gsel.error) {
      golesOut = (gsel.data ?? []).map((r) => ({ ...(r as object), created_at: null }));
    } else {
      const selMin = `id,minuto,jugador_id,equipo_id,jugadores(nombre,apellidos,alias)`;
      const g3 = await admin.from("goles").select(selMin).eq("partido_id", partidoId).order("id", { ascending: true });
      if (g3.error) return NextResponse.json({ error: g3.error.message }, { status: 400 });
      golesOut = (g3.data ?? []).map((r) => ({ ...(r as object), propia_meta: false, created_at: null }));
    }
  } else golesOut = gsel.data ?? [];

  let tarjetasOut: unknown[] = [];
  let tsel = await admin
    .from("tarjetas_partido")
    .select("id,jugador_id,equipo_id,tipo,created_at,jugadores(nombre,apellidos,alias,foto_url)")
    .eq("partido_id", partidoId)
    .order("created_at", { ascending: true });

  if (tsel.error) {
    const em = tsel.error.message.toLowerCase();
    if (
      em.includes("foto_url") ||
      em.includes("column") ||
      em.includes("schema cache") ||
      em.includes("relation") ||
      em.includes("does not exist")
    ) {
      const t2 = await admin
        .from("tarjetas_partido")
        .select("id,jugador_id,equipo_id,tipo,created_at,jugadores(nombre,apellidos,alias)")
        .eq("partido_id", partidoId)
        .order("created_at", { ascending: true });
      if (t2.error) {
        const e2 = t2.error.message.toLowerCase();
        if (e2.includes("relation") || e2.includes("does not exist") || e2.includes("schema cache")) tarjetasOut = [];
        else return NextResponse.json({ error: t2.error.message }, { status: 400 });
      } else tarjetasOut = t2.data ?? [];
    } else return NextResponse.json({ error: tsel.error.message }, { status: 400 });
  } else tarjetasOut = tsel.data ?? [];

  return NextResponse.json({
    ok: true,
    partido: p,
    equiposNombre: eqNames,
    jugadores_local: jugadoresLoc,
    jugadores_visitante: jugadoresVis,
    goles: golesOut,
    tarjetas: tarjetasOut,
  });
}

export async function POST(request: NextRequest) {
  const auth = await ensureStaff(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { admin } = auth;
  const body = (await request.json()) as Body;

  if (body.action === "add_goal") {
    const partido_id = body.partido_id ?? "";
    const jugador_id = body.jugador_id ?? "";
    const equipo_id = body.equipo_id ?? "";
    if (!partido_id || !jugador_id || !equipo_id) {
      return NextResponse.json({ error: "Faltan datos del gol." }, { status: 400 });
    }

    const { data: par, error: pe } = await admin
      .from("partidos")
      .select("equipo_local_id,equipo_visitante_id")
      .eq("id", partido_id)
      .single();
    if (pe || !par) return NextResponse.json({ error: "Partido invalido." }, { status: 400 });
    const lid = par.equipo_local_id as string | null;
    const vid = par.equipo_visitante_id as string | null;
    if (!lid || !vid) {
      return NextResponse.json({ error: "Este partido aun no tiene equipos local y visitante; no se pueden registrar goles por jugadores." }, { status: 400 });
    }

    const { data: jug, error: je } = await admin.from("jugadores").select("equipo_id").eq("id", jugador_id).single();
    if (je || !jug || (jug as { equipo_id: string }).equipo_id !== equipo_id) {
      return NextResponse.json({ error: "El jugador no pertenece al equipo indicado." }, { status: 400 });
    }
    if (equipo_id !== lid && equipo_id !== vid) {
      return NextResponse.json({ error: "El equipo no participa en este partido." }, { status: 400 });
    }

    const ins = await admin.from("goles").insert({
      partido_id,
      jugador_id,
      equipo_id,
      propia_meta: Boolean(body.propia_meta),
      minuto: body.minuto == null ? null : Number(body.minuto),
    });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });

    const r = await recalcPartidoStats(admin, partido_id);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove_goal") {
    const gol_id = body.gol_id ?? "";
    if (!gol_id) return NextResponse.json({ error: "Falta gol_id." }, { status: 400 });
    const { data: g, error: ge } = await admin.from("goles").select("partido_id").eq("id", gol_id).single();
    if (ge || !g) return NextResponse.json({ error: "Gol no encontrado." }, { status: 400 });
    const partido_id = (g as { partido_id: string }).partido_id;
    const del = await admin.from("goles").delete().eq("id", gol_id);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    const r = await recalcPartidoStats(admin, partido_id);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add_tarjeta") {
    const partido_id = body.partido_id ?? "";
    const jugador_id = body.jugador_id ?? "";
    const equipo_id = body.equipo_id ?? "";
    const tipo = (body.tipo ?? "").trim();
    const allowed = new Set(["amarilla", "doble_amarilla", "roja", "roja_agresion"]);
    if (!partido_id || !jugador_id || !equipo_id || !allowed.has(tipo)) {
      return NextResponse.json({ error: "Datos de tarjeta incompletos o tipo invalido." }, { status: 400 });
    }

    const { data: par, error: pe } = await admin
      .from("partidos")
      .select("equipo_local_id,equipo_visitante_id")
      .eq("id", partido_id)
      .single();
    if (pe || !par) return NextResponse.json({ error: "Partido invalido." }, { status: 400 });
    const lid = par.equipo_local_id as string | null;
    const vid = par.equipo_visitante_id as string | null;
    if (!lid || !vid) {
      return NextResponse.json(
        { error: "Este partido aun no tiene equipos; no se pueden registrar tarjetas por jugadores." },
        { status: 400 },
      );
    }

    const { data: jug, error: je } = await admin.from("jugadores").select("equipo_id").eq("id", jugador_id).single();
    if (je || !jug || (jug as { equipo_id: string }).equipo_id !== equipo_id) {
      return NextResponse.json({ error: "El jugador no pertenece al equipo indicado." }, { status: 400 });
    }
    if (equipo_id !== lid && equipo_id !== vid) {
      return NextResponse.json({ error: "El equipo no participa en este partido." }, { status: 400 });
    }

    const ins = await admin.from("tarjetas_partido").insert({
      partido_id,
      jugador_id,
      equipo_id,
      tipo,
    });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });

    const r = await recalcPartidoStats(admin, partido_id);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove_tarjeta") {
    const tarjeta_id = body.tarjeta_id ?? "";
    if (!tarjeta_id) return NextResponse.json({ error: "Falta tarjeta_id." }, { status: 400 });
    const { data: row, error: re } = await admin.from("tarjetas_partido").select("partido_id").eq("id", tarjeta_id).single();
    if (re || !row) return NextResponse.json({ error: "Tarjeta no encontrada." }, { status: 400 });
    const partido_id = (row as { partido_id: string }).partido_id;
    const del = await admin.from("tarjetas_partido").delete().eq("id", tarjeta_id);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    const r3 = await recalcPartidoStats(admin, partido_id);
    if (r3.error) return NextResponse.json({ error: r3.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Accion no soportada." }, { status: 400 });
}
