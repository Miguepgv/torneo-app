"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { tituloCompeticionMostrar } from "@/lib/torneo-constants";
import {
  golesPartidoLocal,
  golesPartidoVisitante,
  partidoCuentaEnClasificacion,
} from "@/lib/partido-resultado";
import {
  allGroupMatchesFinalized,
  finalizedGroupNames,
  knockoutSlotHintLabel,
  knockoutSlotPrimaryLabel,
  normalizeKoSlotKey,
  type KnockoutSlotLockContext,
} from "@/lib/knockout-grupos";

type Equipo = { id: string; nombre: string };
type Partido = {
  id: string;
  equipo_local_id: string | null;
  equipo_visitante_id: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
  estado?: string | null;
  fase?: string | null;
  faltas_local?: number | null;
  faltas_visitante?: number | null;
  amarillas_local?: number | null;
  amarillas_visitante?: number | null;
  rojas_local?: number | null;
  rojas_visitante?: number | null;
  rojas_agresion_local?: number | null;
  rojas_agresion_visitante?: number | null;
};
type ClasifRow = {
  id: string;
  nombre: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
};
type StandingsRow = ClasifRow & {
  grupo: string;
  fairplay: number;
  qualification: string | null;
  posGrupo: number;
};
type KnockoutMatch = {
  id: string;
  competicion: string | null;
  ronda: string | null;
  orden: number | null;
  slot_local?: string | null;
  slot_visitante?: string | null;
  fase: string | null;
  estado: string | null;
  fecha_hora: string | null;
  equipo_local_id: string | null;
  equipo_visitante_id: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
};
type TournamentConfig = {
  criterios_desempate?: string[] | string | null;
  fairplay_falta_pts?: number | null;
  fairplay_amarilla_pts?: number | null;
  fairplay_roja_pts?: number | null;
  fairplay_roja_agresion_pts?: number | null;
  champions_direct_positions?: string | null;
  champions_best_seconds?: number | null;
  champions_best_thirds?: number | null;
  europa_direct_positions?: string | null;
  europa_best_seconds?: number | null;
  europa_best_thirds?: number | null;
  conference_direct_positions?: string | null;
  conference_best_seconds?: number | null;
  conference_best_thirds?: number | null;
  conference_best_fourths?: number | null;
  conference_best_fifths?: number | null;
  excluir_ultimo_grupo_mayor?: boolean | null;
  [key: string]: unknown;
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

function parseTieBreakers(configRow: Record<string, unknown> | null) {
  if (!configRow) return DEFAULT_TIEBREAKERS;

  const fromArray = configRow.criterios_desempate;
  if (Array.isArray(fromArray)) {
    const rules = fromArray
      .map((v) => normalizeRule(String(v)))
      .filter(Boolean);
    return rules.length ? rules : DEFAULT_TIEBREAKERS;
  }

  const fromString = configRow.criterios_desempate;
  if (typeof fromString === "string") {
    const rules = fromString
      .split(",")
      .map((v) => normalizeRule(v))
      .filter(Boolean);
    return rules.length ? rules : DEFAULT_TIEBREAKERS;
  }

  const byKeys = Object.keys(configRow)
    .filter((k) => /^desempate_?\d+$/i.test(k))
    .sort((a, b) => a.localeCompare(b, "es"));
  const rules = byKeys
    .map((k) => normalizeRule(String(configRow[k] ?? "")))
    .filter(Boolean);
  return rules.length ? rules : DEFAULT_TIEBREAKERS;
}

function parsePositions(text: string | null | undefined) {
  return (text ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function ruleLabel(rule: string) {
  if (rule === "goal_difference") return "Golaverage general";
  if (rule === "goals_for") return "Goles a favor";
  if (rule === "goals_against") return "Menos goles en contra";
  if (rule === "head_to_head_points") return "Enfrentamiento directo";
  if (rule === "fairplay_points") return "Juego limpio (menos puntos)";
  if (rule === "less_losses") return "Menos derrotas";
  return rule;
}

function qualificationColor(q: string | null) {
  if (q === "champions") return "bg-blue-50";
  if (q === "europa") return "bg-orange-50";
  if (q === "conference") return "bg-green-50";
  return "";
}

function compOrderKey(name: string) {
  const n = name.toLowerCase();
  if (n.includes("champions")) return 0;
  if (n.includes("europa")) return 1;
  if (n.includes("conference")) return 2;
  return 9;
}

function roundOrderKey(r: string) {
  const s = r.toLowerCase();
  if (s.includes("octav")) return 1;
  if (s.includes("cuart")) return 2;
  if (s.includes("semi")) return 3;
  if (s.includes("final") && !s.includes("semi")) return 4;
  return 0;
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

/** Código compacto visible en cada cruce: O / C / S / F + número → corresponde a slots G+Ronda+N en la siguiente ronda. */
function knockoutRoundLetter(roundName: string): string {
  const s = roundName.trim().toLowerCase();
  if (s.includes("octav")) return "O";
  if (s.includes("cuart")) return "C";
  if (s.includes("semi")) return "S";
  if (s.includes("final") && !s.includes("semi")) return "F";
  const mDigit = roundName.match(/(\d+)/);
  if (s.includes("ronda") && mDigit?.[1]) return `R${mDigit[1]}`;
  const ch = roundName.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

function knockoutMatchSlotCode(ronda: string | null, orden: number | null): string {
  const o = typeof orden === "number" && orden > 0 ? orden : 0;
  if (!ronda?.trim() || !o) return "";
  return `${knockoutRoundLetter(ronda)}${o}`;
}

function formatPlaceholderSlot(slot: string): string {
  const wf = parseWinnerFeedSlot(slot);
  if (wf && wf.orden > 0) return knockoutMatchSlotCode(wf.prevRound, wf.orden);
  return slot.trim();
}

function knockoutSidePrimary(
  m: KnockoutMatch,
  side: "local" | "visitante",
  teamNames: Record<string, string>,
  ctx: KnockoutSlotLockContext,
) {
  const id = side === "local" ? m.equipo_local_id : m.equipo_visitante_id;
  const slot = side === "local" ? m.slot_local : m.slot_visitante;
  return knockoutSlotPrimaryLabel(slot, id, teamNames, formatPlaceholderSlot, ctx);
}

function knockoutSideHintLine(
  m: KnockoutMatch,
  side: "local" | "visitante",
  hints: Map<string, string>,
  ctx: KnockoutSlotLockContext,
) {
  const slot = side === "local" ? m.slot_local : m.slot_visitante;
  const hint = liveStandingHint(slot, hints);
  return knockoutSlotHintLabel(slot, hint, ctx);
}

function knockoutCompTheme(comp: string) {
  const n = comp.toLowerCase();
  if (n.includes("champions")) {
    return {
      ring: "ring-2 ring-blue-500/50 shadow-lg shadow-blue-900/10",
      head: "bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900",
      subtitle: "text-blue-100",
      roundCol: "bg-blue-950/10 border-blue-200/70",
      matchCard: "border-blue-200/80 bg-white shadow-sm hover:border-blue-400",
      accentText: "text-blue-900",
    };
  }
  if (n.includes("europa")) {
    return {
      ring: "ring-2 ring-orange-400/55 shadow-lg shadow-orange-900/15",
      head: "bg-gradient-to-r from-orange-500 via-orange-600 to-amber-800",
      subtitle: "text-orange-50",
      roundCol: "bg-orange-950/10 border-orange-200/70",
      matchCard: "border-orange-200/90 bg-white shadow-sm hover:border-orange-400",
      accentText: "text-orange-950",
    };
  }
  if (n.includes("conference")) {
    return {
      ring: "ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-900/10",
      head: "bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-900",
      subtitle: "text-emerald-50",
      roundCol: "bg-emerald-950/10 border-emerald-200/70",
      matchCard: "border-emerald-200/80 bg-white shadow-sm hover:border-emerald-400",
      accentText: "text-emerald-950",
    };
  }
  return {
    ring: "ring-1 ring-slate-200 shadow-md",
    head: "bg-gradient-to-r from-slate-700 to-slate-900",
    subtitle: "text-slate-200",
    roundCol: "bg-slate-100 border-slate-200",
    matchCard: "border-slate-200 bg-white",
    accentText: "text-slate-900",
  };
}

function sameKnockRound(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function buildStandingPlaceholderHints(rows: StandingsRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const raw = (r.grupo ?? "").trim();
    if (!raw || !Number.isFinite(r.posGrupo) || r.posGrupo <= 0) continue;
    const compactFull = raw.toUpperCase().replace(/\s+/g, "");
    const stripped = compactFull.replace(/^GRUPO/i, "");
    const lastLetter = stripped.match(/([A-Z])$/);
    const keys = new Set<string>([
      normalizeKoSlotKey(`${r.posGrupo}${compactFull}`),
      normalizeKoSlotKey(`${r.posGrupo}${stripped}`),
    ]);
    if (lastLetter) keys.add(normalizeKoSlotKey(`${r.posGrupo}${lastLetter[1]}`));
    for (const k of keys) {
      if (!map.has(k)) map.set(k, r.nombre);
    }
  }
  return map;
}

function liveStandingHint(slot: string | null | undefined, hints: Map<string, string>): string | null {
  if (!slot) return null;
  const trimmed = slot.trim();
  const up = trimmed.toUpperCase();
  if (!trimmed || up === "BYE") return null;
  if (up.startsWith("G")) return null;
  if (/^M2C/i.test(trimmed)) return "2.º Champions Cofrade (clasif. provisional)";
  if (/^M3C/i.test(trimmed)) return "3.º Champions Cofrade (clasif. provisional)";
  if (/^M2E/i.test(trimmed)) return "2.º Europa Cofrade (clasif. provisional)";
  if (/^M3E/i.test(trimmed)) return "3.º Europa Cofrade (clasif. provisional)";
  if (/^M2F/i.test(trimmed)) return "2.º Conference Cofrade (clasif. provisional)";
  if (/^M3F/i.test(trimmed)) return "3.º Conference Cofrade (clasif. provisional)";
  if (/^M4F/i.test(trimmed)) return "4.º Conference Cofrade (clasif. provisional)";
  if (/^M5F/i.test(trimmed)) return "5.º Conference Cofrade (clasif. provisional)";
  if (/^M\d/i.test(trimmed)) return "Mejor clasificado (provisional)";
  return hints.get(normalizeKoSlotKey(trimmed)) ?? null;
}

function findFeederMatch(
  matches: KnockoutMatch[],
  bucket: string,
  slot: string | null | undefined,
): KnockoutMatch | undefined {
  const p = parseWinnerFeedSlot(slot);
  if (!p) return undefined;
  return matches.find(
    (m) =>
      (m.competicion ?? "").toUpperCase() === bucket &&
      sameKnockRound(m.ronda, p.prevRound) &&
      Number(m.orden) === Number(p.orden),
  );
}

function pickFinalMatch(compMatches: KnockoutMatch[]): KnockoutMatch | null {
  const finals = compMatches.filter((m) => {
    const rl = (m.ronda ?? "").toLowerCase();
    return rl.includes("final") && !rl.includes("semi");
  });
  if (!finals.length) return null;
  finals.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return finals[0] ?? null;
}

type BracketNode =
  | { kind: "leaf"; match: KnockoutMatch }
  | { kind: "pair"; match: KnockoutMatch; up: BracketNode; down: BracketNode }
  | { kind: "single"; match: KnockoutMatch; child: BracketNode };

function buildBracketTree(root: KnockoutMatch, compMatches: KnockoutMatch[], bucket: string): BracketNode {
  const lf = findFeederMatch(compMatches, bucket, root.slot_local);
  const rf = findFeederMatch(compMatches, bucket, root.slot_visitante);

  if (!lf && !rf) return { kind: "leaf", match: root };
  if (lf && rf) {
    return {
      kind: "pair",
      match: root,
      up: buildBracketTree(lf, compMatches, bucket),
      down: buildBracketTree(rf, compMatches, bucket),
    };
  }
  const only = lf ?? rf;
  if (!only) return { kind: "leaf", match: root };
  return { kind: "single", match: root, child: buildBracketTree(only, compMatches, bucket) };
}

function BracketForkSvg({ variant }: { variant: "dual" | "single" }) {
  if (variant === "single") {
    return (
      <svg viewBox="0 0 42 58" className="h-full w-full text-slate-500" preserveAspectRatio="none" aria-hidden>
        <path d="M 1 29 H 40" stroke="currentColor" strokeWidth={2.5} fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 42 106" className="h-full w-full text-slate-500" preserveAspectRatio="none" aria-hidden>
      <path
        d="M 1 24 H 24 M 1 82 H 24 M 24 24 V 82 M 24 53 H 40"
        stroke="currentColor"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type KnockoutTheme = ReturnType<typeof knockoutCompTheme>;

function KnockoutMatchCard(props: {
  m: KnockoutMatch;
  theme: KnockoutTheme;
  teamNames: Record<string, string>;
  hints: Map<string, string>;
  slotLockCtx: KnockoutSlotLockContext;
}) {
  const { m, theme, teamNames, hints, slotLockCtx } = props;
  const code = knockoutMatchSlotCode(m.ronda, m.orden);
  const localPrimary = knockoutSidePrimary(m, "local", teamNames, slotLockCtx);
  const visitPrimary = knockoutSidePrimary(m, "visitante", teamNames, slotLockCtx);
  const localHint = knockoutSideHintLine(m, "local", hints, slotLockCtx);
  const visitHint = knockoutSideHintLine(m, "visitante", hints, slotLockCtx);

  return (
    <div className={`w-[min(100%,236px)] rounded-xl border-2 p-3 transition ${theme.matchCard}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5">
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-bold leading-snug text-slate-900">{localPrimary}</p>
          {localHint ? <p className="truncate text-[10px] leading-snug text-slate-600">({localHint})</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center px-1">
          {code ? (
            <span
              className={`mb-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tracking-tight ring-1 ${theme.accentText} border-black/10 bg-white/95`}
            >
              {code}
            </span>
          ) : null}
          <span className="whitespace-nowrap text-base font-bold text-violet-700 sm:text-lg">
            {m.goles_local ?? 0} — {m.goles_visitante ?? 0}
          </span>
        </div>
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-bold leading-snug text-slate-900">{visitPrimary}</p>
          {visitHint ? <p className="truncate text-[10px] leading-snug text-slate-600">({visitHint})</p> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-600">
        <span
          className={`rounded-full px-2 py-0.5 font-semibold ${
            (m.estado ?? "").toLowerCase() === "jugandose"
              ? "bg-emerald-100 text-emerald-800"
              : (m.estado ?? "").toLowerCase() === "finalizado"
                ? "bg-slate-200 text-slate-800"
                : "bg-amber-50 text-amber-900"
          }`}
        >
          {(m.estado ?? "pendiente").replace(/^./, (c) => c.toUpperCase())}
        </span>
        {m.fecha_hora ? (
          <span>{new Date(m.fecha_hora).toLocaleString("es-ES")}</span>
        ) : (
          <span>Sin fecha</span>
        )}
      </div>
    </div>
  );
}

function BracketSubtree(props: {
  node: BracketNode;
  theme: KnockoutTheme;
  teamNames: Record<string, string>;
  hints: Map<string, string>;
  slotLockCtx: KnockoutSlotLockContext;
}) {
  const { node, theme, teamNames, hints, slotLockCtx } = props;
  if (node.kind === "leaf") {
    return (
      <KnockoutMatchCard m={node.match} theme={theme} teamNames={teamNames} hints={hints} slotLockCtx={slotLockCtx} />
    );
  }
  if (node.kind === "single") {
    return (
      <div className="flex flex-row flex-nowrap items-center gap-2">
        <BracketSubtree node={node.child} theme={theme} teamNames={teamNames} hints={hints} slotLockCtx={slotLockCtx} />
        <div className="flex min-h-[3.75rem] w-10 shrink-0 self-stretch sm:w-14">
          <BracketForkSvg variant="single" />
        </div>
        <KnockoutMatchCard m={node.match} theme={theme} teamNames={teamNames} hints={hints} slotLockCtx={slotLockCtx} />
      </div>
    );
  }
  return (
    <div className="flex flex-row flex-nowrap items-center gap-2">
      <div className="flex shrink-0 flex-col justify-evenly gap-14 py-12 sm:gap-24 sm:py-16">
        <BracketSubtree node={node.up} theme={theme} teamNames={teamNames} hints={hints} slotLockCtx={slotLockCtx} />
        <BracketSubtree node={node.down} theme={theme} teamNames={teamNames} hints={hints} slotLockCtx={slotLockCtx} />
      </div>
      <div className="flex min-h-[10rem] w-10 shrink-0 self-stretch sm:min-h-[13rem] sm:w-14">
        <BracketForkSvg variant="dual" />
      </div>
      <KnockoutMatchCard m={node.match} theme={theme} teamNames={teamNames} hints={hints} slotLockCtx={slotLockCtx} />
    </div>
  );
}

export default function ClasificacionesPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<StandingsRow[]>([]);
  const [tieBreakers, setTieBreakers] = useState<string[]>(DEFAULT_TIEBREAKERS);
  const [config, setConfig] = useState<TournamentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState<"grupos" | "cuadro">("grupos");
  const [knockout, setKnockout] = useState<KnockoutMatch[]>([]);
  const [groupPartidos, setGroupPartidos] = useState<Partido[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [poll, setPoll] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setPoll((p) => p + 1), 12000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      const [{ data: equiposData, error: eErr }, { data: partidosData, error: pErr }, { data: cfgData }, { data: koData }] =
        await Promise.all([
          supabase.from("equipos").select("id,nombre,grupo").order("nombre"),
          supabase
            .from("partidos")
            .select("id,equipo_local_id,equipo_visitante_id,goles_local,goles_visitante,estado,fase,faltas_local,faltas_visitante,amarillas_local,amarillas_visitante,rojas_local,rojas_visitante,rojas_agresion_local,rojas_agresion_visitante"),
          supabase.from("configuracion_torneo").select("*").limit(1).maybeSingle(),
          supabase
            .from("partidos")
            .select("id,competicion,ronda,orden,slot_local,slot_visitante,fase,estado,fecha_hora,equipo_local_id,equipo_visitante_id,goles_local,goles_visitante")
            .or("fase.ilike.Cruce %,fase.ilike.Cuadro %")
            .order("competicion", { ascending: true })
            .order("orden", { ascending: true }),
        ]);

      if (eErr) {
        setMessage(`Error cargando equipos: ${eErr.message}`);
        setRows([]);
        setLoading(false);
        return;
      }
      if (pErr) {
        setMessage(`Error cargando partidos: ${pErr.message}`);
        setRows([]);
        setLoading(false);
        return;
      }

      const equipos = (equiposData as (Equipo & { grupo?: string | null })[]) ?? [];
      const partidos = (partidosData as Partido[]) ?? [];
      setGroupPartidos(partidos);
      const cfg = (cfgData as TournamentConfig | null) ?? null;
      const ko = (koData as KnockoutMatch[]) ?? [];
      setKnockout(ko);
      const names: Record<string, string> = {};
      for (const e of equipos) names[e.id] = e.nombre;
      setTeamNames(names);
      setConfig(cfg);
      const rules = parseTieBreakers(cfg);
      setTieBreakers(rules);
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
        if (!partidoCuentaEnClasificacion(p)) continue;
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
          (Number(p.faltas_local ?? 0) * fairF) +
          (Number(p.amarillas_local ?? 0) * fairA) +
          (Number(p.rojas_local ?? 0) * fairR) +
          (Number(p.rojas_agresion_local ?? 0) * fairRA);
        v.fairplay +=
          (Number(p.faltas_visitante ?? 0) * fairF) +
          (Number(p.amarillas_visitante ?? 0) * fairA) +
          (Number(p.rojas_visitante ?? 0) * fairR) +
          (Number(p.rojas_agresion_visitante ?? 0) * fairRA);

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
          if (!partidoCuentaEnClasificacion(p)) continue;
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

      function sortRows(rowsToSort: (typeof allRows)[number][]) {
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

      const byGroup: Record<string, (typeof allRows)[number][]> = {};
      for (const row of allRows) {
        byGroup[row.grupo] = byGroup[row.grupo] ?? [];
        byGroup[row.grupo].push(row);
      }
      for (const g of Object.keys(byGroup)) sortRows(byGroup[g]);

      const championsDirect = parsePositions(cfg?.champions_direct_positions);
      const europaDirect = parsePositions(cfg?.europa_direct_positions);
      const conferenceDirect = parsePositions(cfg?.conference_direct_positions);
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
          if (!partidoCuentaEnClasificacion(p)) continue;
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
        for (let i = 0; i < arr.length; i++) {
          const pos = i + 1;
          arr[i].posGrupo = pos;
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

      // Cascada real: Champions -> Europa -> Conference
      for (const g of Object.keys(byGroup)) {
        for (const row of byGroup[g]) {
          if (championsDirect.includes(row.posGrupo)) row.qualification = "champions";
        }
      }

      function assignBest(pool: StandingsRow[], limit: number, label: "champions" | "europa" | "conference") {
        let taken = 0;
        for (let i = 0; i < pool.length; i++) {
          if (taken >= limit) break;
          const target = table[pool[i].id];
          if (!target || target.qualification) continue;
          target.qualification = label;
          taken += 1;
        }
      }

      if (qualificationMode !== "simple") {
        assignBest(bestPools.s2, cBest2, "champions");
        assignBest(bestPools.s3, cBest3, "champions");
      }

      for (const g of Object.keys(byGroup)) {
        for (const row of byGroup[g]) {
          if (!row.qualification && europaDirect.includes(row.posGrupo)) row.qualification = "europa";
        }
      }

      if (qualificationMode !== "simple") {
        assignBest(bestPools.s2, eBest2, "europa");
        assignBest(bestPools.s3, eBest3, "europa");
      }

      for (const g of Object.keys(byGroup)) {
        for (const row of byGroup[g]) {
          if (!row.qualification && conferenceDirect.includes(row.posGrupo)) row.qualification = "conference";
        }
      }

      if (qualificationMode !== "simple") {
        assignBest(bestPools.s2, fBest2, "conference");
        assignBest(bestPools.s3, fBest3, "conference");
        assignBest(bestPools.s4, fBest4, "conference");
        assignBest(bestPools.s5, fBest5, "conference");
      }

      const list = Object.keys(byGroup)
        .sort((a, b) => a.localeCompare(b, "es"))
        .flatMap((g) => byGroup[g]);
      setRows(list);
      setLoading(false);
    }

    void load();
  }, [supabase, poll]);

  const gruposLista = useMemo(() => {
    const m = new Map<string, StandingsRow[]>();
    for (const r of rows) {
      const g = r.grupo?.trim() || "Sin grupo";
      m.set(g, [...(m.get(g) ?? []), r]);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [rows]);

  const standingSlotHints = useMemo(() => buildStandingPlaceholderHints(rows), [rows]);

  const slotLockCtx = useMemo((): KnockoutSlotLockContext => {
    const groupNames = [...new Set(rows.map((r) => (r.grupo ?? "").trim()).filter(Boolean))];
    return {
      finalizedGroups: finalizedGroupNames(groupPartidos),
      groupsComplete: allGroupMatchesFinalized(groupPartidos),
      groupNames,
    };
  }, [groupPartidos, rows]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-14 sm:p-8">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-violet-900 sm:text-3xl">Clasificaciones</h1>
          <p className="mt-1 text-sm text-slate-500">
            Actualización cada pocos segundos en esta página mientras tienes abierto el navegador.
          </p>
        </div>

        <p className="mb-3 text-sm text-slate-600">
          Desempate activo tras puntos: {tieBreakers.map(ruleLabel).join(" -> ")}.
        </p>
        <div className="mb-3 flex gap-2">
          <button
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${viewMode === "grupos" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`}
            onClick={() => setViewMode("grupos")}
          >
            Clasificación grupos
          </button>
          <button
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${viewMode === "cuadro" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`}
            onClick={() => setViewMode("cuadro")}
          >
            Cuadro en directo
          </button>
        </div>
        {loading ? <p>Cargando...</p> : null}
        {message ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p> : null}

        {!loading && rows.length === 0 ? <p className="text-slate-600">No hay equipos para clasificar.</p> : null}

        {viewMode === "grupos" && rows.length > 0 ? (
          <div className="grid gap-8">
            {gruposLista.map(([grupo, list], idx) => {
              const palette = [
                "from-violet-600 to-indigo-800",
                "from-fuchsia-600 to-purple-900",
                "from-sky-600 to-blue-900",
                "from-rose-600 to-red-900",
                "from-teal-600 to-cyan-900",
              ];
              const bar = palette[idx % palette.length];
              return (
                <div
                  key={grupo}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50"
                >
                  <div className={`flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r px-4 py-3.5 ${bar} text-white`}>
                    <h3 className="text-lg font-bold tracking-tight">{grupo}</h3>
                    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{list.length} equipos</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Equipo</th>
                          <th className="px-3 py-2">PJ</th>
                          <th className="px-3 py-2">PG</th>
                          <th className="px-3 py-2">PE</th>
                          <th className="px-3 py-2">PP</th>
                          <th className="px-3 py-2">GF</th>
                          <th className="px-3 py-2">GC</th>
                          <th className="px-3 py-2">DG</th>
                          <th className="px-3 py-2">FairPlay</th>
                          <th className="px-3 py-2 font-bold">PTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.id} className={`border-t border-slate-100 ${qualificationColor(r.qualification)}`}>
                            <td className="px-3 py-2 font-medium text-slate-600">{r.posGrupo}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{r.nombre}</td>
                            <td className="px-3 py-2 text-center">{r.pj}</td>
                            <td className="px-3 py-2 text-center">{r.pg}</td>
                            <td className="px-3 py-2 text-center">{r.pe}</td>
                            <td className="px-3 py-2 text-center">{r.pp}</td>
                            <td className="px-3 py-2 text-center">{r.gf}</td>
                            <td className="px-3 py-2 text-center">{r.gc}</td>
                            <td className="px-3 py-2 text-center">{r.dg}</td>
                            <td className="px-3 py-2 text-center">{r.fairplay}</td>
                            <td className="px-3 py-2 text-center font-bold">{r.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {viewMode === "cuadro" ? (
          <div className="grid gap-10">
            {knockout.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
                No hay cruces generados todavía.
              </p>
            ) : null}
            {Array.from(
              knockout.reduce((acc, m) => {
                const comp = (m.competicion ?? "General").toUpperCase();
                if (!acc.has(comp)) acc.set(comp, []);
                acc.get(comp)?.push(m);
                return acc;
              }, new Map<string, KnockoutMatch[]>()),
            )
              .sort(([a], [b]) => compOrderKey(a) - compOrderKey(b))
              .map(([comp, matches]) => {
                const theme = knockoutCompTheme(comp);
                const bucket = comp;
                const finalM = pickFinalMatch(matches);
                const tree = finalM ? buildBracketTree(finalM, matches, bucket) : null;

                const byRound = matches.reduce((acc, m) => {
                  const r = m.ronda ?? "Ronda";
                  if (!acc.has(r)) acc.set(r, []);
                  acc.get(r)?.push(m);
                  return acc;
                }, new Map<string, KnockoutMatch[]>());

                const roundsSorted = Array.from(byRound.entries()).sort(
                  ([r1], [r2]) => roundOrderKey(r1) - roundOrderKey(r2) || r1.localeCompare(r2, "es"),
                );

                return (
                  <div key={comp} className={`overflow-hidden rounded-2xl ${theme.ring}`}>
                    <div className={`px-5 py-4 ${theme.head}`}>
                      <p className="text-xl font-bold text-white">{tituloCompeticionMostrar(comp)}</p>
                    </div>
                    <div className={`border-t p-4 ${theme.roundCol}`}>
                      {tree ? (
                        <div className="overflow-x-auto pb-2">
                          <div className="inline-block min-w-max rounded-2xl border border-black/10 bg-white/80 p-4 shadow-inner backdrop-blur-sm">
                            <BracketSubtree
                              node={tree}
                              theme={theme}
                              teamNames={teamNames}
                              hints={standingSlotHints}
                              slotLockCtx={slotLockCtx}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-center text-sm text-amber-900">
                          Cuadro con formato no estándar. Mostrando columnas por ronda.
                          <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
                            {roundsSorted.map(([r, items]) => (
                              <div key={`${comp}-${r}-fb`} className="flex min-w-[220px] flex-shrink-0 flex-col gap-3">
                                <div className="rounded-lg bg-white/90 px-3 py-2 text-center shadow-sm ring-1 ring-black/5">
                                  <p className={`text-sm font-bold ${theme.accentText}`}>{r}</p>
                                </div>
                                <div className="flex flex-col gap-3">
                                  {items
                                    .slice()
                                    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                                    .map((m) => (
                                      <KnockoutMatchCard
                                        key={`${m.id}-fb`}
                                        m={m}
                                        theme={theme}
                                        teamNames={teamNames}
                                        hints={standingSlotHints}
                                        slotLockCtx={slotLockCtx}
                                      />
                                    ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}
      </div>
    </main>
  );
}
