"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { KnockoutBracketView } from "@/lib/knockout-bracket-view";
import { toIsoFromParts } from "@/lib/server/parse-schedule-lines";
import { TORNEO_COMPETICIONES, tituloCompeticionMostrar } from "@/lib/torneo-constants";

type Equipo = { id: string; nombre: string; grupo?: string | null };
type Pista = { id: string; nombre: string };
type Config = {
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
  knockout_manual_config?: {
    mode?: "auto" | "manual";
    pairs?: {
      champions?: { local: string; visit: string }[];
      europa?: { local: string; visit: string }[];
      conference?: { local: string; visit: string }[];
    };
  } | null;
};
type Partido = {
  id: string;
  equipo_local_id: string | null;
  equipo_visitante_id: string | null;
  slot_local?: string | null;
  slot_visitante?: string | null;
  fecha_hora: string | null;
  pista: string | null;
  estado: string | null;
  fase: string | null;
  competicion?: string | null;
  ronda?: string | null;
  orden?: number | null;
  goles_local: number | null;
  goles_visitante: number | null;
};

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

function formatDayMonthInput(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function grupoFromFase(fase: string | null | undefined): string {
  const m = (fase ?? "").match(/^Grupo\s+([A-Za-z0-9]+)/i);
  return m?.[1]?.toUpperCase() ?? "";
}

const MADRID_TZ = "Europe/Madrid";

function faseCorta(fase: string | null | undefined): string {
  const g = grupoFromFase(fase);
  if (g) return `Grupo ${g}`;
  return (fase ?? "").trim() || "—";
}

function datePartsMadrid(iso: string) {
  const d = new Date(iso);
  return {
    dm: d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: MADRID_TZ }),
    hm: d.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: MADRID_TZ,
    }),
    year:
      Number(d.toLocaleDateString("en-CA", { year: "numeric", timeZone: MADRID_TZ })) || 2026,
  };
}

function tournamentYearFromIso(iso: string | null, fallback = 2026): number {
  if (!iso) return fallback;
  return datePartsMadrid(iso).year || fallback;
}

function defaultManualPairs() {
  return {
    champions: [
      { local: "1A", visit: "2D" },
      { local: "1B", visit: "2C" },
      { local: "1C", visit: "2B" },
      { local: "1D", visit: "2A" },
    ],
    europa: [
      { local: "2A", visit: "3D" },
      { local: "2B", visit: "3C" },
      { local: "2C", visit: "3B" },
      { local: "2D", visit: "3A" },
    ],
    conference: [
      { local: "3A", visit: "4D" },
      { local: "3B", visit: "4C" },
      { local: "3C", visit: "4B" },
      { local: "3D", visit: "4A" },
    ],
  };
}

function applyKnockoutConfigToState(
  raw: Config["knockout_manual_config"],
  setMode: (m: "auto" | "manual") => void,
  setPairs: (p: ReturnType<typeof defaultManualPairs>) => void,
) {
  if (!raw || typeof raw !== "object") return;
  if (raw.mode === "auto" || raw.mode === "manual") setMode(raw.mode);
  const pairs = raw.pairs;
  if (!pairs || typeof pairs !== "object") return;
  const fb = defaultManualPairs();
  setPairs({
    champions: pairs.champions?.length ? pairs.champions : fb.champions,
    europa: pairs.europa?.length ? pairs.europa : fb.europa,
    conference: pairs.conference?.length ? pairs.conference : fb.conference,
  });
}

type MatchSortMode = "hora-asc" | "hora-desc" | "grupo";
type KnockoutSortMode = MatchSortMode | "cuadro" | "competicion";

function competicionRank(stored: string | null | undefined): number {
  const t = tituloCompeticionMostrar(stored).toLowerCase();
  if (t.includes("champion")) return 1;
  if (t.includes("europa")) return 2;
  if (t.includes("conference")) return 3;
  return 9;
}

function roundRank(name: string) {
  const k = name.toLowerCase();
  if (k.includes("ronda 1")) return 1;
  if (k.includes("dieciseis")) return 2;
  if (k.includes("octavos")) return 3;
  if (k.includes("cuartos")) return 4;
  if (k.includes("semifinal")) return 5;
  if (k.includes("final")) return 6;
  return 99;
}

function knockoutCuadroSortKey(m: Partido): [number, number, number] {
  return [competicionRank(m.competicion), roundRank(m.ronda ?? ""), Number(m.orden ?? 0)];
}

function slotGrupoLetter(slot: string | null | undefined): string {
  const m = (slot ?? "").trim().match(/([A-Za-z])$/);
  return m?.[1]?.toUpperCase() ?? "";
}

function partidoGruposTouch(
  match: Partido,
  equipos: Equipo[],
): string[] {
  const set = new Set<string>();
  const sl = slotGrupoLetter(match.slot_local);
  const sv = slotGrupoLetter(match.slot_visitante);
  if (sl) set.add(sl);
  if (sv) set.add(sv);
  for (const id of [match.equipo_local_id, match.equipo_visitante_id]) {
    if (!id) continue;
    const g = (equipos.find((e) => e.id === id)?.grupo ?? "").trim().toUpperCase();
    if (g) set.add(g);
  }
  return [...set];
}

function partidoGrupoSortKey(match: Partido, equipos: Equipo[]): string {
  const gs = partidoGruposTouch(match, equipos).sort((a, b) => a.localeCompare(b, "es"));
  return gs[0] ?? "Z";
}

function sortPartidos(list: Partido[], mode: MatchSortMode): Partido[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    if (mode === "grupo") {
      const gcmp = grupoFromFase(a.fase).localeCompare(grupoFromFase(b.fase), "es");
      if (gcmp !== 0) return gcmp;
    }
    const ta = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
    if (mode === "hora-desc") return tb - ta;
    return ta - tb;
  });
  return sorted;
}

function sortKnockoutPartidos(
  list: Partido[],
  mode: KnockoutSortMode,
  equipos: Equipo[],
): Partido[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    if (mode === "cuadro" || mode === "competicion") {
      const [ca, ra, oa] = knockoutCuadroSortKey(a);
      const [cb, rb, ob] = knockoutCuadroSortKey(b);
      if (ca !== cb) return ca - cb;
      if (ra !== rb) return ra - rb;
      if (oa !== ob) return oa - ob;
    }
    if (mode === "grupo") {
      const gcmp = partidoGrupoSortKey(a, equipos).localeCompare(partidoGrupoSortKey(b, equipos), "es");
      if (gcmp !== 0) return gcmp;
    }
    const ta = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
    if (mode === "hora-desc") return tb - ta;
    return ta - tb;
  });
  return sorted;
}

export default function AdminCalendarioPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rol, setRol] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [pistas, setPistas] = useState<Pista[]>([]);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [newPista, setNewPista] = useState("");
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [tab, setTab] = useState<"calendario" | "cruces" | "horarios">("calendario");
  const [msg, setMsg] = useState("");
  const [scheduleText, setScheduleText] = useState("");
  const [knockoutScheduleText, setKnockoutScheduleText] = useState("");
  const [scheduleKind, setScheduleKind] = useState<"groups" | "knockout">("groups");
  const [scheduleYear, setScheduleYear] = useState("2026");
  const [weekendViernes, setWeekendViernes] = useState("12/06");
  const [weekendSabado, setWeekendSabado] = useState("13/06");
  const [weekendDomingo, setWeekendDomingo] = useState("14/06");
  const [applyingSchedule, setApplyingSchedule] = useState(false);
  const [scheduleResult, setScheduleResult] = useState("");
  const [filterGrupo, setFilterGrupo] = useState("");
  const [filterPista, setFilterPista] = useState("");
  const [sortMode, setSortMode] = useState<MatchSortMode>("hora-asc");
  const [filterKnockoutCompeticion, setFilterKnockoutCompeticion] = useState("");
  const [filterKnockoutGrupo, setFilterKnockoutGrupo] = useState("");
  const [filterKnockoutPista, setFilterKnockoutPista] = useState("");
  const [sortKnockoutMode, setSortKnockoutMode] = useState<KnockoutSortMode>("cuadro");
  const [startDm, setStartDm] = useState("");
  const [startHm, setStartHm] = useState("18:00");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [defaultPista, setDefaultPista] = useState("Pista 1");
  const [knockoutMode, setKnockoutMode] = useState<"auto" | "manual">("manual");
  const [crucesViewMode, setCrucesViewMode] = useState<"lista" | "cuadro">("cuadro");
  const [manualPairs, setManualPairs] = useState(defaultManualPairs);
  const [newMatch, setNewMatch] = useState({
    local: "",
    visit: "",
    fase: "Cruce",
    diaMes: "",
    hora: "21:00",
    pista: "Pista 1",
  });

  async function api(body: unknown) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sesion caducada.");
    const res = await fetch("/api/admin/calendario", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    const json = (raw ? JSON.parse(raw) : {}) as { ok?: boolean; error?: string; created?: number };
    if (!res.ok) throw new Error(json.error ?? "Error inesperado");
    return json;
  }

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch("/api/admin/calendario", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = (await res.json()) as { equipos?: Equipo[]; partidos?: Partido[]; pistas?: Pista[]; config?: Config | null; error?: string };
    if (!res.ok) {
      setMsg(json.error ?? "No se pudo cargar calendario.");
      return;
    }
    setEquipos(json.equipos ?? []);
    setPistas(json.pistas ?? []);
    setPartidos(json.partidos ?? []);
    const nextCfg = json.config ?? null;
    setCfg(nextCfg);
    applyKnockoutConfigToState(nextCfg?.knockout_manual_config, setKnockoutMode, setManualPairs);
  }

  async function onSaveKnockoutConfig() {
    try {
      setMsg("Guardando configuracion de cruces...");
      await api({
        action: "save_knockout_config",
        mode: knockoutMode,
        manualPairs: manualPairs,
      });
      setMsg("Configuracion de cruces guardada. Ya no se resetea al editar horarios.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error guardando configuracion.");
    }
  }

  useEffect(() => {
    async function roleGuardAndLoad() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRol(null);
        setCheckingRole(false);
        return;
      }
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      const r = (data?.rol as string | undefined) ?? null;
      setRol(r);
      setCheckingRole(false);
      if (r === "admin") await load();
    }
    void roleGuardAndLoad();
  }, [supabase]);

  async function onGenerate() {
    try {
      setMsg("Generando calendario...");
      const r = await api({
        action: "generate_groups",
        resetExisting: true,
        startAt: toIsoFromDayMonth(startDm, startHm),
        intervalMinutes,
        pista: defaultPista,
      });
      setMsg(`Calendario de grupos generado: ${r.created ?? 0} partidos.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error generando.");
    }
  }

  async function onGenerateKnockout() {
    try {
      setMsg("Generando cruces...");
      await api({
        action: "save_knockout_config",
        mode: knockoutMode,
        manualPairs: manualPairs,
      });
      const r = await api({
        action: "generate_knockout",
        resetExisting: true,
        startAt: null,
        intervalMinutes,
        pista: defaultPista,
        autoAllCompetitions: true,
        mode: knockoutMode,
        manualPairs: {
          champions: manualPairs.champions.map((p) => `${p.local} vs ${p.visit}`),
          europa: manualPairs.europa.map((p) => `${p.local} vs ${p.visit}`),
          conference: manualPairs.conference.map((p) => `${p.local} vs ${p.visit}`),
        },
      });
      const { CHAMPIONS, EUROPA, CONFERENCE } = TORNEO_COMPETICIONES;
      setMsg(`Brackets generados (${CHAMPIONS} / ${EUROPA} / ${CONFERENCE}): ${r.created ?? 0} partidos.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error generando cruces.");
    }
  }

  async function onLoadScheduleTemplate() {
    try {
      const res = await fetch("/horarios-2026-import.txt");
      if (!res.ok) throw new Error("No se encontro la plantilla.");
      const text = await res.text();
      setScheduleText(text.trim());
      setScheduleKind("groups");
      setScheduleResult("Plantilla grupos 12-14 junio cargada. Pulsa Aplicar horarios.");
    } catch (e) {
      setScheduleResult(e instanceof Error ? e.message : "Error cargando plantilla.");
    }
  }

  async function onLoadKnockoutTemplate() {
    try {
      const res = await fetch("/cruces-2026-import.txt");
      if (!res.ok) throw new Error("No se encontro la plantilla de cruces.");
      const text = await res.text();
      setKnockoutScheduleText(text.trim());
      setScheduleKind("knockout");
      setScheduleResult("Plantilla cruces domingo cargada. Pulsa Aplicar horarios.");
    } catch (e) {
      setScheduleResult(e instanceof Error ? e.message : "Error cargando plantilla de cruces.");
    }
  }

  async function onApplySchedule() {
    const text = scheduleKind === "knockout" ? knockoutScheduleText : scheduleText;
    if (!text.trim()) {
      setScheduleResult(
        scheduleKind === "knockout"
          ? "Pega las lineas de cruces o pulsa Cargar plantilla cruces."
          : "Pega las lineas del horario o pulsa Cargar plantilla grupos.",
      );
      setMsg("Pega las lineas del horario.");
      return;
    }
    if (scheduleKind === "groups") {
      const gruposCount = partidos.filter((p) => (p.fase ?? "").startsWith("Grupo ")).length;
      if (gruposCount === 0) {
        setScheduleResult(
          "No hay partidos de grupos. Primero ve a Generar calendario y crea los partidos.",
        );
        setMsg("Genera antes el calendario de grupos.");
        return;
      }
    } else {
      const crucesCount = partidos.filter((p) => (p.fase ?? "").startsWith("Cuadro -")).length;
      if (crucesCount === 0) {
        setScheduleResult(
          "No hay cruces. Primero ve a Generar cruces y crea los brackets.",
        );
        setMsg("Genera antes los cruces.");
        return;
      }
    }
    setApplyingSchedule(true);
    setScheduleResult("Aplicando horarios...");
    try {
      const r = (await api({
        action: "apply_schedule",
        kind: scheduleKind,
        text,
        year: Number(scheduleYear) || 2026,
        weekendViernes,
        weekendSabado,
        weekendDomingo,
      })) as {
        updated?: number;
        pistasAsignadas?: number;
        pistaWarnings?: string[];
        pistasEnApp?: string[];
        skipped?: string[];
        errors?: string[];
        parsedOk?: number;
        partidosGrupo?: number;
        partidosCruces?: number;
        equiposEnApp?: string[];
      };
      const parts: string[] = [];
      parts.push(`Actualizados: ${r.updated ?? 0} de ${r.parsedOk ?? 0} lineas validas.`);
      if (typeof r.pistasAsignadas === "number") {
        parts.push(`Pistas asignadas: ${r.pistasAsignadas}.`);
      }
      if (r.pistasEnApp?.length) {
        parts.push(`Pistas en admin: ${r.pistasEnApp.join(", ")}.`);
      }
      if ((r.updated ?? 0) === 0) {
        parts.push(
          scheduleKind === "knockout"
            ? "Ningun cruce se actualizo. Revisa slots (1A vs 2D) y competicion (Champions/Europa/Conference)."
            : "Ningun partido se actualizo. Revisa que los nombres coincidan con los equipos en la app.",
        );
        if (r.equiposEnApp?.length && scheduleKind === "groups") {
          parts.push(`Equipos en la app: ${r.equiposEnApp.join(" · ")}`);
        }
      }
      if (r.skipped?.length) {
        parts.push("Omitidos:");
        parts.push(...r.skipped.slice(0, 12));
        if (r.skipped.length > 12) parts.push(`... y ${r.skipped.length - 12} mas`);
      }
      if (r.pistaWarnings?.length) {
        parts.push("Avisos de pista:");
        parts.push(...r.pistaWarnings.slice(0, 8));
        if (r.pistaWarnings.length > 8) parts.push(`... y ${r.pistaWarnings.length - 8} mas`);
      }
      if (r.errors?.length) {
        parts.push("Errores de formato:");
        parts.push(...r.errors.slice(0, 8));
      }
      const text = parts.join("\n");
      setScheduleResult(text);
      setMsg(text);
      await load();
    } catch (e) {
      const err = e instanceof Error ? e.message : "Error aplicando horarios.";
      setScheduleResult(
        err.includes("no soportada") || err.includes("Accion")
          ? `${err}\n\nParece que produccion no tiene la ultima version. Haz git push y espera el deploy en Vercel.`
          : err,
      );
      setMsg(err);
    } finally {
      setApplyingSchedule(false);
    }
  }

  async function onAddPista(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPista.trim()) return;
    try {
      await api({ action: "add_pista", nombre: newPista.trim() });
      setNewPista("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error creando pista.");
    }
  }

  async function onDeletePista(id: string) {
    try {
      await api({ action: "delete_pista", id });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error borrando pista.");
    }
  }

  async function onCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api({
        action: "create_match",
        equipo_local_id: newMatch.local,
        equipo_visitante_id: newMatch.visit,
        fase: newMatch.fase,
        fecha_hora: toIsoFromDayMonth(newMatch.diaMes, newMatch.hora),
        pista: newMatch.pista,
        estado: "pendiente",
      });
      setMsg("Cruce/partido creado.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error creando partido.");
    }
  }

  function teamName(id: string | null) {
    if (!id) return "—";
    return equipos.find((e) => e.id === id)?.nombre ?? "Equipo";
  }

  function sideLabel(match: Partido, side: "local" | "visit") {
    if (side === "local") {
      if (match.equipo_local_id) return teamName(match.equipo_local_id);
      if (match.slot_local) return match.slot_local;
      return "Por definir";
    }
    if (match.equipo_visitante_id) return teamName(match.equipo_visitante_id);
    if (match.slot_visitante) return match.slot_visitante;
    return "Por definir";
  }

  function compactDate(iso: string | null) {
    if (!iso) return "Sin fecha";
    const { dm, hm } = datePartsMadrid(iso);
    return `${dm} ${hm}`;
  }

  function toIsoFromDayMonth(dm: string, hm: string, year = Number(scheduleYear) || 2026) {
    const m = dm.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    const t = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m || !t) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const hour = Number(t[1]);
    const minute = Number(t[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    return toIsoFromParts(day, month, hour, minute, year);
  }

  const groupMatches = partidos.filter((p) => (p.fase ?? "").startsWith("Grupo "));
  const knockoutMatches = partidos.filter((p) => (p.fase ?? "").startsWith("Cuadro -"));
  const groupLetters = Array.from(new Set(equipos.map((e) => (e.grupo ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  const gruposEnPartidos = useMemo(() => {
    const set = new Set<string>();
    for (const p of groupMatches) {
      const g = grupoFromFase(p.fase);
      if (g) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [groupMatches]);

  const pistasEnPartidos = useMemo(() => {
    const set = new Set<string>();
    for (const p of groupMatches) {
      const name = (p.pista ?? "").trim();
      if (name) set.add(name);
    }
    for (const pi of pistas) {
      if (pi.nombre?.trim()) set.add(pi.nombre.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [groupMatches, pistas]);

  const filteredGroupMatches = useMemo(() => {
    let list = groupMatches;
    if (filterGrupo) {
      list = list.filter((p) => grupoFromFase(p.fase) === filterGrupo);
    }
    if (filterPista) {
      list = list.filter((p) => (p.pista ?? "").trim() === filterPista);
    }
    return sortPartidos(list, sortMode);
  }, [groupMatches, filterGrupo, filterPista, sortMode]);

  const competicionesEnCruces = useMemo(() => {
    const set = new Set<string>();
    for (const p of knockoutMatches) {
      set.add(tituloCompeticionMostrar(p.competicion));
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [knockoutMatches]);

  const gruposEnCruces = useMemo(() => {
    const set = new Set<string>();
    for (const p of knockoutMatches) {
      for (const g of partidoGruposTouch(p, equipos)) set.add(g);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [knockoutMatches, equipos]);

  const pistasEnCruces = useMemo(() => {
    const set = new Set<string>();
    for (const p of knockoutMatches) {
      const name = (p.pista ?? "").trim();
      if (name) set.add(name);
    }
    for (const pi of pistas) {
      if (pi.nombre?.trim()) set.add(pi.nombre.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [knockoutMatches, pistas]);

  const filteredKnockoutMatches = useMemo(() => {
    let list = knockoutMatches;
    if (filterKnockoutCompeticion) {
      list = list.filter(
        (p) => tituloCompeticionMostrar(p.competicion) === filterKnockoutCompeticion,
      );
    }
    if (filterKnockoutGrupo) {
      list = list.filter((p) => partidoGruposTouch(p, equipos).includes(filterKnockoutGrupo));
    }
    if (filterKnockoutPista) {
      list = list.filter((p) => (p.pista ?? "").trim() === filterKnockoutPista);
    }
    return sortKnockoutPartidos(list, sortKnockoutMode, equipos);
  }, [
    knockoutMatches,
    equipos,
    filterKnockoutCompeticion,
    filterKnockoutGrupo,
    filterKnockoutPista,
    sortKnockoutMode,
  ]);

  const teamNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of equipos) map[e.id] = e.nombre;
    return map;
  }, [equipos]);

  function parsePos(text: string | null | undefined) {
    return (text ?? "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  function slotsForComp(comp: "champions" | "europa" | "conference") {
    const pools: Record<number, string[]> = {};
    for (let p = 1; p <= 10; p++) pools[p] = groupLetters.map((g) => `${p}${g.toUpperCase()}`);
    const out: Record<"champions" | "europa" | "conference", string[]> = { champions: [], europa: [], conference: [] };
    function takeDirect(c: keyof typeof out, text: string | null | undefined) {
      for (const p of parsePos(text)) {
        out[c].push(...(pools[p] ?? []));
        pools[p] = [];
      }
    }
    function takeBest(c: keyof typeof out, p: number, n: number | null | undefined) {
      let left = Math.max(0, Number(n ?? 0));
      const arr = pools[p] ?? [];
      while (left > 0 && arr.length > 0) {
        out[c].push(arr.shift() as string);
        left -= 1;
      }
      pools[p] = arr;
    }
    takeDirect("champions", cfg?.champions_direct_positions);
    takeBest("champions", 2, cfg?.champions_best_seconds);
    takeBest("champions", 3, cfg?.champions_best_thirds);
    takeDirect("europa", cfg?.europa_direct_positions);
    takeBest("europa", 2, cfg?.europa_best_seconds);
    takeBest("europa", 3, cfg?.europa_best_thirds);
    takeDirect("conference", cfg?.conference_direct_positions);
    takeBest("conference", 2, cfg?.conference_best_seconds);
    takeBest("conference", 3, cfg?.conference_best_thirds);
    takeBest("conference", 4, cfg?.conference_best_fourths);
    takeBest("conference", 5, cfg?.conference_best_fifths);
    return out[comp];
  }

  function compRows(comp: "champions" | "europa" | "conference") {
    return manualPairs[comp];
  }

  function optionsFor(comp: "champions" | "europa" | "conference", rowIndex: number, side: "local" | "visit") {
    const used = new Set<string>();
    compRows(comp).forEach((r, i) => {
      if (i === rowIndex) return;
      if (r.local) used.add(r.local);
      if (r.visit) used.add(r.visit);
    });
    const current = compRows(comp)[rowIndex]?.[side];
    const base = slotsForComp(comp);
    return base.filter((o) => o === current || !used.has(o));
  }

  function setManualPair(
    comp: "champions" | "europa" | "conference",
    rowIndex: number,
    side: "local" | "visit",
    value: string,
  ) {
    setManualPairs((p) => {
      const next = {
        champions: [...p.champions],
        europa: [...p.europa],
        conference: [...p.conference],
      };
      const row = { ...next[comp][rowIndex], [side]: value };
      next[comp][rowIndex] = row;
      return next;
    });
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Comprobando permisos...</p>
        </div>
      </main>
    );
  }
  if (rol !== "admin") {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Esta seccion solo esta disponible para administradores.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <a className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm" href="/admin/equipos">Equipos</a>
          <a className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm" href="/admin/configuracion">Configuracion torneo</a>
          <a className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:py-2 sm:text-sm" href="/admin/calendario">Calendario</a>
          <a className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm" href="/admin/directo">Directo</a>
        </div>

        <h1 className="text-2xl font-bold text-violet-800">Calendario</h1>

        <div className="flex flex-wrap gap-2">
          <button className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 sm:text-sm ${tab === "calendario" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`} onClick={() => setTab("calendario")} type="button">
            Generar calendario
          </button>
          <button className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 sm:text-sm ${tab === "cruces" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`} onClick={() => setTab("cruces")} type="button">
            Generar cruces
          </button>
          <button className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 sm:text-sm ${tab === "horarios" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`} onClick={() => setTab("horarios")} type="button">
            Importar horarios
          </button>
        </div>

        <form className="rounded-xl border border-slate-200 p-4" onSubmit={onAddPista}>
          <p className="mb-2 font-semibold">Pistas (configuración)</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input className="rounded-lg border border-slate-300 p-2" value={newPista} onChange={(e) => setNewPista(e.target.value)} placeholder="Nueva pista (ej: Pista 1)" />
            <button className="rounded-lg border border-violet-300 px-3 py-2 font-semibold text-violet-700" type="submit">Añadir pista</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {pistas.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-1 text-xs">
                {p.nombre}
                <button
                  type="button"
                  className="rounded border border-rose-300 px-1 text-rose-700"
                  onClick={() => void onDeletePista(p.id)}
                >
                  X
                </button>
              </span>
            ))}
          </div>
        </form>

        {tab === "calendario" ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-2 font-semibold">Generar calendario de grupos</p>
          <div className="grid gap-2 sm:grid-cols-4">
            <input
              className="rounded-lg border border-slate-300 p-2"
              value={startDm}
              onChange={(e) => setStartDm(formatDayMonthInput(e.target.value))}
              placeholder="Dia/mes (dd/mm)"
              inputMode="numeric"
              maxLength={5}
            />
            <select className="rounded-lg border border-slate-300 p-2" value={startHm} onChange={(e) => setStartHm(e.target.value)}>
              {TIME_OPTIONS.map((t) => (
                <option key={`s-${t}`} value={t}>{t}</option>
              ))}
            </select>
            <input className="rounded-lg border border-slate-300 p-2" type="number" min={10} value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} placeholder="Intervalo minutos" />
            <select className="rounded-lg border border-slate-300 p-2" value={defaultPista} onChange={(e) => setDefaultPista(e.target.value)}>
              <option value="">Pista por defecto</option>
              {pistas.map((p) => (
                <option key={p.id} value={p.nombre}>{p.nombre}</option>
              ))}
            </select>
            <button className="rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white" type="button" onClick={() => void onGenerate()}>
              Generar calendario
            </button>
          </div>
        </div>
        ) : null}

        {tab === "cruces" ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="mb-2 font-semibold">Generar cruces automaticos</p>
          <p className="mb-2 text-xs text-slate-600">
            Genera las 3 brackets ({TORNEO_COMPETICIONES.CHAMPIONS}, {TORNEO_COMPETICIONES.EUROPA} y{" "}
            {TORNEO_COMPETICIONES.CONFERENCE}) con slots tipo 1A vs 2D, 2A vs 3D, 3A vs 4D.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="rounded-lg border border-slate-300 p-2" type="number" min={10} value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} placeholder="Intervalo minutos" />
            <select className="rounded-lg border border-slate-300 p-2" value={defaultPista} onChange={(e) => setDefaultPista(e.target.value)}>
              <option value="">Pista por defecto</option>
              {pistas.map((p) => (
                <option key={p.id} value={p.nombre}>{p.nombre}</option>
              ))}
            </select>
            <button className="rounded-lg border border-violet-300 px-3 py-2 font-semibold text-violet-700" type="button" onClick={() => void onGenerateKnockout()}>
              Generar cruces
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold ${knockoutMode === "auto" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`} onClick={() => setKnockoutMode("auto")}>Automatico</button>
            <button type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold ${knockoutMode === "manual" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`} onClick={() => setKnockoutMode("manual")}>Manual</button>
          </div>
          {knockoutMode === "manual" ? (
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold">{TORNEO_COMPETICIONES.CHAMPIONS}</p>
                <div className="grid gap-1">
                  {manualPairs.champions.map((pair, idx) => (
                    <div key={`c-${idx}`} className="grid grid-cols-[1fr_auto_1fr] gap-1">
                      <select className="rounded border border-slate-300 p-1 text-sm" value={pair.local} onChange={(e) => setManualPair("champions", idx, "local", e.target.value)}>
                        <option value="">Local</option>
                        {optionsFor("champions", idx, "local").map((o) => (
                          <option key={`cl-${idx}-${o}`} value={o}>{o}</option>
                        ))}
                      </select>
                      <span className="self-center text-xs">vs</span>
                      <select className="rounded border border-slate-300 p-1 text-sm" value={pair.visit} onChange={(e) => setManualPair("champions", idx, "visit", e.target.value)}>
                        <option value="">Visit</option>
                        {optionsFor("champions", idx, "visit").map((o) => (
                          <option key={`cv-${idx}-${o}`} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold">{TORNEO_COMPETICIONES.EUROPA}</p>
                <div className="grid gap-1">
                  {manualPairs.europa.map((pair, idx) => (
                    <div key={`e-${idx}`} className="grid grid-cols-[1fr_auto_1fr] gap-1">
                      <select className="rounded border border-slate-300 p-1 text-sm" value={pair.local} onChange={(e) => setManualPair("europa", idx, "local", e.target.value)}>
                        <option value="">Local</option>
                        {optionsFor("europa", idx, "local").map((o) => (
                          <option key={`el-${idx}-${o}`} value={o}>{o}</option>
                        ))}
                      </select>
                      <span className="self-center text-xs">vs</span>
                      <select className="rounded border border-slate-300 p-1 text-sm" value={pair.visit} onChange={(e) => setManualPair("europa", idx, "visit", e.target.value)}>
                        <option value="">Visit</option>
                        {optionsFor("europa", idx, "visit").map((o) => (
                          <option key={`ev-${idx}-${o}`} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold">{TORNEO_COMPETICIONES.CONFERENCE}</p>
                <div className="grid gap-1">
                  {manualPairs.conference.map((pair, idx) => (
                    <div key={`f-${idx}`} className="grid grid-cols-[1fr_auto_1fr] gap-1">
                      <select className="rounded border border-slate-300 p-1 text-sm" value={pair.local} onChange={(e) => setManualPair("conference", idx, "local", e.target.value)}>
                        <option value="">Local</option>
                        {optionsFor("conference", idx, "local").map((o) => (
                          <option key={`fl-${idx}-${o}`} value={o}>{o}</option>
                        ))}
                      </select>
                      <span className="self-center text-xs">vs</span>
                      <select className="rounded border border-slate-300 p-1 text-sm" value={pair.visit} onChange={(e) => setManualPair("conference", idx, "visit", e.target.value)}>
                        <option value="">Visit</option>
                        {optionsFor("conference", idx, "visit").map((o) => (
                          <option key={`fv-${idx}-${o}`} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {knockoutMode === "manual" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                type="button"
                onClick={() => void onSaveKnockoutConfig()}
              >
                Guardar configuracion de cruces
              </button>
              <p className="self-center text-xs text-slate-600">
                Guarda los emparejamientos de arriba antes de editar horarios (asi no se resetean).
              </p>
            </div>
          ) : null}
        </div>
        ) : null}

        {tab === "horarios" ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${scheduleKind === "groups" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`}
                onClick={() => setScheduleKind("groups")}
              >
                Grupos
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${scheduleKind === "knockout" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`}
                onClick={() => setScheduleKind("knockout")}
              >
                Cruces
              </button>
            </div>
            <p className="mb-2 font-semibold">
              {scheduleKind === "groups" ? "Importar horarios de grupos" : "Importar horarios de cruces"}
            </p>
            {scheduleKind === "groups" ? (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  Pega una linea por partido (como en el PDF). Los nombres deben coincidir con los equipos en la app.
                </p>
                <p className="mb-2 rounded-lg bg-violet-50 p-2 font-mono text-xs text-violet-950">
                  Equipo Local vs Equipo Visitante | VIERNES 21:00 | C
                </p>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  Pega una linea por cruce. Usa los slots del cuadro (1A vs 2D, GCuartos 1 vs GCuartos 2…).
                  Indica la competicion si hay varios cuadros con el mismo cruce.
                </p>
                <p className="mb-2 rounded-lg bg-violet-50 p-2 font-mono text-xs text-violet-950">
                  Champions | 1A vs 2D | DOMINGO 21:00 | C
                </p>
                <p className="mb-2 rounded-lg bg-violet-50 p-2 font-mono text-xs text-violet-950">
                  Europa | GCuartos 1 vs GCuartos 2 | DOMINGO 23:00 | B
                </p>
              </>
            )}
            <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-950">
              Torneo nocturno: <strong>DOMINGO 1:00</strong> es la madrugada del sabado al domingo (01:00), no las 13:00.
              Pista con letra A, B o C (deben existir como Pista A/B/C en admin).
            </p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                className="w-28 rounded-lg border border-slate-300 p-2 text-sm"
                type="number"
                min={2024}
                max={2030}
                value={scheduleYear}
                onChange={(e) => setScheduleYear(e.target.value)}
                placeholder="Ano"
              />
              <label className="text-xs text-slate-600">
                Viernes
                <input
                  className="ml-1 w-20 rounded-lg border border-slate-300 p-2 text-sm"
                  value={weekendViernes}
                  onChange={(e) => setWeekendViernes(e.target.value)}
                  placeholder="12/06"
                />
              </label>
              <label className="text-xs text-slate-600">
                Sabado
                <input
                  className="ml-1 w-20 rounded-lg border border-slate-300 p-2 text-sm"
                  value={weekendSabado}
                  onChange={(e) => setWeekendSabado(e.target.value)}
                  placeholder="13/06"
                />
              </label>
              <label className="text-xs text-slate-600">
                Domingo
                <input
                  className="ml-1 w-20 rounded-lg border border-slate-300 p-2 text-sm"
                  value={weekendDomingo}
                  onChange={(e) => setWeekendDomingo(e.target.value)}
                  placeholder="14/06"
                />
              </label>
              <button
                className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-800"
                type="button"
                onClick={() => void (scheduleKind === "knockout" ? onLoadKnockoutTemplate() : onLoadScheduleTemplate())}
              >
                {scheduleKind === "knockout" ? "Cargar plantilla cruces" : "Cargar plantilla grupos"}
              </button>
              <button
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                type="button"
                disabled={applyingSchedule}
                onClick={() => void onApplySchedule()}
              >
                {applyingSchedule ? "Aplicando..." : "Aplicar horarios"}
              </button>
            </div>
            {scheduleResult ? (
              <pre className="mb-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                {scheduleResult}
              </pre>
            ) : null}
            <p className="mb-2 text-xs text-slate-600">
              {scheduleKind === "groups"
                ? `Partidos de grupos en la app: ${groupMatches.length}. Si es 0, genera el calendario antes.`
                : `Cruces en la app: ${knockoutMatches.length}. Si es 0, genera los brackets antes.`}
            </p>
            <textarea
              className="min-h-[180px] w-full rounded-lg border border-slate-300 p-3 font-mono text-sm"
              value={scheduleKind === "knockout" ? knockoutScheduleText : scheduleText}
              onChange={(e) =>
                scheduleKind === "knockout"
                  ? setKnockoutScheduleText(e.target.value)
                  : setScheduleText(e.target.value)
              }
              placeholder={
                scheduleKind === "knockout"
                  ? "Champions | 1A vs 2D | DOMINGO 21:00 | C\nEuropa | 2A vs 3D | DOMINGO 22:00 | B"
                  : "Los Cofrades vs La Peña | VIERNES 21:00 | C\nOtro Equipo vs Otro Mas | SABADO 1:00 | B"
              }
            />
          </div>
        ) : null}

        {tab === "calendario" || tab === "horarios" ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <p className="font-semibold">Partidos de grupos</p>
              <p className="text-xs text-slate-600">
                Mostrando {filteredGroupMatches.length} de {groupMatches.length}
              </p>
            </div>
            <div className="mb-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Grupo
                <select
                  className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
                  value={filterGrupo}
                  onChange={(e) => setFilterGrupo(e.target.value)}
                >
                  <option value="">Todos los grupos</option>
                  {gruposEnPartidos.map((g) => (
                    <option key={g} value={g}>
                      Grupo {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Pista
                <select
                  className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
                  value={filterPista}
                  onChange={(e) => setFilterPista(e.target.value)}
                >
                  <option value="">Todas las pistas</option>
                  {pistasEnPartidos.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-700">
                Ordenar por
                <select
                  className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as MatchSortMode)}
                >
                  <option value="hora-asc">Hora (mas pronto primero)</option>
                  <option value="hora-desc">Hora (mas tarde primero)</option>
                  <option value="grupo">Grupo (A→Z) y luego hora</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => {
                    setFilterGrupo("");
                    setFilterPista("");
                    setSortMode("hora-asc");
                  }}
                >
                  Quitar filtros
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              {filteredGroupMatches.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  No hay partidos con estos filtros. Prueba otro grupo o pista.
                </p>
              ) : (
                filteredGroupMatches.map((p) => (
                  <EditableMatchRow
                    key={p.id}
                    match={p}
                    sideLabel={sideLabel}
                    compactDate={compactDate}
                    pistas={pistas}
                    grupoLabel={grupoFromFase(p.fase)}
                    onSave={async (patch) => {
                      await api({ action: "save_match", id: p.id, ...patch });
                      await load();
                    }}
                  />
                ))
              )}
            </div>
          </div>
        ) : null}

        {tab === "cruces" ? (
          <>
            <form className="rounded-xl border border-slate-200 p-4" onSubmit={onCreateMatch}>
              <p className="mb-2 font-semibold">Crear cruce/partido manual</p>
              <div className="grid gap-2 sm:grid-cols-6">
                <select className="rounded-lg border border-slate-300 p-2" value={newMatch.local} onChange={(e) => setNewMatch((p) => ({ ...p, local: e.target.value }))} required>
                  <option value="">Local...</option>
                  {equipos.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
                <select className="rounded-lg border border-slate-300 p-2" value={newMatch.visit} onChange={(e) => setNewMatch((p) => ({ ...p, visit: e.target.value }))} required>
                  <option value="">Visitante...</option>
                  {equipos.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
                <input className="rounded-lg border border-slate-300 p-2" value={newMatch.fase} onChange={(e) => setNewMatch((p) => ({ ...p, fase: e.target.value }))} placeholder="Fase (ej: Cuartos)" />
                <input
                  className="rounded-lg border border-slate-300 p-2"
                  value={newMatch.diaMes}
                  onChange={(e) => setNewMatch((p) => ({ ...p, diaMes: formatDayMonthInput(e.target.value) }))}
                  placeholder="Dia/mes (dd/mm)"
                  inputMode="numeric"
                  maxLength={5}
                />
                <select className="rounded-lg border border-slate-300 p-2" value={newMatch.hora} onChange={(e) => setNewMatch((p) => ({ ...p, hora: e.target.value }))}>
                  {TIME_OPTIONS.map((t) => (
                    <option key={`m-${t}`} value={t}>{t}</option>
                  ))}
                </select>
                <select className="rounded-lg border border-slate-300 p-2" value={newMatch.pista} onChange={(e) => setNewMatch((p) => ({ ...p, pista: e.target.value }))}>
                  <option value="">Pista</option>
                  {pistas.map((p) => (
                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <button className="mt-2 rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700" type="submit">
                Crear partido
              </button>
            </form>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <p className="font-semibold">Cruces y brackets</p>
                <p className="text-xs text-slate-600">
                  Mostrando {filteredKnockoutMatches.length} de {knockoutMatches.length}
                </p>
              </div>
              <div className="mb-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Competicion
                  <select
                    className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
                    value={filterKnockoutCompeticion}
                    onChange={(e) => setFilterKnockoutCompeticion(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {competicionesEnCruces.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Grupo
                  <select
                    className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
                    value={filterKnockoutGrupo}
                    onChange={(e) => setFilterKnockoutGrupo(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {gruposEnCruces.map((g) => (
                      <option key={g} value={g}>
                        Grupo {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Pista
                  <select
                    className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
                    value={filterKnockoutPista}
                    onChange={(e) => setFilterKnockoutPista(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {pistasEnCruces.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-700">
                  Ordenar por
                  <select
                    className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
                    value={sortKnockoutMode}
                    onChange={(e) => setSortKnockoutMode(e.target.value as KnockoutSortMode)}
                  >
                    <option value="cuadro">Orden del cuadro (como arriba)</option>
                    <option value="hora-asc">Hora (mas pronto primero)</option>
                    <option value="hora-desc">Hora (mas tarde primero)</option>
                    <option value="grupo">Grupo (A→Z) y luego hora</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                    onClick={() => {
                      setFilterKnockoutCompeticion("");
                      setFilterKnockoutGrupo("");
                      setFilterKnockoutPista("");
                      setSortKnockoutMode("cuadro");
                    }}
                  >
                    Quitar filtros
                  </button>
                </div>
              </div>

              {filteredKnockoutMatches.length === 0 ? (
                <p className="mb-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  No hay cruces con estos filtros.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${crucesViewMode === "cuadro" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`}
                      onClick={() => setCrucesViewMode("cuadro")}
                    >
                      Vista cuadro
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${crucesViewMode === "lista" ? "bg-violet-600 text-white" : "border border-violet-300 text-violet-700"}`}
                      onClick={() => setCrucesViewMode("lista")}
                    >
                      Vista lista (editar horarios)
                    </button>
                  </div>

                  {crucesViewMode === "cuadro" ? (
                    <div className="mb-4">
                      <KnockoutBracketView matches={filteredKnockoutMatches} teamNames={teamNames} />
                    </div>
                  ) : (
                    <div className="mb-4 rounded-lg border border-violet-100 bg-violet-50/50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-800">
                        {sortKnockoutMode === "cuadro" || sortKnockoutMode === "competicion"
                          ? "Listado en orden del cuadro"
                          : "Listado por hora"}
                      </p>
                      <div className="grid gap-2">
                        {filteredKnockoutMatches.map((p) => (
                          <EditableMatchRow
                            key={`list-${p.id}-${p.slot_local}-${p.slot_visitante}-${p.fecha_hora ?? ""}`}
                            match={p}
                            sideLabel={sideLabel}
                            compactDate={compactDate}
                            pistas={pistas}
                            grupoLabel={partidoGruposTouch(p, equipos)[0]}
                            onSave={async (patch) => {
                              await api({ action: "save_match", id: p.id, ...patch });
                              await load();
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : null}

        {msg ? <p className="rounded-lg bg-slate-100 p-3 text-sm">{msg}</p> : null}
      </div>
    </main>
  );
}

function EditableMatchRow({
  match,
  sideLabel,
  compactDate,
  pistas,
  grupoLabel,
  onSave,
}: {
  match: Partido;
  sideLabel: (m: Partido, side: "local" | "visit") => string;
  compactDate: (iso: string | null) => string;
  pistas: Pista[];
  grupoLabel?: string;
  onSave: (patch: Partial<Partido>) => Promise<void>;
}) {
  const madridInit = match.fecha_hora ? datePartsMadrid(match.fecha_hora) : null;
  const [diaMes, setDiaMes] = useState(madridInit?.dm ?? "");
  const [hora, setHora] = useState(madridInit?.hm ?? "");
  const [pista, setPista] = useState(match.pista ?? "");
  const [fase, setFase] = useState(match.fase ?? "");
  const [estado, setEstado] = useState(match.estado ?? "");

  function toIso(dm: string, hm: string) {
    const m = dm.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    const t = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m || !t) return null;
    const year = tournamentYearFromIso(match.fecha_hora);
    const day = Number(m[1]);
    const month = Number(m[2]);
    const hour = Number(t[1]);
    const minute = Number(t[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    return toIsoFromParts(day, month, hour, minute, year);
  }

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 p-2">
      <div className="text-sm">
        <p className="font-semibold">
          {grupoLabel ? (
            <span className="mr-2 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-800">
              G{grupoLabel}
            </span>
          ) : null}
          {sideLabel(match, "local")} vs {sideLabel(match, "visit")}
        </p>
        <p className="text-slate-600">
          {faseCorta(fase || match.fase)} · {compactDate(match.fecha_hora)}
          {pista ? ` · ${pista}` : ""} · {estado || "pendiente"}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          className="rounded border border-slate-300 p-2 text-sm"
          value={diaMes}
          onChange={(e) => setDiaMes(formatDayMonthInput(e.target.value))}
          placeholder="dd/mm"
          inputMode="numeric"
          maxLength={5}
        />
        <select className="rounded border border-slate-300 p-2 text-sm" value={hora} onChange={(e) => setHora(e.target.value)}>
          <option value="">hh:mm</option>
          {TIME_OPTIONS.map((t) => (
            <option key={`r-${t}`} value={t}>{t}</option>
          ))}
        </select>
        <select className="rounded border border-slate-300 p-2 text-sm" value={pista} onChange={(e) => setPista(e.target.value)}>
          <option value="">Pista</option>
          {pista && !pistas.some((p) => p.nombre === pista) ? (
            <option value={pista}>{pista}</option>
          ) : null}
          {pistas.map((p) => (
            <option key={p.id} value={p.nombre}>{p.nombre}</option>
          ))}
        </select>
        <input className="rounded border border-slate-300 p-2 text-sm" value={fase} onChange={(e) => setFase(e.target.value)} placeholder="Fase" />
        <input className="rounded border border-slate-300 p-2 text-sm" value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Estado" />
      </div>
      <button
        className="w-fit rounded border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700"
        type="button"
        onClick={() =>
          void onSave({
            fecha_hora: toIso(diaMes, hora),
            pista: pista || null,
            fase: fase || null,
            estado: estado || null,
          })
        }
      >
        Guardar
      </button>
    </div>
  );
}
