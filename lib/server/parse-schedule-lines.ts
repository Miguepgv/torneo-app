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

function normalizeTeamName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** dd/mm/yyyy HH:mm o dd/mm HH:mm */
function parseDateTime(raw: string, year: number): { day: number; month: number; hour: number; minute: number } | null {
  const m = raw.trim().match(
    /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(\d{1,2}):(\d{2})$/,
  );
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : year;
  const d = new Date(y, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return { day, month, hour, minute };
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

/** Una linea: "Equipo A vs Equipo B | 27/05 18:00 | Pista 1" */
export function parseScheduleLine(raw: string, year: number): ParsedScheduleLine {
  const line = raw.trim();
  if (!line || line.startsWith("#")) {
    return { ok: false, raw: line, reason: "Linea vacia" };
  }

  const pipeParts = line.split("|").map((p) => p.trim());
  if (pipeParts.length >= 2) {
    const teams = splitTeams(pipeParts[0]);
    const dt = parseDateTime(pipeParts[1], year);
    const pista = pipeParts[2]?.trim() || null;
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
    const dt = parseDateTime(`${tabParts[1]} ${tabParts[2]}`, year);
    const pista = tabParts[3]?.trim() || null;
    if (teams && dt) {
      return {
        ok: true,
        raw: line,
        line: { localName: teams.local, visitName: teams.visit, ...dt, pista },
      };
    }
  }

  const loose = line.match(
    /^(.+?)\s+vs\.?\s+(.+?)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(\d{1,2}:\d{2})(?:\s+(.+))?$/i,
  );
  if (loose) {
    const dt = parseDateTime(`${loose[3]} ${loose[4]}`, year);
    if (dt) {
      return {
        ok: true,
        raw: line,
        line: {
          localName: loose[1].trim(),
          visitName: loose[2].trim(),
          ...dt,
          pista: loose[5]?.trim() || null,
        },
      };
    }
  }

  return {
    ok: false,
    raw: line,
    reason: "Formato no reconocido (usa: Local vs Visitante | dd/mm HH:mm | Pista)",
  };
}

export function parseScheduleText(text: string, year: number): ParsedScheduleLine[] {
  return text
    .split(/\r?\n/)
    .map((raw) => parseScheduleLine(raw, year))
    .filter((r) => r.raw.length > 0);
}

export function findTeamIdByName(
  equipos: { id: string; nombre: string }[],
  name: string,
): string | null {
  const target = normalizeTeamName(name);
  if (!target) return null;

  const exact = equipos.find((e) => normalizeTeamName(e.nombre) === target);
  if (exact) return exact.id;

  const contains = equipos.filter(
    (e) => normalizeTeamName(e.nombre).includes(target) || target.includes(normalizeTeamName(e.nombre)),
  );
  if (contains.length === 1) return contains[0].id;
  return null;
}

export function toIsoFromParts(day: number, month: number, hour: number, minute: number, year: number): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

export { normalizeTeamName };
