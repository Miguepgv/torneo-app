import { normalizeKnockoutSlotKey } from "@/lib/server/parse-schedule-lines";
import {
  golesPartidoLocal,
  golesPartidoVisitante,
  partidoTieneResultado,
} from "@/lib/partido-resultado";

export type StandingsPartido = {
  equipo_local_id: string | null;
  equipo_visitante_id: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
  estado?: string | null;
  faltas_local?: number | null;
  faltas_visitante?: number | null;
  amarillas_local?: number | null;
  amarillas_visitante?: number | null;
  rojas_local?: number | null;
  rojas_visitante?: number | null;
  rojas_agresion_local?: number | null;
  rojas_agresion_visitante?: number | null;
};

export type StandingsEquipo = {
  id: string;
  nombre: string;
  grupo?: string | null;
};

export type TournamentConfigRow = Record<string, unknown> | null;

type StandingsRow = {
  id: string;
  nombre: string;
  grupo: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
  fairplay: number;
  qualification: string | null;
  posGrupo: number;
};

const DEFAULT_TIEBREAKERS = [
  "goal_difference",
  "goals_for",
  "head_to_head_points",
  "fairplay_points",
  "less_losses",
];

function normalizeRule(raw: string) {
  const key = raw.trim().toLowerCase();
  if (!key) return "";
  if (key === "wins" || key === "victorias") return "";
  if (key === "golaverage_general" || key === "goal_average_general") return "goal_difference";
  if (key === "goles_favor" || key === "goals_scored") return "goals_for";
  if (key === "goles_contra") return "goals_against";
  if (key === "menos_derrotas") return "less_losses";
  return key;
}

function parseTieBreakers(configRow: TournamentConfigRow) {
  if (!configRow) return DEFAULT_TIEBREAKERS;

  const fromArray = configRow.criterios_desempate;
  if (Array.isArray(fromArray)) {
    const rules = fromArray.map((v) => normalizeRule(String(v))).filter(Boolean);
    return rules.length ? rules : DEFAULT_TIEBREAKERS;
  }

  if (typeof configRow.criterios_desempate === "string") {
    const rules = configRow.criterios_desempate
      .split(",")
      .map((v) => normalizeRule(v))
      .filter(Boolean);
    return rules.length ? rules : DEFAULT_TIEBREAKERS;
  }

  const byKeys = Object.keys(configRow)
    .filter((k) => /^desempate_?\d+$/i.test(k))
    .sort((a, b) => a.localeCompare(b, "es"));
  const rules = byKeys.map((k) => normalizeRule(String(configRow[k] ?? ""))).filter(Boolean);
  return rules.length ? rules : DEFAULT_TIEBREAKERS;
}

function parsePositions(text: string | null | undefined) {
  return (text ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function addPosGroupKeys(map: Map<string, string>, pos: number, grupoName: string, teamId: string) {
  const compactFull = grupoName.toUpperCase().replace(/\s+/g, "");
  const stripped = compactFull.replace(/^GRUPO/i, "");
  const lastLetter = stripped.match(/([A-Z])$/)?.[1];
  const keys = [
    normalizeKnockoutSlotKey(`${pos}${compactFull}`),
    normalizeKnockoutSlotKey(`${pos}${stripped}`),
  ];
  if (lastLetter) keys.push(normalizeKnockoutSlotKey(`${pos}${lastLetter}`));
  for (const k of keys) {
    if (!map.has(k)) map.set(k, teamId);
  }
}

function addBestSlotKeys(map: Map<string, string>, prefix: string, teamIds: string[]) {
  for (let i = 0; i < teamIds.length; i++) {
    map.set(normalizeKnockoutSlotKey(`${prefix}${i + 1}`), teamIds[i]);
  }
}

export type SlotMapOptions = {
  /** Grupos cuyos partidos ya están todos finalizados (p. ej. "A", "Grupo B"). */
  finalizedGroups: Set<string>;
  /** Mejores 2.º/3.º entre grupos (M2C-1…): solo cuando todos los grupos han terminado. */
  includeBestSlots: boolean;
};

/** Extrae el nombre de grupo tal como está en equipos.grupo (fase "Grupo X" → "X"). */
export function groupNameFromFase(fase: string | null | undefined): string | null {
  const m = (fase ?? "").trim().match(/^Grupo\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Grupos con todos sus partidos en estado finalizado. */
export function finalizedGroupNames(
  partidos: Array<{ fase?: string | null; estado?: string | null }>,
): Set<string> {
  const tallies = new Map<string, { total: number; done: number }>();
  for (const p of partidos) {
    const g = groupNameFromFase(p.fase);
    if (!g) continue;
    const t = tallies.get(g) ?? { total: 0, done: 0 };
    t.total += 1;
    if ((p.estado ?? "").toLowerCase() === "finalizado") t.done += 1;
    tallies.set(g, t);
  }
  const out = new Set<string>();
  for (const [g, { total, done }] of tallies) {
    if (total > 0 && total === done) out.add(g);
  }
  return out;
}

/** Mapa slot normalizado (1A, M2C-1…) → equipo_id según clasificación de grupos. */
export function computeSlotToTeamMap(
  equipos: StandingsEquipo[],
  partidos: StandingsPartido[],
  cfg: TournamentConfigRow,
  options: SlotMapOptions,
): Map<string, string> {
  const { finalizedGroups, includeBestSlots } = options;
  const rules = parseTieBreakers(cfg);
  const fairF = Number(cfg?.fairplay_falta_pts ?? 1);
  const fairA = Number(cfg?.fairplay_amarilla_pts ?? 3);
  const fairR = Number(cfg?.fairplay_roja_pts ?? 5);
  const fairRA = Number(cfg?.fairplay_roja_agresion_pts ?? 10);

  const table: Record<string, StandingsRow> = {};
  for (const e of equipos) {
    table[e.id] = {
      id: e.id,
      nombre: e.nombre,
      grupo: e.grupo?.trim() || "Sin grupo",
      pj: 0,
      pg: 0,
      pe: 0,
      pp: 0,
      gf: 0,
      gc: 0,
      dg: 0,
      pts: 0,
      fairplay: 0,
      qualification: null,
      posGrupo: 0,
    };
  }

  for (const p of partidos) {
    if (!partidoTieneResultado(p)) continue;
    const gl = golesPartidoLocal(p);
    const gv = golesPartidoVisitante(p);
    const l = table[p.equipo_local_id!];
    const v = table[p.equipo_visitante_id!];
    if (!l || !v) continue;

    l.pj += 1;
    v.pj += 1;
    l.gf += gl;
    l.gc += gv;
    v.gf += gv;
    v.gc += gl;
    l.fairplay +=
      Number(p.faltas_local ?? 0) * fairF +
      Number(p.amarillas_local ?? 0) * fairA +
      Number(p.rojas_local ?? 0) * fairR +
      Number(p.rojas_agresion_local ?? 0) * fairRA;
    v.fairplay +=
      Number(p.faltas_visitante ?? 0) * fairF +
      Number(p.amarillas_visitante ?? 0) * fairA +
      Number(p.rojas_visitante ?? 0) * fairR +
      Number(p.rojas_agresion_visitante ?? 0) * fairRA;

    if (gl > gv) {
      l.pg += 1;
      l.pts += 3;
      v.pp += 1;
    } else if (gl < gv) {
      v.pg += 1;
      v.pts += 3;
      l.pp += 1;
    } else {
      l.pe += 1;
      v.pe += 1;
      l.pts += 1;
      v.pts += 1;
    }
  }

  const allRows = Object.values(table).map((r) => ({ ...r, dg: r.gf - r.gc }));

  function h2hPoints(aId: string, bId: string) {
    let aPts = 0;
    let bPts = 0;
    for (const p of partidos) {
      if (!partidoTieneResultado(p)) continue;
      const gl = golesPartidoLocal(p);
      const gv = golesPartidoVisitante(p);
      const direct =
        (p.equipo_local_id === aId && p.equipo_visitante_id === bId) ||
        (p.equipo_local_id === bId && p.equipo_visitante_id === aId);
      if (!direct) continue;
      const aLocal = p.equipo_local_id === aId;
      const aGoals = aLocal ? gl : gv;
      const bGoals = aLocal ? gv : gl;
      if (aGoals > bGoals) aPts += 3;
      else if (aGoals < bGoals) bPts += 3;
      else {
        aPts += 1;
        bPts += 1;
      }
    }
    return { aPts, bPts };
  }

  function sortRows(rowsToSort: StandingsRow[]) {
    rowsToSort.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      for (const rule of rules) {
        if (rule === "head_to_head_points") {
          const h = h2hPoints(a.id, b.id);
          if (h.bPts !== h.aPts) return h.bPts - h.aPts;
        }
        if (rule === "goal_difference" && b.dg !== a.dg) return b.dg - a.dg;
        if (rule === "goals_for" && b.gf !== a.gf) return b.gf - a.gf;
        if (rule === "less_losses" && a.pp !== b.pp) return a.pp - b.pp;
        if (rule === "goals_against" && a.gc !== b.gc) return a.gc - b.gc;
        if (rule === "fairplay_points" && a.fairplay !== b.fairplay) return a.fairplay - b.fairplay;
      }
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }

  const byGroup: Record<string, StandingsRow[]> = {};
  for (const row of allRows) {
    byGroup[row.grupo] = byGroup[row.grupo] ?? [];
    byGroup[row.grupo].push(row);
  }
  for (const g of Object.keys(byGroup)) sortRows(byGroup[g]);

  const championsDirect = parsePositions(String(cfg?.champions_direct_positions ?? ""));
  const europaDirect = parsePositions(String(cfg?.europa_direct_positions ?? ""));
  const conferenceDirect = parsePositions(String(cfg?.conference_direct_positions ?? ""));
  const bestPools: Record<string, StandingsRow[]> = { s2: [], s3: [], s4: [], s5: [] };
  const groupSizes: Record<string, number> = {};
  for (const g of Object.keys(byGroup)) groupSizes[g] = byGroup[g].length;
  const maxGroupSize = Math.max(...Object.values(groupSizes), 0);
  const minGroupSize = Math.min(...Object.values(groupSizes), maxGroupSize);
  const excludeLastForBest = Boolean(cfg?.excluir_ultimo_grupo_mayor ?? true) && maxGroupSize > minGroupSize;

  function rowWithoutMatchesVs(row: StandingsRow, rivalId: string) {
    if (!excludeLastForBest || !rivalId) return { ...row };
    const out: StandingsRow = { ...row };
    for (const p of partidos) {
      if (!partidoTieneResultado(p)) continue;
      const gl = golesPartidoLocal(p);
      const gv = golesPartidoVisitante(p);
      const affects =
        (p.equipo_local_id === row.id && p.equipo_visitante_id === rivalId) ||
        (p.equipo_local_id === rivalId && p.equipo_visitante_id === row.id);
      if (!affects) continue;
      const rowIsLocal = p.equipo_local_id === row.id;
      const gf = rowIsLocal ? gl : gv;
      const gc = rowIsLocal ? gv : gl;
      out.pj -= 1;
      out.gf -= gf;
      out.gc -= gc;
      out.dg = out.gf - out.gc;
      if (gf > gc) {
        out.pg -= 1;
        out.pts -= 3;
      } else if (gf < gc) {
        out.pp -= 1;
      } else {
        out.pe -= 1;
        out.pts -= 1;
      }
    }
    return out;
  }

  for (const g of Object.keys(byGroup)) {
    const arr = byGroup[g];
    const groupDone = finalizedGroups.has(g);
    for (let i = 0; i < arr.length; i++) {
      const pos = i + 1;
      arr[i].posGrupo = pos;
      if (!groupDone || !includeBestSlots) continue;
      const isBigGroup = arr.length === maxGroupSize;
      const lastOfGroup = isBigGroup ? arr[arr.length - 1]?.id : "";
      if (pos === 2) bestPools.s2.push(rowWithoutMatchesVs(arr[i], lastOfGroup));
      if (pos === 3) bestPools.s3.push(rowWithoutMatchesVs(arr[i], lastOfGroup));
      if (pos === 4) bestPools.s4.push(rowWithoutMatchesVs(arr[i], lastOfGroup));
      if (pos === 5) bestPools.s5.push(rowWithoutMatchesVs(arr[i], lastOfGroup));
    }
  }
  sortRows(bestPools.s2);
  sortRows(bestPools.s3);
  sortRows(bestPools.s4);
  sortRows(bestPools.s5);

  const cBest2 = Number(cfg?.champions_best_seconds ?? 0);
  const cBest3 = Number(cfg?.champions_best_thirds ?? 0);
  const eBest2 = Number(cfg?.europa_best_seconds ?? 0);
  const eBest3 = Number(cfg?.europa_best_thirds ?? 0);
  const fBest2 = Number(cfg?.conference_best_seconds ?? 0);
  const fBest3 = Number(cfg?.conference_best_thirds ?? 0);
  const fBest4 = Number(cfg?.conference_best_fourths ?? 0);
  const fBest5 = Number(cfg?.conference_best_fifths ?? 0);
  const qualificationMode = String(cfg?.qualification_mode ?? "advanced");

  const m2c: string[] = [];
  const m3c: string[] = [];
  const m2e: string[] = [];
  const m3e: string[] = [];
  const m2f: string[] = [];
  const m3f: string[] = [];
  const m4f: string[] = [];
  const m5f: string[] = [];

  function assignBest(pool: StandingsRow[], limit: number, label: "champions" | "europa" | "conference", track: string[]) {
    let taken = 0;
    for (let i = 0; i < pool.length; i++) {
      if (taken >= limit) break;
      const target = table[pool[i].id];
      if (!target || target.qualification) continue;
      target.qualification = label;
      track.push(target.id);
      taken += 1;
    }
  }

  if (includeBestSlots) {
    for (const g of Object.keys(byGroup)) {
      if (!finalizedGroups.has(g)) continue;
      for (const row of byGroup[g]) {
        if (championsDirect.includes(row.posGrupo)) row.qualification = "champions";
      }
    }
  }

  if (includeBestSlots && qualificationMode !== "simple") {
    assignBest(bestPools.s2, cBest2, "champions", m2c);
    assignBest(bestPools.s3, cBest3, "champions", m3c);
  }

  if (includeBestSlots) {
    for (const g of Object.keys(byGroup)) {
      if (!finalizedGroups.has(g)) continue;
      for (const row of byGroup[g]) {
        if (!row.qualification && europaDirect.includes(row.posGrupo)) row.qualification = "europa";
      }
    }
  }

  if (includeBestSlots && qualificationMode !== "simple") {
    assignBest(bestPools.s2, eBest2, "europa", m2e);
    assignBest(bestPools.s3, eBest3, "europa", m3e);
  }

  if (includeBestSlots) {
    for (const g of Object.keys(byGroup)) {
      if (!finalizedGroups.has(g)) continue;
      for (const row of byGroup[g]) {
        if (!row.qualification && conferenceDirect.includes(row.posGrupo)) row.qualification = "conference";
      }
    }
  }

  if (includeBestSlots && qualificationMode !== "simple") {
    assignBest(bestPools.s2, fBest2, "conference", m2f);
    assignBest(bestPools.s3, fBest3, "conference", m3f);
    assignBest(bestPools.s4, fBest4, "conference", m4f);
    assignBest(bestPools.s5, fBest5, "conference", m5f);
  }

  const slotMap = new Map<string, string>();
  for (const g of Object.keys(byGroup)) {
    if (!finalizedGroups.has(g)) continue;
    const arr = byGroup[g];
    for (let i = 0; i < arr.length; i++) {
      addPosGroupKeys(slotMap, i + 1, g, arr[i].id);
    }
  }

  if (includeBestSlots) {
    addBestSlotKeys(slotMap, "M2C-", m2c);
    addBestSlotKeys(slotMap, "M3C-", m3c);
    addBestSlotKeys(slotMap, "M2E-", m2e);
    addBestSlotKeys(slotMap, "M3E-", m3e);
    addBestSlotKeys(slotMap, "M2F-", m2f);
    addBestSlotKeys(slotMap, "M3F-", m3f);
    addBestSlotKeys(slotMap, "M4F-", m4f);
    addBestSlotKeys(slotMap, "M5F-", m5f);
  }

  return slotMap;
}

export function allGroupMatchesFinalized(
  partidos: Array<{ fase?: string | null; estado?: string | null }>,
): boolean {
  const groupMatches = partidos.filter((p) => (p.fase ?? "").startsWith("Grupo "));
  if (!groupMatches.length) return false;
  return groupMatches.every((p) => (p.estado ?? "").toLowerCase() === "finalizado");
}
