/** Estado de grupos y bloqueo de slots del cuadro (compartido cliente/servidor). */

export function groupNameFromFase(fase: string | null | undefined): string | null {
  const m = (fase ?? "").trim().match(/^Grupo\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

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

export function allGroupMatchesFinalized(
  partidos: Array<{ fase?: string | null; estado?: string | null }>,
): boolean {
  const groupMatches = partidos.filter((p) => (p.fase ?? "").startsWith("Grupo "));
  if (!groupMatches.length) return false;
  return groupMatches.every((p) => (p.estado ?? "").toLowerCase() === "finalizado");
}

export function normalizeKoSlotKey(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/** Resuelve el nombre de grupo (equipos.grupo) asociado a un slot tipo 1A, 2GRUPOB… */
export function resolveGroupForPositionSlot(slot: string, groupNames: string[]): string | null {
  const compact = normalizeKoSlotKey(slot);
  if (!compact || compact === "BYE" || compact.startsWith("G") || /^M\d/.test(compact)) return null;

  const posLetter = compact.match(/^(\d+)([A-Z])$/);
  if (posLetter) {
    const letter = posLetter[2];
    for (const g of groupNames) {
      const gf = g.toUpperCase().replace(/\s+/g, "").replace(/^GRUPO/, "");
      if (gf === letter || gf.endsWith(letter)) return g;
    }
  }

  for (const g of groupNames) {
    const compactFull = g.toUpperCase().replace(/\s+/g, "");
    const stripped = compactFull.replace(/^GRUPO/, "");
    for (const suffix of [compactFull, stripped, stripped ? stripped.slice(-1) : ""]) {
      if (!suffix) continue;
      if (compact.endsWith(suffix) && compact.length > suffix.length) {
        const posPart = compact.slice(0, compact.length - suffix.length);
        if (/^\d+$/.test(posPart)) return g;
      }
    }
  }

  return null;
}

export function isBestClassifiedSlot(slot: string | null | undefined) {
  return /^M\d/i.test((slot ?? "").trim());
}

export function isKnockoutWinnerSlot(slot: string | null | undefined) {
  return (slot ?? "").trim().toUpperCase().startsWith("G");
}

export type KnockoutSlotLockContext = {
  finalizedGroups: Set<string>;
  groupsComplete: boolean;
  groupNames: string[];
};

export function isKnockoutSlotLocked(slot: string | null | undefined, ctx: KnockoutSlotLockContext): boolean {
  const s = (slot ?? "").trim();
  if (!s || s.toUpperCase() === "BYE") return true;
  if (isKnockoutWinnerSlot(s)) return true;
  if (isBestClassifiedSlot(s)) return ctx.groupsComplete;
  const g = resolveGroupForPositionSlot(s, ctx.groupNames);
  if (!g) return false;
  return ctx.finalizedGroups.has(g);
}

export function knockoutSlotPrimaryLabel(
  slot: string | null | undefined,
  equipoId: string | null | undefined,
  teamNames: Record<string, string>,
  formatPlaceholder: (s: string) => string,
  ctx: KnockoutSlotLockContext,
): string {
  const s = (slot ?? "").trim();
  if (!s) return "—";
  if (s.toUpperCase() === "BYE") return "Pase directo";
  if (isKnockoutSlotLocked(s, ctx) && equipoId) return teamNames[equipoId] ?? "—";
  return formatPlaceholder(s);
}

export function knockoutSlotHintLabel(
  slot: string | null | undefined,
  hint: string | null | undefined,
  ctx: KnockoutSlotLockContext,
): string | null {
  const s = (slot ?? "").trim();
  if (!s || s.toUpperCase() === "BYE" || isKnockoutWinnerSlot(s)) return null;
  if (isKnockoutSlotLocked(s, ctx)) return null;
  return hint ?? null;
}
