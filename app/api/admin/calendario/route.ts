import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TORNEO_COMPETICIONES, TORNEO_COMPETICION_KO_GENERICA } from "@/lib/torneo-constants";
import { tituloCompeticionMostrar } from "@/lib/torneo-constants";
import {
  findKnockoutPartidoCandidates,
  findTeamIdByName,
  parseKnockoutScheduleText,
  parseScheduleText,
  resolvePistaNombre,
  toIsoFromParts,
  weekendFromStrings,
} from "@/lib/server/parse-schedule-lines";
import { syncKnockoutTeams } from "@/lib/server/resolve-knockout-teams";
import { recalcPartidoStats } from "@/lib/server/recalc-partido-stats";

type MatchPayload = {
  id?: string;
  equipo_local_id?: string | null;
  equipo_visitante_id?: string | null;
  fecha_hora?: string | null;
  pista?: string | null;
  estado?: string | null;
  fase?: string | null;
  slot_local?: string | null;
  slot_visitante?: string | null;
};

type Body =
  | {
      action: "generate_groups";
      resetExisting?: boolean;
      startAt?: string | null;
      intervalMinutes?: number;
      pista?: string | null;
    }
  | ({
      action: "save_match";
    } & MatchPayload)
  | ({
      action: "create_match";
    } & MatchPayload)
  | {
      action: "generate_knockout";
      resetExisting?: boolean;
      startAt?: string | null;
      intervalMinutes?: number;
      pista?: string | null;
      autoAllCompetitions?: boolean;
      mode?: "auto" | "manual";
      manualPairs?: {
        champions?: string[];
        europa?: string[];
        conference?: string[];
      };
    }
  | { action: "add_pista"; nombre?: string }
  | { action: "delete_pista"; id?: string }
  | { action: "set_estado"; id?: string; estado?: string }
  | {
      action: "save_knockout_config";
      mode?: "auto" | "manual";
      manualPairs?: {
        champions?: Array<{ local: string; visit: string } | string>;
        europa?: Array<{ local: string; visit: string } | string>;
        conference?: Array<{ local: string; visit: string } | string>;
      };
    }
  | {
      action: "apply_schedule";
      kind?: "groups" | "knockout";
      text?: string;
      year?: number;
      weekendViernes?: string;
      weekendSabado?: string;
      weekendDomingo?: string;
    };

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
  const rol = (me?.rol as string | undefined) ?? "";
  if (rol !== "admin" && rol !== "director_campo") {
    return { ok: false as const, error: "Sin permisos." };
  }
  return { ok: true as const, admin: createClient(url, serviceRoleKey), rol };
}

function roundRobin(ids: string[]) {
  const items = [...ids];
  if (items.length % 2 === 1) items.push("BYE");
  const n = items.length;
  const rounds: Array<Array<[string, string]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = items[i];
      const b = items[n - 1 - i];
      if (a !== "BYE" && b !== "BYE") pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    const fixed = items[0];
    const rest = items.slice(1);
    rest.unshift(rest.pop() as string);
    items.splice(0, items.length, fixed, ...rest);
  }
  return rounds;
}

function roundNamesForSize(n: number) {
  if (n <= 2) return ["Final"];
  if (n <= 4) return ["Semifinal", "Final"];
  if (n <= 8) return ["Cuartos", "Semifinal", "Final"];
  if (n <= 16) return ["Octavos", "Cuartos", "Semifinal", "Final"];
  return ["Ronda 1", "Ronda 2", "Ronda 3", "Ronda 4", "Final"];
}

function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePositions(text: string | null | undefined) {
  return (text ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function allocateBracketSlots(
  groups: string[],
  cfg: Record<string, unknown> | null,
): Record<"champions" | "europa" | "conference", string[]> {
  const pools: Record<number, string[]> = {};
  for (let pos = 1; pos <= 10; pos++) {
    pools[pos] = groups.map((g) => `${pos}${g.toUpperCase()}`);
  }
  const out: Record<"champions" | "europa" | "conference", string[]> = {
    champions: [],
    europa: [],
    conference: [],
  };

  function takeDirect(comp: keyof typeof out, positionsText: unknown) {
    const positions = parsePositions(String(positionsText ?? ""));
    for (const pos of positions) {
      const arr = pools[pos] ?? [];
      out[comp].push(...arr);
      pools[pos] = [];
    }
  }
  function takeBest(comp: keyof typeof out, pos: number, count: number, labelPrefix: string) {
    const n = Math.max(0, toNum(count));
    if (n <= 0) return;
    const arr = pools[pos] ?? [];
    const fromPools = Math.min(arr.length, n);
    for (let i = 0; i < fromPools; i++) out[comp].push(arr.shift() as string);
    pools[pos] = arr;
    for (let i = fromPools; i < n; i++) out[comp].push(`${labelPrefix}${i + 1}`);
  }

  // Cascada real basada en configuración guardada
  takeDirect("champions", cfg?.champions_direct_positions);
  takeBest("champions", 2, cfg?.champions_best_seconds, "M2C-");
  takeBest("champions", 3, cfg?.champions_best_thirds, "M3C-");

  takeDirect("europa", cfg?.europa_direct_positions);
  takeBest("europa", 2, cfg?.europa_best_seconds, "M2E-");
  takeBest("europa", 3, cfg?.europa_best_thirds, "M3E-");

  takeDirect("conference", cfg?.conference_direct_positions);
  takeBest("conference", 2, cfg?.conference_best_seconds, "M2F-");
  takeBest("conference", 3, cfg?.conference_best_thirds, "M3F-");
  takeBest("conference", 4, cfg?.conference_best_fourths, "M4F-");
  takeBest("conference", 5, cfg?.conference_best_fifths, "M5F-");

  return out;
}

export async function GET(request: NextRequest) {
  const auth = await ensureStaff(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  if (auth.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  const { admin } = auth;
  const [{ data: equipos, error: eErr }, { data: partidos, error: pErr }, { data: pistas, error: piErr }, { data: config, error: cErr }] = await Promise.all([
    admin.from("equipos").select("id,nombre,grupo").order("nombre"),
    admin
      .from("partidos")
      .select("id,equipo_local_id,equipo_visitante_id,slot_local,slot_visitante,fecha_hora,pista,estado,fase,goles_local,goles_visitante,competicion,ronda,orden")
      .order("fecha_hora", { ascending: true, nullsFirst: false }),
    admin.from("pistas").select("id,nombre").order("nombre"),
    admin.from("configuracion_torneo").select("*").limit(1).maybeSingle(),
  ]);
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  if (piErr) return NextResponse.json({ error: piErr.message }, { status: 400 });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, equipos: equipos ?? [], partidos: partidos ?? [], pistas: pistas ?? [], config: config ?? null });
}

export async function POST(request: NextRequest) {
  const auth = await ensureStaff(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { admin } = auth;
  const body = (await request.json()) as Body;
  if (auth.rol !== "admin" && body.action !== "set_estado") {
    return NextResponse.json({ error: "Solo admin puede hacer esta accion." }, { status: 403 });
  }

  if (body.action === "generate_groups") {
    const { data: equipos, error } = await admin.from("equipos").select("id,grupo").not("grupo", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const byGroup = new Map<string, string[]>();
    for (const row of (equipos ?? []) as { id: string; grupo: string | null }[]) {
      const g = (row.grupo ?? "").trim();
      if (!g) continue;
      byGroup.set(g, [...(byGroup.get(g) ?? []), row.id]);
    }
    if (body.resetExisting) {
      const del = await admin.from("partidos").delete().like("fase", "Grupo %");
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });
    }
    const startAt = body.startAt ? new Date(body.startAt) : null;
    const interval = Math.max(10, Number(body.intervalMinutes ?? 60));
    const toInsert: Record<string, unknown>[] = [];
    let idx = 0;
    for (const [grupo, ids] of byGroup.entries()) {
      const rounds = roundRobin(ids);
      rounds.forEach((pairs, rIndex) => {
        pairs.forEach(([local, visit]) => {
          const dt =
            startAt instanceof Date && !Number.isNaN(startAt.getTime())
              ? new Date(startAt.getTime() + idx * interval * 60_000).toISOString()
              : null;
          toInsert.push({
            equipo_local_id: local,
            equipo_visitante_id: visit,
            fase: `Grupo ${grupo}`,
            estado: "pendiente",
            fecha_hora: dt,
            pista: body.pista?.trim() || null,
            goles_local: null,
            goles_visitante: null,
          });
          idx += 1;
        });
      });
    }
    if (!toInsert.length) {
      return NextResponse.json({ error: "No hay equipos con grupo para generar calendario." }, { status: 400 });
    }
    const ins = await admin.from("partidos").insert(toInsert);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, created: toInsert.length });
  }

  if (body.action === "generate_knockout") {
    const [{ data: equipos, error: eErr }, { data: cfg, error: cErr }] = await Promise.all([
      admin.from("equipos").select("grupo").not("grupo", "is", null),
      admin.from("configuracion_torneo").select("*").limit(1).maybeSingle(),
    ]);
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    const groups = Array.from(
      new Set(((equipos ?? []) as { grupo: string | null }[]).map((e) => (e.grupo ?? "").trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "es"));
    if (groups.length < 2) return NextResponse.json({ error: "Necesitas al menos 2 grupos para cruces." }, { status: 400 });

    if (body.resetExisting) {
      const del = await admin.from("partidos").delete().or("fase.ilike.Cruce %,fase.ilike.Cuadro %");
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });
    }

    const startAt = body.startAt ? new Date(body.startAt) : null;
    const interval = Math.max(10, Number(body.intervalMinutes ?? 60));
    let idx = 0;
    const toInsert: Record<string, unknown>[] = [];
    const computedSlots = allocateBracketSlots(groups, (cfg as Record<string, unknown> | null) ?? null);
    const competitions = [
      {
        key: "champions",
        label: TORNEO_COMPETICIONES.CHAMPIONS,
        size: computedSlots.champions.length,
        slots: computedSlots.champions,
      },
      {
        key: "europa",
        label: TORNEO_COMPETICIONES.EUROPA,
        size: computedSlots.europa.length,
        slots: computedSlots.europa,
      },
      {
        key: "conference",
        label: TORNEO_COMPETICIONES.CONFERENCE,
        size: computedSlots.conference.length,
        slots: computedSlots.conference,
      },
    ] as const;

    for (const comp of competitions) {
      let firstRoundSlots: Array<{ local: string; visit: string }> = [];
      const basePool = comp.slots;
      const desiredSize = Math.max(2, comp.size || 0);
      const bracketSize = nextPowerOfTwo(desiredSize);
      if (body.mode === "manual") {
        const lines = body.manualPairs?.[comp.key] ?? [];
        firstRoundSlots = lines
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const normalized = line.replace(/\s+/g, "");
            const sep = normalized.includes("vs") ? "vs" : normalized.includes("VS") ? "VS" : "-";
            const [l, v] = normalized.split(sep);
            return { local: (l ?? "").toUpperCase(), visit: (v ?? "").toUpperCase() };
          })
          .filter((p) => p.local && p.visit);
      } else {
        const seeded = [...basePool];
        while (seeded.length < bracketSize) seeded.push("BYE");
        for (let i = 0; i < bracketSize / 2; i++) {
          const gL = seeded[i];
          const gV = seeded[bracketSize - 1 - i];
          if (gL === "BYE" && gV === "BYE") continue;
          firstRoundSlots.push({
            local: gL,
            visit: gV,
          });
        }
      }
      if (!firstRoundSlots.length) continue;
      const realBracketSize = nextPowerOfTwo(firstRoundSlots.length * 2);
      const rounds = roundNamesForSize(realBracketSize);
      const firstRoundMatches = realBracketSize / 2;

      for (let i = 0; i < firstRoundMatches; i++) {
        const pair = firstRoundSlots[i] ?? { local: "BYE", visit: "BYE" };
        if (pair.local === "BYE" && pair.visit === "BYE") continue;
        const dt =
          startAt instanceof Date && !Number.isNaN(startAt.getTime())
            ? new Date(startAt.getTime() + idx * interval * 60_000).toISOString()
            : null;
        toInsert.push({
          equipo_local_id: null,
          equipo_visitante_id: null,
          slot_local: pair.local,
          slot_visitante: pair.visit,
          fase: `Cuadro - ${rounds[0]} ${comp.label}`,
          competicion: comp.label,
          ronda: rounds[0],
          orden: i + 1,
          estado: "pendiente",
          fecha_hora: dt,
          pista: body.pista?.trim() || null,
          goles_local: null,
          goles_visitante: null,
        });
        idx += 1;
      }

      for (let r = 1; r < rounds.length; r++) {
        const matches = Math.max(1, firstRoundMatches / 2 ** r);
        for (let i = 0; i < matches; i++) {
          const dt =
            startAt instanceof Date && !Number.isNaN(startAt.getTime())
              ? new Date(startAt.getTime() + idx * interval * 60_000).toISOString()
              : null;
          toInsert.push({
            equipo_local_id: null,
            equipo_visitante_id: null,
            slot_local: `G${rounds[r - 1]} ${i * 2 + 1}`,
            slot_visitante: `G${rounds[r - 1]} ${i * 2 + 2}`,
            fase: `Cuadro - ${rounds[r]} ${comp.label}`,
            competicion: comp.label,
            ronda: rounds[r],
            orden: i + 1,
            estado: "pendiente",
            fecha_hora: dt,
            pista: body.pista?.trim() || null,
            goles_local: null,
            goles_visitante: null,
          });
          idx += 1;
        }
      }
    }

    if (!toInsert.length) {
      return NextResponse.json({ error: "No se pudieron generar cruces con la configuración actual." }, { status: 400 });
    }
    const ins = await admin.from("partidos").insert(toInsert);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, created: toInsert.length });
  }

  if (body.action === "save_match") {
    if (!body.id) return NextResponse.json({ error: "Falta id del partido." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    const b = body as MatchPayload & { id: string };
    if (b.equipo_local_id !== undefined) patch.equipo_local_id = b.equipo_local_id;
    if (b.equipo_visitante_id !== undefined) patch.equipo_visitante_id = b.equipo_visitante_id;
    if (b.fecha_hora !== undefined) patch.fecha_hora = b.fecha_hora || null;
    if (b.pista !== undefined) patch.pista = b.pista || null;
    if (b.estado !== undefined) patch.estado = b.estado || null;
    if (b.fase !== undefined) patch.fase = b.fase || null;
    if (b.slot_local !== undefined) patch.slot_local = b.slot_local || null;
    if (b.slot_visitante !== undefined) patch.slot_visitante = b.slot_visitante || null;
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
    }
    const up = await admin.from("partidos").update(patch).eq("id", body.id);
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "save_knockout_config") {
    const mode = body.mode === "auto" ? "auto" : "manual";
    const normalizePair = (raw: { local: string; visit: string } | string) => {
      if (typeof raw === "string") {
        const normalized = raw.replace(/\s+/g, "");
        const sep = normalized.toLowerCase().includes("vs") ? "vs" : "-";
        const [local, visit] = normalized.split(/vs/i);
        return { local: (local ?? "").trim().toUpperCase(), visit: (visit ?? "").trim().toUpperCase() };
      }
      return {
        local: (raw.local ?? "").trim().toUpperCase(),
        visit: (raw.visit ?? "").trim().toUpperCase(),
      };
    };
    const pairs = {
      champions: (body.manualPairs?.champions ?? []).map(normalizePair).filter((p) => p.local && p.visit),
      europa: (body.manualPairs?.europa ?? []).map(normalizePair).filter((p) => p.local && p.visit),
      conference: (body.manualPairs?.conference ?? []).map(normalizePair).filter((p) => p.local && p.visit),
    };
    const payload = { mode, pairs };
    const { data: existing, error: readErr } = await admin
      .from("configuracion_torneo")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });
    const up = existing?.id
      ? await admin.from("configuracion_torneo").update({ knockout_manual_config: payload }).eq("id", existing.id)
      : await admin.from("configuracion_torneo").insert({ knockout_manual_config: payload });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, knockoutManualConfig: payload });
  }

  if (body.action === "create_match") {
    if (!body.equipo_local_id || !body.equipo_visitante_id) {
      return NextResponse.json({ error: "Selecciona local y visitante." }, { status: 400 });
    }
    const ins = await admin.from("partidos").insert({
      equipo_local_id: body.equipo_local_id,
      equipo_visitante_id: body.equipo_visitante_id,
      fecha_hora: body.fecha_hora || null,
      pista: body.pista || null,
      estado: body.estado || "pendiente",
      fase: body.fase || "Cruce",
      competicion: TORNEO_COMPETICION_KO_GENERICA,
      goles_local: null,
      goles_visitante: null,
    });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add_pista") {
    const nombre = (body.nombre ?? "").trim();
    if (!nombre) return NextResponse.json({ error: "Nombre de pista obligatorio." }, { status: 400 });
    const ins = await admin.from("pistas").insert({ nombre });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete_pista") {
    if (!body.id) return NextResponse.json({ error: "Falta id de pista." }, { status: 400 });
    const del = await admin.from("pistas").delete().eq("id", body.id);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_estado") {
    if (!body.id) return NextResponse.json({ error: "Falta id del partido." }, { status: 400 });
    const estado = (body.estado ?? "").trim();
    if (!estado) return NextResponse.json({ error: "Falta estado." }, { status: 400 });
    const allowed = ["pendiente", "jugandose", "finalizado"];
    if (!allowed.includes(estado)) return NextResponse.json({ error: "Estado no valido." }, { status: 400 });
    const patch: Record<string, unknown> = { estado };
    if (estado === "pendiente") {
      patch.goles_local = null;
      patch.goles_visitante = null;
      patch.amarillas_local = 0;
      patch.amarillas_visitante = 0;
      patch.rojas_local = 0;
      patch.rojas_visitante = 0;
      patch.rojas_agresion_local = 0;
      patch.rojas_agresion_visitante = 0;
    }
    const up = await admin.from("partidos").update(patch).eq("id", body.id);
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 400 });

    let knockoutSync = null;
    if (estado === "finalizado") {
      const recalc = await recalcPartidoStats(admin, body.id);
      if (recalc.error) return NextResponse.json({ error: recalc.error }, { status: 400 });
    }
    knockoutSync = await syncKnockoutTeams(admin);

    return NextResponse.json({ ok: true, knockout_sync: knockoutSync });
  }

  if (body.action === "apply_schedule") {
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Pega el horario en el cuadro de texto." }, { status: 400 });
    const kind = body.kind === "knockout" ? "knockout" : "groups";
    const year = Number(body.year) || new Date().getFullYear();
    const weekend = weekendFromStrings({
      viernes: body.weekendViernes,
      sabado: body.weekendSabado,
      domingo: body.weekendDomingo,
    });

    const [{ data: equipos, error: eErr }, { data: partidos, error: pErr }, { data: pistas, error: piErr }] =
      await Promise.all([
        admin.from("equipos").select("id,nombre"),
        admin
          .from("partidos")
          .select(
            "id,equipo_local_id,equipo_visitante_id,slot_local,slot_visitante,fase,competicion,ronda",
          ),
        admin.from("pistas").select("id,nombre").order("nombre"),
      ]);
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
    if (piErr) return NextResponse.json({ error: piErr.message }, { status: 400 });

    const teamList = (equipos ?? []) as { id: string; nombre: string }[];
    const pistaList = (pistas ?? []) as { id: string; nombre: string }[];
    const partidoList = (partidos ?? []) as {
      id: string;
      equipo_local_id: string | null;
      equipo_visitante_id: string | null;
      slot_local?: string | null;
      slot_visitante?: string | null;
      fase?: string | null;
      competicion?: string | null;
      ronda?: string | null;
    }[];

    let updated = 0;
    let pistasAsignadas = 0;
    const skipped: string[] = [];
    const errors: string[] = [];
    const pistaWarnings: string[] = [];

    if (kind === "knockout") {
      const parsed = parseKnockoutScheduleText(text, year, weekend);
      const knockoutPartidos = partidoList.filter((p) => (p.fase ?? "").startsWith("Cuadro -"));

      for (const row of parsed) {
        if (!row.ok) {
          if (row.raw) errors.push(`${row.raw}: ${row.reason}`);
          continue;
        }

        const candidates = findKnockoutPartidoCandidates(
          knockoutPartidos,
          row.line,
          tituloCompeticionMostrar,
        );

        if (candidates.length !== 1) {
          const label = `${row.line.slotLocal} vs ${row.line.slotVisit}`;
          const compHint = row.line.competicion ? ` (${row.line.competicion})` : "";
          skipped.push(
            `${label}${compHint}: ${candidates.length === 0 ? "cruce no encontrado (genera brackets antes)" : "varios cruces coinciden (añade Champions/Europa/Conference o ronda)"}`,
          );
          continue;
        }

        const fechaIso = toIsoFromParts(
          row.line.day,
          row.line.month,
          row.line.hour,
          row.line.minute,
          year,
        );
        const patch: Record<string, unknown> = { fecha_hora: fechaIso };
        const resolved = resolvePistaNombre(row.line.pista, pistaList);
        if (resolved.nombre) {
          patch.pista = resolved.nombre;
          pistasAsignadas += 1;
        }
        if (resolved.warning) {
          pistaWarnings.push(`${row.line.slotLocal} vs ${row.line.slotVisit}: ${resolved.warning}`);
        }

        const up = await admin.from("partidos").update(patch).eq("id", candidates[0].id);
        if (up.error) {
          errors.push(`${row.raw}: ${up.error.message}`);
          continue;
        }
        updated += 1;
      }

      return NextResponse.json({
        ok: true,
        kind,
        updated,
        pistasAsignadas,
        pistaWarnings,
        pistasEnApp: pistaList.map((p) => p.nombre),
        skipped,
        errors,
        parsedOk: parsed.filter((r) => r.ok).length,
        parsedTotal: parsed.length,
        partidosCruces: knockoutPartidos.length,
        equiposEnApp: teamList.map((t) => t.nombre).sort((a, b) => a.localeCompare(b, "es")),
      });
    }

    const parsed = parseScheduleText(text, year, weekend);

    for (const row of parsed) {
      if (!row.ok) {
        if (row.raw) errors.push(`${row.raw}: ${row.reason}`);
        continue;
      }

      const localId = findTeamIdByName(teamList, row.line.localName);
      const visitId = findTeamIdByName(teamList, row.line.visitName);
      if (!localId || !visitId) {
        skipped.push(
          `${row.line.localName} vs ${row.line.visitName}: equipo no encontrado (revisa nombres)`,
        );
        continue;
      }

      const candidates = partidoList.filter((p) => {
        const direct =
          p.equipo_local_id === localId && p.equipo_visitante_id === visitId;
        const reverse =
          p.equipo_local_id === visitId && p.equipo_visitante_id === localId;
        return direct || reverse;
      });

      if (candidates.length !== 1) {
        skipped.push(
          `${row.line.localName} vs ${row.line.visitName}: ${candidates.length === 0 ? "partido no encontrado" : "varios partidos coinciden"}`,
        );
        continue;
      }

      const fechaIso = toIsoFromParts(
        row.line.day,
        row.line.month,
        row.line.hour,
        row.line.minute,
        year,
      );
      const patch: Record<string, unknown> = { fecha_hora: fechaIso };
      const resolved = resolvePistaNombre(row.line.pista, pistaList);
      if (resolved.nombre) {
        patch.pista = resolved.nombre;
        pistasAsignadas += 1;
      }
      if (resolved.warning) {
        pistaWarnings.push(`${row.line.localName} vs ${row.line.visitName}: ${resolved.warning}`);
      }

      const up = await admin.from("partidos").update(patch).eq("id", candidates[0].id);
      if (up.error) {
        errors.push(`${row.raw}: ${up.error.message}`);
        continue;
      }
      updated += 1;
    }

    const partidosGrupo = partidoList.filter(
      (p) => p.equipo_local_id && p.equipo_visitante_id,
    ).length;

    return NextResponse.json({
      ok: true,
      kind,
      updated,
      pistasAsignadas,
      pistaWarnings,
      pistasEnApp: pistaList.map((p) => p.nombre),
      skipped,
      errors,
      parsedOk: parsed.filter((r) => r.ok).length,
      parsedTotal: parsed.length,
      partidosGrupo,
      equiposEnApp: teamList.map((t) => t.nombre).sort((a, b) => a.localeCompare(b, "es")),
    });
  }

  return NextResponse.json({ error: "Accion no soportada." }, { status: 400 });
}
