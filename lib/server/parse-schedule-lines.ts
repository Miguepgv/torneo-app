export type ScheduleLineInput = {
  localName: string;
  visitName: string;
  day: number;
  month: number;
  hour: number;
  minute: number;
  pista?: string | null;
};

export type ParsedScheduleLine =
  | { ok: true; line: ScheduleLineInput; raw: string }
  | { ok: false; raw: string; reason: string };

export type WeekendDates = {
  viernes: { day: number; month: number };
  sabado: { day: number; month: number };
  domingo: { day: number; month: number };
};

function normalizeTeamName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(s: string): string[] {
  return normalizeTeamName(s)
    .split(" ")
    .filter((t) => t.length > 1);
}

/** Nombres del PDF/horario → como suelen estar en la app (torneo 2026). */
const IMPORT_TEAM_ALIASES: Record<string, string[]> = {
  "a jerusalem contigo": ["a jerusalem contigo"],
  "vera cruz f s": ["vera cruz fs", "vera cruz"],
  "paz y esperanza": ["paz"],
  "coronacion campillos": ["coronacion campillos"],
  "los moraitos": ["los moraitos"],
  "los quintos": ["los quintos f s", "los quintos"],
  "tres caidas": ["tres caidas"],
  "butaca del furraque": ["la butaca del furrque", "butaca del furrque"],
  "acolitos de paco": ["los acolitos de paco", "acolitos de paco"],
  "la agrupa": ["la agrupa f s", "la agrupa"],
  "los remedios": ["los remedios"],
  "costangeles": ["costangeles"],
  "fernando guerrero": ["fernando guerrero"],
  "los soleanos": ["los soleanos"],
  "nazareno de utrera": ["nazareno de utrera"],
  "boriquita de trajano": ["borriquita de trajano", "boriquita de trajano"],
};

function importNameVariants(name: string): string[] {
  const n = normalizeTeamName(name);
  const out = new Set<string>([n, name.trim()]);
  const aliases = IMPORT_TEAM_ALIASES[n];
  if (aliases) for (const a of aliases) out.add(a);
  return [...out];
}

function nameMatchScore(target: string, candidate: string): number {
  const a = nameTokens(target);
  const b = nameTokens(candidate);
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let common = 0;
  for (const t of a) {
    if (setB.has(t)) common += 1;
  }
  return common / Math.max(a.length, b.length);
}

/** Torneo nocturno: 1:00 = 01:00 de la madrugada, nunca 13:00. */
function parseHourMinute(hm: string): { hour: number; minute: number } | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function parseDayMonth(dm: string): { day: number; month: number } | null {
  const m = dm.trim().match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month };
}

export function defaultWeekend2026(): WeekendDates {
  return {
    viernes: { day: 12, month: 6 },
    sabado: { day: 13, month: 6 },
    domingo: { day: 14, month: 6 },
  };
}

export function weekendFromStrings(args: {
  viernes?: string;
  sabado?: string;
  domingo?: string;
  fallback?: WeekendDates;
}): WeekendDates {
  const fb = args.fallback ?? defaultWeekend2026();
  const viernes = parseDayMonth(args.viernes ?? "") ?? fb.viernes;
  const sabado = parseDayMonth(args.sabado ?? "") ?? fb.sabado;
  const domingo = parseDayMonth(args.domingo ?? "") ?? fb.domingo;
  return { viernes, sabado, domingo };
}

/** PDF: VIERNES 21:00 / SABADO 1:00 (madrugada tras el viernes). */
function parsePdfDayTime(
  raw: string,
  weekend: WeekendDates,
): { day: number; month: number; hour: number; minute: number } | null {
  const m = raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/^(VIERNES|SABADO|DOMINGO)\s+(\d{1,2}:\d{2})$/i);
  if (!m) return null;

  const hm = parseHourMinute(m[2]);
  if (!hm) return null;

  const dia = m[1].toUpperCase();
  if (dia === "VIERNES") return { ...weekend.viernes, ...hm };
  if (dia === "SABADO") return { ...weekend.sabado, ...hm };
  if (dia === "DOMINGO") return { ...weekend.domingo, ...hm };
  return null;
}

/** dd/mm HH:mm — hora en formato 24h peninsular. */
function parseDateTime(
  raw: string,
  year: number,
): { day: number; month: number; hour: number; minute: number } | null {
  const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(\d{1,2}:\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const hm = parseHourMinute(m[4]);
  if (!hm) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month, ...hm };
}

function parseWhen(
  raw: string,
  year: number,
  weekend: WeekendDates,
): { day: number; month: number; hour: number; minute: number } | null {
  return parsePdfDayTime(raw, weekend) ?? parseDateTime(raw, year);
}

function normalizePistaLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** C / B / A del PDF → Pista C */
export function normalizePistaName(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^pista\s+/i.test(t)) return t.replace(/\s+/g, " ");
  if (/^[ABC]$/i.test(t)) return `Pista ${t.toUpperCase()}`;
  return t;
}

function pistaLetter(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const direct = t.match(/^([ABC])$/i)?.[1];
  if (direct) return direct.toUpperCase();
  const normalized = normalizePistaName(t);
  const fromName = normalized?.match(/^pista\s+([ABC])$/i)?.[1];
  return fromName ? fromName.toUpperCase() : null;
}

/** Usa el nombre exacto de una pista creada en admin (selector). */
export function resolvePistaNombre(
  raw: string | null | undefined,
  catalog: { nombre: string }[],
): { nombre: string | null; warning?: string } {
  const t = (raw ?? "").trim();
  if (!t) return { nombre: null };

  const names = catalog.map((c) => c.nombre.trim()).filter(Boolean);
  const fallback = normalizePistaName(t) ?? t;

  if (!names.length) {
    return { nombre: fallback, warning: "Crea las pistas A, B y C en admin antes de importar." };
  }

  const tryMatch = (label: string) =>
    names.find((n) => normalizePistaLabel(n) === normalizePistaLabel(label));

  const exactNormalized = tryMatch(fallback);
  if (exactNormalized) return { nombre: exactNormalized };

  const exactRaw = tryMatch(t);
  if (exactRaw) return { nombre: exactRaw };

  const letter = pistaLetter(t);
  if (letter) {
    const letterMatches = names.filter((n) => {
      const label = normalizePistaLabel(n);
      return (
        label === letter.toLowerCase() ||
        label === `pista ${letter.toLowerCase()}` ||
        label.endsWith(` ${letter.toLowerCase()}`)
      );
    });
    if (letterMatches.length === 1) return { nombre: letterMatches[0] };
    if (letterMatches.length > 1) {
      return { nombre: letterMatches[0], warning: `Varias pistas para la letra ${letter}` };
    }
  }

  return {
    nombre: fallback,
    warning: `Pista "${t}" no coincide con las creadas (${names.join(", ")}). Créala o renómbrala.`,
  };
}

function splitTeams(part: string): { local: string; visit: string } | null {
  const cleaned = part.trim();
  const separators = [" vs ", " VS ", " v ", " - ", " – ", " — "];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const [local, visit] = cleaned.split(sep);
      if (local?.trim() && visit?.trim()) {
        return { local: local.trim(), visit: visit.trim() };
      }
    }
  }
  const vsMatch = cleaned.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vsMatch?.[1] && vsMatch[2]) {
    return { local: vsMatch[1].trim(), visit: vsMatch[2].trim() };
  }
  return null;
}

/**
 * Formatos:
 * - Local vs Visit | VIERNES 21:00 | C
 * - Local vs Visit | SABADO 1:00 | Pista B  (01:00 madrugada, no 13:00)
 * - Local vs Visit | 13/06 01:00 | Pista C
 */
export function parseScheduleLine(
  raw: string,
  year: number,
  weekend: WeekendDates = defaultWeekend2026(),
): ParsedScheduleLine {
  const line = raw.trim();
  if (!line || line.startsWith("#")) {
    return { ok: false, raw: line, reason: "Linea vacia" };
  }

  const pipeParts = line.split("|").map((p) => p.trim());
  if (pipeParts.length >= 2) {
    const teams = splitTeams(pipeParts[0]);
    const dt = parseWhen(pipeParts[1], year, weekend);
    const pista = normalizePistaName(pipeParts[2]);
    if (teams && dt) {
      return {
        ok: true,
        raw: line,
        line: {
          localName: teams.local,
          visitName: teams.visit,
          ...dt,
          pista,
        },
      };
    }
  }

  const tabParts = line.split("\t").map((p) => p.trim()).filter(Boolean);
  if (tabParts.length >= 3) {
    const teams = splitTeams(tabParts[0]);
    const dt = parseWhen(`${tabParts[1]} ${tabParts[2]}`, year, weekend) ?? parseWhen(tabParts[1], year, weekend);
    const pista = normalizePistaName(tabParts[3]);
    if (teams && dt) {
      return {
        ok: true,
        raw: line,
        line: { localName: teams.local, visitName: teams.visit, ...dt, pista },
      };
    }
  }

  return {
    ok: false,
    raw: line,
    reason:
      "Formato no reconocido (usa: Local vs Visit | VIERNES 21:00 | C o | 13/06 01:00 | Pista B)",
  };
}

export function parseScheduleText(
  text: string,
  year: number,
  weekend: WeekendDates = defaultWeekend2026(),
): ParsedScheduleLine[] {
  return text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0 && !raw.startsWith("#"))
    .map((raw) => parseScheduleLine(raw, year, weekend));
}

function findTeamIdByNormalized(
  equipos: { id: string; nombre: string }[],
  target: string,
): string | null {
  if (!target) return null;

  const exact = equipos.find((e) => normalizeTeamName(e.nombre) === target);
  if (exact) return exact.id;

  const contains = equipos.filter((e) => {
    const n = normalizeTeamName(e.nombre);
    return n.includes(target) || target.includes(n);
  });
  if (contains.length === 1) return contains[0].id;

  return null;
}

export function findTeamIdByName(
  equipos: { id: string; nombre: string }[],
  name: string,
): string | null {
  for (const variant of importNameVariants(name)) {
    const id = findTeamIdByNormalized(equipos, normalizeTeamName(variant));
    if (id) return id;
  }

  let bestId: string | null = null;
  let bestScore = 0;
  for (const e of equipos) {
    const score = nameMatchScore(name, e.nombre);
    if (score > bestScore) {
      bestScore = score;
      bestId = e.id;
    } else if (score === bestScore && score >= 0.5) {
      bestId = null;
    }
  }
  if (bestId && bestScore >= 0.5) return bestId;
  return null;
}

/** Hora del torneo en Espana (junio = CEST +02:00). Evita desfases en Vercel (UTC). */
export function toIsoFromParts(
  day: number,
  month: number,
  hour: number,
  minute: number,
  year: number,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = month >= 4 && month <= 10 ? "+02:00" : "+01:00";
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`;
}

export { normalizeTeamName };
