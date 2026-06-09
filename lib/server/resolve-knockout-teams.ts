import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeKnockoutSlotKey } from "@/lib/server/parse-schedule-lines";
import {
  allGroupMatchesFinalized,
  computeSlotToTeamMap,
  finalizedGroupNames,
  type StandingsEquipo,
  type StandingsPartido,
} from "@/lib/server/torneo-standings";
import { partidoTieneResultado } from "@/lib/partido-resultado";

type KnockoutPartido = {
  id: string;
  fase?: string | null;
  competicion?: string | null;
  ronda?: string | null;
  orden?: number | null;
  estado?: string | null;
  slot_local?: string | null;
  slot_visitante?: string | null;
  equipo_local_id?: string | null;
  equipo_visitante_id?: string | null;
  goles_local?: number | null;
  goles_visitante?: number | null;
};

export type KnockoutSyncResult = {
  ok: boolean;
  groupsComplete: boolean;
  /** Grupos recién completos cuyos slots (1A, 2A…) ya se pueden resolver. */
  finalizedGroups: string[];
  updated: number;
  reason?: string;
};

function isKnockoutFase(fase: string | null | undefined) {
  const f = (fase ?? "").trim();
  return f.startsWith("Cuadro ") || f.startsWith("Cruce ");
}

function parseWinnerFeedSlot(slot: string | null | undefined): { prevRound: string; orden: number } | null {
  const s = (slot ?? "").trim();
  if (!s.toUpperCase().startsWith("G")) return null;
  const tail = s.slice(1).trim();
  const mSpace = tail.match(/^(.+?)\s+(\d+)\s*$/);
  if (mSpace) return { prevRound: mSpace[1].trim(), orden: Number(mSpace[2]) };
  const mTight = tail.match(/^(.+?)(\d+)$/);
  if (mTight) return { prevRound: mTight[1].trim(), orden: Number(mTight[2]) };
  return null;
}

function sameKnockRound(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function compBucket(comp: string | null | undefined) {
  return (comp ?? "").trim().toUpperCase();
}

function knockoutWinner(p: KnockoutPartido): string | null {
  if ((p.estado ?? "").toLowerCase() !== "finalizado") return null;
  if (p.goles_local === null || p.goles_visitante === null) return null;
  if (p.goles_local > p.goles_visitante) return p.equipo_local_id ?? null;
  if (p.goles_visitante > p.goles_local) return p.equipo_visitante_id ?? null;
  return null;
}

function resolveFromStandingsSlot(slot: string | null | undefined, slotMap: Map<string, string>): string | null {
  if (!slot) return null;
  const trimmed = slot.trim();
  if (!trimmed || trimmed.toUpperCase() === "BYE") return null;
  if (trimmed.toUpperCase().startsWith("G")) return null;
  return slotMap.get(normalizeKnockoutSlotKey(trimmed)) ?? null;
}

function resolveFromWinnerSlot(
  slot: string | null | undefined,
  match: KnockoutPartido,
  koPartidos: KnockoutPartido[],
): string | null {
  const feed = parseWinnerFeedSlot(slot);
  if (!feed || feed.orden <= 0) return null;
  const bucket = compBucket(match.competicion);
  const feeder = koPartidos.find(
    (m) =>
      compBucket(m.competicion) === bucket &&
      sameKnockRound(m.ronda, feed.prevRound) &&
      Number(m.orden) === Number(feed.orden),
  );
  if (!feeder) return null;
  return knockoutWinner(feeder);
}

function isStandingsSlot(slot: string | null | undefined) {
  const trimmed = (slot ?? "").trim();
  if (!trimmed || trimmed.toUpperCase() === "BYE") return false;
  return !trimmed.toUpperCase().startsWith("G");
}

function resolveSide(
  side: "local" | "visitante",
  match: KnockoutPartido,
  slotMap: Map<string, string>,
  koPartidos: KnockoutPartido[],
): string | null {
  const slot = side === "local" ? match.slot_local : match.slot_visitante;
  const trimmed = (slot ?? "").trim();
  if (!trimmed || trimmed.toUpperCase() === "BYE") return null;

  if (trimmed.toUpperCase().startsWith("G")) {
    return resolveFromWinnerSlot(slot, match, koPartidos);
  }

  const resolved = resolveFromStandingsSlot(slot, slotMap);
  if (resolved) return resolved;
  if (isStandingsSlot(slot)) return null;
  return null;
}

function resolveKnockoutSide(
  side: "local" | "visitante",
  match: KnockoutPartido,
  slotMap: Map<string, string>,
  koPartidos: KnockoutPartido[],
  currentId: string | null,
): string | null {
  const resolved = resolveSide(side, match, slotMap, koPartidos);
  if (resolved) return resolved;
  const slot = side === "local" ? match.slot_local : match.slot_visitante;
  if (isStandingsSlot(slot)) return null;
  return currentId;
}

/** Rellena equipos en cruces cuando la fase de grupos ha terminado y propaga ganadores G-slots. */
export async function syncKnockoutTeams(admin: SupabaseClient): Promise<KnockoutSyncResult> {
  const [{ data: equipos, error: eErr }, { data: partidos, error: pErr }, { data: cfg, error: cErr }] =
    await Promise.all([
      admin.from("equipos").select("id,nombre,grupo").order("nombre"),
      admin
        .from("partidos")
        .select(
          "id,fase,competicion,ronda,orden,estado,slot_local,slot_visitante,equipo_local_id,equipo_visitante_id,goles_local,goles_visitante,faltas_local,faltas_visitante,amarillas_local,amarillas_visitante,rojas_local,rojas_visitante,rojas_agresion_local,rojas_agresion_visitante",
        ),
      admin.from("configuracion_torneo").select("*").limit(1).maybeSingle(),
    ]);

  if (eErr) return { ok: false, groupsComplete: false, finalizedGroups: [], updated: 0, reason: eErr.message };
  if (pErr) return { ok: false, groupsComplete: false, finalizedGroups: [], updated: 0, reason: pErr.message };
  if (cErr) return { ok: false, groupsComplete: false, finalizedGroups: [], updated: 0, reason: cErr.message };

  const allPartidos = (partidos ?? []) as KnockoutPartido[];
  const koPartidos = allPartidos.filter((p) => isKnockoutFase(p.fase));
  if (!koPartidos.length) {
    return { ok: true, groupsComplete: false, finalizedGroups: [], updated: 0, reason: "Sin cruces" };
  }

  const finalizedGroups = finalizedGroupNames(allPartidos);
  const groupsComplete = allGroupMatchesFinalized(allPartidos);
  let slotMap: Map<string, string>;
  if (finalizedGroups.size > 0) {
    const groupScorePartidos = allPartidos.filter(
      (p) => (p.fase ?? "").startsWith("Grupo ") && partidoTieneResultado(p),
    ) as StandingsPartido[];

    slotMap = computeSlotToTeamMap(
      (equipos ?? []) as StandingsEquipo[],
      groupScorePartidos,
      (cfg as Record<string, unknown> | null) ?? null,
      {
        finalizedGroups,
        includeBestSlots: groupsComplete,
      },
    );
  } else {
    slotMap = new Map();
  }

  let updated = 0;

  for (let pass = 0; pass < 6; pass++) {
    let changedThisPass = false;

    for (const p of koPartidos) {
      const curLocal = p.equipo_local_id ?? null;
      const curVisit = p.equipo_visitante_id ?? null;

      const nextLocal = resolveKnockoutSide("local", p, slotMap, koPartidos, curLocal);
      const nextVisit = resolveKnockoutSide("visitante", p, slotMap, koPartidos, curVisit);

      const patch: Record<string, string | null> = {};
      if (nextLocal !== curLocal) patch.equipo_local_id = nextLocal;
      if (nextVisit !== curVisit) patch.equipo_visitante_id = nextVisit;

      if (Object.keys(patch).length) {
        const up = await admin.from("partidos").update(patch).eq("id", p.id);
        if (up.error) {
          return {
            ok: false,
            groupsComplete,
            finalizedGroups: [...finalizedGroups],
            updated,
            reason: up.error.message,
          };
        }
        if ("equipo_local_id" in patch) p.equipo_local_id = patch.equipo_local_id;
        if ("equipo_visitante_id" in patch) p.equipo_visitante_id = patch.equipo_visitante_id;
        updated += Object.keys(patch).length;
        changedThisPass = true;
      }
    }

    if (!changedThisPass) break;
  }

  return {
    ok: true,
    groupsComplete,
    finalizedGroups: [...finalizedGroups].sort((a, b) => a.localeCompare(b, "es")),
    updated,
  };
}
