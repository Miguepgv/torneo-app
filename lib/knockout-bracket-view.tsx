"use client";

import { tituloCompeticionMostrar } from "@/lib/torneo-constants";

export type KnockoutBracketMatch = {
  id: string;
  competicion?: string | null;
  ronda?: string | null;
  orden?: number | null;
  slot_local?: string | null;
  slot_visitante?: string | null;
  equipo_local_id?: string | null;
  equipo_visitante_id?: string | null;
  fecha_hora?: string | null;
  pista?: string | null;
  estado?: string | null;
  goles_local?: number | null;
  goles_visitante?: number | null;
};

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

function knockoutRoundLetter(roundName: string): string {
  const s = roundName.trim().toLowerCase();
  if (s.includes("octav")) return "O";
  if (s.includes("cuart")) return "C";
  if (s.includes("semi")) return "S";
  if (s.includes("final") && !s.includes("semi")) return "F";
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
  m: KnockoutBracketMatch,
  side: "local" | "visitante",
  teamNames: Record<string, string>,
): string {
  const id = side === "local" ? m.equipo_local_id : m.equipo_visitante_id;
  const slot = side === "local" ? m.slot_local : m.slot_visitante;
  if (id) return teamNames[id] ?? "—";
  const s = (slot ?? "").trim();
  if (!s) return "—";
  if (s.toUpperCase() === "BYE") return "Pase directo";
  return formatPlaceholderSlot(s);
}

function knockoutCompTheme(comp: string) {
  const n = comp.toLowerCase();
  if (n.includes("champion")) {
    return {
      ring: "ring-2 ring-blue-500/50 shadow-lg shadow-blue-900/10",
      head: "bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900",
      subtitle: "text-blue-100",
      matchCard: "border-blue-200/80 bg-white shadow-sm",
      accentText: "text-blue-900",
    };
  }
  if (n.includes("europa")) {
    return {
      ring: "ring-2 ring-orange-400/55 shadow-lg shadow-orange-900/15",
      head: "bg-gradient-to-r from-orange-500 via-orange-600 to-amber-800",
      subtitle: "text-orange-50",
      matchCard: "border-orange-200/90 bg-white shadow-sm",
      accentText: "text-orange-950",
    };
  }
  if (n.includes("conference")) {
    return {
      ring: "ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-900/10",
      head: "bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-900",
      subtitle: "text-emerald-50",
      matchCard: "border-emerald-200/80 bg-white shadow-sm",
      accentText: "text-emerald-950",
    };
  }
  return {
    ring: "ring-1 ring-slate-200 shadow-md",
    head: "bg-gradient-to-r from-slate-700 to-slate-900",
    subtitle: "text-slate-200",
    matchCard: "border-slate-200 bg-white",
    accentText: "text-slate-900",
  };
}

function sameKnockRound(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function findFeederMatch(
  matches: KnockoutBracketMatch[],
  bucket: string,
  slot: string | null | undefined,
): KnockoutBracketMatch | undefined {
  const p = parseWinnerFeedSlot(slot);
  if (!p) return undefined;
  return matches.find(
    (m) =>
      (m.competicion ?? "").toUpperCase() === bucket &&
      sameKnockRound(m.ronda, p.prevRound) &&
      Number(m.orden) === Number(p.orden),
  );
}

function pickFinalMatch(compMatches: KnockoutBracketMatch[]): KnockoutBracketMatch | null {
  const finals = compMatches.filter((m) => {
    const rl = (m.ronda ?? "").toLowerCase();
    return rl.includes("final") && !rl.includes("semi");
  });
  if (!finals.length) return null;
  finals.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return finals[0] ?? null;
}

type BracketNode =
  | { kind: "leaf"; match: KnockoutBracketMatch }
  | { kind: "pair"; match: KnockoutBracketMatch; up: BracketNode; down: BracketNode }
  | { kind: "single"; match: KnockoutBracketMatch; child: BracketNode };

function buildBracketTree(
  root: KnockoutBracketMatch,
  compMatches: KnockoutBracketMatch[],
  bucket: string,
): BracketNode {
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

function formatMatchWhen(iso: string | null | undefined): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  });
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

type Theme = ReturnType<typeof knockoutCompTheme>;

function KnockoutMatchCard({
  m,
  theme,
  teamNames,
}: {
  m: KnockoutBracketMatch;
  theme: Theme;
  teamNames: Record<string, string>;
}) {
  const code = knockoutMatchSlotCode(m.ronda ?? null, m.orden ?? null);
  return (
    <div className={`w-[min(100%,236px)] rounded-xl border-2 p-3 ${theme.matchCard}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2">
        <p className="min-w-0 truncate text-right text-sm font-bold text-slate-900">
          {knockoutSidePrimary(m, "local", teamNames)}
        </p>
        <div className="flex shrink-0 flex-col items-center px-1">
          {code ? (
            <span
              className={`mb-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold ${theme.accentText} border-black/10 bg-white/95`}
            >
              {code}
            </span>
          ) : null}
          <span className="whitespace-nowrap text-base font-bold text-violet-700">
            {m.goles_local ?? 0} — {m.goles_visitante ?? 0}
          </span>
        </div>
        <p className="min-w-0 truncate text-left text-sm font-bold text-slate-900">
          {knockoutSidePrimary(m, "visitante", teamNames)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-1 text-[10px] text-slate-600">
        <span>{formatMatchWhen(m.fecha_hora ?? null)}</span>
        {m.pista ? <span>· {m.pista}</span> : null}
      </div>
    </div>
  );
}

function BracketSubtree({
  node,
  theme,
  teamNames,
}: {
  node: BracketNode;
  theme: Theme;
  teamNames: Record<string, string>;
}) {
  if (node.kind === "leaf") {
    return <KnockoutMatchCard m={node.match} theme={theme} teamNames={teamNames} />;
  }
  if (node.kind === "single") {
    return (
      <div className="flex flex-row flex-nowrap items-center gap-2">
        <BracketSubtree node={node.child} theme={theme} teamNames={teamNames} />
        <div className="flex min-h-[3.75rem] w-10 shrink-0 self-stretch sm:w-14">
          <BracketForkSvg variant="single" />
        </div>
        <KnockoutMatchCard m={node.match} theme={theme} teamNames={teamNames} />
      </div>
    );
  }
  return (
    <div className="flex flex-row flex-nowrap items-center gap-2">
      <div className="flex shrink-0 flex-col justify-evenly gap-14 py-12 sm:gap-24 sm:py-16">
        <BracketSubtree node={node.up} theme={theme} teamNames={teamNames} />
        <BracketSubtree node={node.down} theme={theme} teamNames={teamNames} />
      </div>
      <div className="flex min-h-[10rem] w-10 shrink-0 self-stretch sm:min-h-[13rem] sm:w-14">
        <BracketForkSvg variant="dual" />
      </div>
      <KnockoutMatchCard m={node.match} theme={theme} teamNames={teamNames} />
    </div>
  );
}

function competicionRank(stored: string | null | undefined): number {
  const t = tituloCompeticionMostrar(stored).toLowerCase();
  if (t.includes("champion")) return 1;
  if (t.includes("europa")) return 2;
  if (t.includes("conference")) return 3;
  return 9;
}

export function KnockoutBracketView({
  matches,
  teamNames,
}: {
  matches: KnockoutBracketMatch[];
  teamNames: Record<string, string>;
}) {
  if (!matches.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
        Genera los cruces para ver el cuadro.
      </p>
    );
  }

  const byComp = matches.reduce((acc, m) => {
    const c = tituloCompeticionMostrar(m.competicion);
    if (!acc.has(c)) acc.set(c, []);
    acc.get(c)?.push(m);
    return acc;
  }, new Map<string, KnockoutBracketMatch[]>());

  return (
    <div className="grid gap-6">
      {Array.from(byComp.entries())
        .sort(([a], [b]) => competicionRank(a) - competicionRank(b))
        .map(([comp, compMatches]) => {
          const theme = knockoutCompTheme(comp);
          const bucket = (compMatches[0]?.competicion ?? comp).toUpperCase();
          const finalMatch = pickFinalMatch(compMatches);
          if (!finalMatch) {
            return (
              <div key={comp} className={`rounded-2xl p-4 ${theme.ring}`}>
                <p className={`mb-3 rounded-lg px-3 py-2 text-sm font-bold text-white ${theme.head}`}>
                  {comp}
                </p>
                <p className="text-sm text-slate-600">Sin final definida en este cuadro.</p>
              </div>
            );
          }
          const tree = buildBracketTree(finalMatch, compMatches, bucket);
          return (
            <div key={comp} className={`rounded-2xl p-4 ${theme.ring}`}>
              <p className={`mb-4 rounded-lg px-3 py-2 text-sm font-bold text-white ${theme.head}`}>
                {comp}
              </p>
              <div className="overflow-x-auto pb-2">
                <BracketSubtree node={tree} theme={theme} teamNames={teamNames} />
              </div>
            </div>
          );
        })}
    </div>
  );
}
