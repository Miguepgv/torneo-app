"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TORNEO_COMPETICIONES } from "@/lib/torneo-constants";

type Config = {
  total_equipos: number;
  total_grupos: number;
  clasifica_champions: number;
  clasifica_europa: number;
  clasifica_conference: number;
  desempate_1: string;
  desempate_2: string;
  desempate_3: string;
  excluir_ultimo_grupo_mayor: boolean;
  limite_cambios_hasta: string | null;
  criterios_desempate: string[];
  fairplay_falta_pts: number;
  fairplay_amarilla_pts: number;
  fairplay_roja_pts: number;
  fairplay_roja_agresion_pts: number;
  champions_direct_positions: string;
  champions_best_seconds: number;
  champions_best_thirds: number;
  europa_direct_positions: string;
  europa_best_seconds: number;
  europa_best_thirds: number;
  conference_direct_positions: string;
  conference_best_seconds: number;
  conference_best_thirds: number;
  conference_best_fourths: number;
  conference_best_fifths: number;
  qualification_mode: "simple" | "advanced";
};

const DEFAULT_CONFIG: Config = {
  total_equipos: 16,
  total_grupos: 1,
  clasifica_champions: 0,
  clasifica_europa: 0,
  clasifica_conference: 0,
  desempate_1: "goal_difference",
  desempate_2: "goals_for",
  desempate_3: "head_to_head_points",
  excluir_ultimo_grupo_mayor: true,
  limite_cambios_hasta: null,
  criterios_desempate: ["goal_difference", "goals_for", "head_to_head_points"],
  fairplay_falta_pts: 1,
  fairplay_amarilla_pts: 3,
  fairplay_roja_pts: 5,
  fairplay_roja_agresion_pts: 10,
  champions_direct_positions: "1",
  champions_best_seconds: 0,
  champions_best_thirds: 0,
  europa_direct_positions: "",
  europa_best_seconds: 0,
  europa_best_thirds: 0,
  conference_direct_positions: "",
  conference_best_seconds: 0,
  conference_best_thirds: 0,
  conference_best_fourths: 0,
  conference_best_fifths: 0,
  qualification_mode: "advanced",
};

function parsePositions(text: string) {
  return text
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function togglePositionCsv(csv: string, pos: number, checked: boolean) {
  const set = new Set(parsePositions(csv));
  if (checked) set.add(pos);
  else set.delete(pos);
  return Array.from(set).sort((a, b) => a - b).join(",");
}

function rankCountByGroups(totalEquipos: number, totalGrupos: number) {
  const g = Math.max(1, Number(totalGrupos || 1));
  const t = Math.max(0, Number(totalEquipos || 0));
  const base = Math.floor(t / g);
  const extra = t % g;
  const counts: Record<number, number> = {};
  const maxSize = base + (extra > 0 ? 1 : 0);
  for (let r = 1; r <= maxSize; r++) {
    const groupsWithRank = r <= base ? g : r === base + 1 ? extra : 0;
    if (groupsWithRank > 0) counts[r] = groupsWithRank;
  }
  return counts;
}

const TIEBREAK_OPTIONS: { key: string; label: string }[] = [
  { key: "goal_difference", label: "Gol average general" },
  { key: "goals_for", label: "Goles a favor" },
  { key: "head_to_head_points", label: "Partidos entre implicados (enfrentamiento directo)" },
  { key: "fairplay_points", label: "Juego limpio" },
  { key: "less_losses", label: "Menos derrotas" },
];
const TIEBREAK_ALLOWED = new Set(TIEBREAK_OPTIONS.map((o) => o.key));

export default function AdminConfiguracionPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rol, setRol] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  function consumeDirect(remaining: Record<number, number>, directText: string) {
    const direct = parsePositions(directText);
    for (const pos of direct) remaining[pos] = 0;
  }
  function consumeExtra(remaining: Record<number, number>, rank: number, count: number) {
    const take = Math.min(Math.max(0, Number(count || 0)), remaining[rank] ?? 0);
    remaining[rank] = Math.max(0, (remaining[rank] ?? 0) - take);
    return take;
  }

  const planner = useMemo(() => {
    const rankCounts = rankCountByGroups(cfg.total_equipos, cfg.total_grupos);
    if (cfg.qualification_mode === "simple") {
      const remainingSimple: Record<number, number> = { ...rankCounts };
      consumeDirect(remainingSimple, cfg.champions_direct_positions);
      consumeDirect(remainingSimple, cfg.europa_direct_positions);
      consumeDirect(remainingSimple, cfg.conference_direct_positions);
      return {
        rankCounts,
        afterChampions: remainingSimple,
        afterEuropa: remainingSimple,
        afterConference: remainingSimple,
        championsBest2: 0,
        europaAutoBest2: 0,
        europaBest3: 0,
        conferenceAutoBest3: 0,
        conferenceBest4: 0,
        conferenceBest5: 0,
        fuera: Object.values(remainingSimple).reduce((acc, n) => acc + Number(n || 0), 0),
        linesAfterChampions: [],
        linesAfterEuropa: [],
      };
    }

    const afterChampions: Record<number, number> = { ...rankCounts };
    consumeDirect(afterChampions, cfg.champions_direct_positions);
    const championsBest2 =
      consumeExtra(afterChampions, 2, cfg.champions_best_seconds);

    const afterEuropa: Record<number, number> = { ...afterChampions };
    const europaAutoBest2 = afterEuropa[2] ?? 0;
    afterEuropa[2] = 0;
    const europaBest3 =
      consumeExtra(afterEuropa, 3, cfg.europa_best_thirds);

    const afterConference: Record<number, number> = { ...afterEuropa };
    const conferenceAutoBest3 = afterConference[3] ?? 0;
    afterConference[3] = 0;
    const conferenceBest4 =
      consumeExtra(afterConference, 4, cfg.conference_best_fourths);
    const conferenceBest5 =
      consumeExtra(afterConference, 5, cfg.conference_best_fifths);

    function linesFor(rem: Record<number, number>) {
      const lines: string[] = [];
      if ((rem[2] ?? 0) > 0) lines.push(`${rem[2]} segundos restantes`);
      if ((rem[3] ?? 0) > 0) lines.push(`${rem[3]} terceros restantes`);
      if ((rem[4] ?? 0) > 0) lines.push(`${rem[4]} cuartos restantes`);
      if (!lines.length) lines.push("No quedan segundos/terceros/cuartos libres.");
      return lines;
    }

    return {
      rankCounts,
      afterChampions,
      afterEuropa,
      afterConference,
      championsBest2,
      europaAutoBest2,
      europaBest3,
      conferenceAutoBest3,
      conferenceBest4,
      conferenceBest5,
      fuera: Object.values(afterConference).reduce((acc, n) => acc + Number(n || 0), 0),
      linesAfterChampions: linesFor(afterChampions),
      linesAfterEuropa: linesFor(afterEuropa),
    };
  }, [cfg]);

  useEffect(() => {
    async function roleGuard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRol(null);
        setCheckingRole(false);
        return;
      }
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      setRol((data?.rol as string | undefined) ?? null);
      setCheckingRole(false);
    }
    void roleGuard();
  }, [supabase]);

  useEffect(() => {
    if (checkingRole || rol !== "admin") return;
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/configuracion-torneo", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json()) as { config?: Partial<Config> };
      if (res.ok && json.config) {
        const merged = { ...DEFAULT_CONFIG, ...json.config };
        const criteriosRaw = Array.isArray(json.config.criterios_desempate)
          ? (json.config.criterios_desempate as string[])
          : typeof json.config.criterios_desempate === "string"
            ? String(json.config.criterios_desempate)
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : DEFAULT_CONFIG.criterios_desempate;
        const criterios = criteriosRaw.filter((k) => TIEBREAK_ALLOWED.has(k));
        setCfg({
          ...merged,
          total_equipos: Number((json.config as { total_equipos?: number }).total_equipos ?? DEFAULT_CONFIG.total_equipos),
          champions_best_seconds: Number((json.config as { champions_best_seconds?: number }).champions_best_seconds ?? 0),
          europa_best_thirds: Number((json.config as { europa_best_thirds?: number }).europa_best_thirds ?? 0),
          conference_best_fourths: Number((json.config as { conference_best_fourths?: number }).conference_best_fourths ?? 0),
          conference_best_fifths: Number((json.config as { conference_best_fifths?: number }).conference_best_fifths ?? 0),
          criterios_desempate: criterios.length ? criterios : DEFAULT_CONFIG.criterios_desempate,
        });
      }
    }
    void load();
  }, [supabase, rol, checkingRole]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Comprobando permisos...</p>
        </div>
      </main>
    );
  }
  if (rol !== "admin") {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Esta seccion solo esta disponible para administradores.
          </p>
        </div>
      </main>
    );
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Sesion caducada.");
      setSaving(false);
      return;
    }
    const res = await fetch("/api/admin/configuracion-torneo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        ...cfg,
        desempate_1: cfg.criterios_desempate[0] ?? "goal_difference",
        desempate_2: cfg.criterios_desempate[1] ?? "goals_for",
        desempate_3: cfg.criterios_desempate[2] ?? "head_to_head_points",
        europa_direct_positions: cfg.qualification_mode === "simple" ? cfg.europa_direct_positions : "",
        conference_direct_positions: cfg.qualification_mode === "simple" ? cfg.conference_direct_positions : "",
        champions_best_seconds: cfg.qualification_mode === "advanced" ? planner.championsBest2 : 0,
        champions_best_thirds: 0,
        europa_best_seconds: cfg.qualification_mode === "advanced" ? planner.europaAutoBest2 : 0,
        europa_best_thirds: cfg.qualification_mode === "advanced" ? planner.europaBest3 : 0,
        conference_best_seconds: 0,
        conference_best_thirds: cfg.qualification_mode === "advanced" ? planner.conferenceAutoBest3 : 0,
        conference_best_fourths: cfg.qualification_mode === "advanced" ? planner.conferenceBest4 : 0,
        conference_best_fifths: cfg.qualification_mode === "advanced" ? planner.conferenceBest5 : 0,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo guardar la configuracion.");
      setSaving(false);
      return;
    }
    setMessage("Configuracion guardada.");
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <a className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm" href="/admin/equipos">Equipos</a>
          <a className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:py-2 sm:text-sm" href="/admin/configuracion">Configuracion torneo</a>
          <a className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm" href="/admin/calendario">Calendario</a>
          <a className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm" href="/admin/directo">Directo</a>
        </div>

        <h1 className="text-2xl font-bold text-violet-800">Configuracion torneo</h1>
        <p className="text-sm text-slate-600">
          Selecciona solo los criterios de desempate que quieras usar. Se aplican en este orden de arriba a abajo.
        </p>

        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSave}>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Numero total de equipos</label>
            <input
              className="rounded-lg border border-slate-300 p-3"
              type="number"
              min={2}
              value={cfg.total_equipos}
              onChange={(e) => setCfg((p) => ({ ...p, total_equipos: Number(e.target.value) }))}
              placeholder="Ej: 16"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Numero de grupos</label>
            <input
              className="rounded-lg border border-slate-300 p-3"
              type="number"
              min={1}
              value={cfg.total_grupos}
              onChange={(e) => setCfg((p) => ({ ...p, total_grupos: Number(e.target.value) }))}
              placeholder="Ej: 4"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-sm font-semibold text-slate-700">Modo de clasificacion</label>
            <select
              className="rounded-lg border border-slate-300 p-3"
              value={cfg.qualification_mode}
              onChange={(e) =>
                setCfg((p) => ({
                  ...p,
                  qualification_mode: e.target.value === "simple" ? "simple" : "advanced",
                }))
              }
            >
              <option value="simple">Simple (solo posiciones directas por grupo)</option>
              <option value="advanced">Avanzado (posiciones directas + mejores segundos/terceros)</option>
            </select>
          </div>
          <div className="sm:col-span-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
            <p className="font-semibold">Resumen de formato y clasificación</p>
            <p>
              Reparto por posicion con {cfg.total_equipos} equipos y {cfg.total_grupos} grupos:
              {" "}
              {[1, 2, 3, 4, 5, 6]
                .filter((pos) => (planner.rankCounts[pos] ?? 0) > 0)
                .map((pos) => `${pos}º=${planner.rankCounts[pos]}`)
                .join(" | ")}
            </p>
            {cfg.qualification_mode === "simple" ? (
              <p>
                Modo simple por grupo {"->"} {TORNEO_COMPETICIONES.CHAMPIONS}: {parsePositions(cfg.champions_direct_positions).length} |{" "}
                {TORNEO_COMPETICIONES.EUROPA}: {parsePositions(cfg.europa_direct_positions).length} |{" "}
                {TORNEO_COMPETICIONES.CONFERENCE}: {parsePositions(cfg.conference_direct_positions).length}
              </p>
            ) : null}
          </div>

          <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Forma de clasificación por competición</label>
          {cfg.qualification_mode === "simple" ? (
            <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs text-slate-600">Modo simple: marca que puestos pasan por grupo en cada competición.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded border border-slate-200 p-2">
                  <p className="mb-1 text-xs font-semibold">{TORNEO_COMPETICIONES.CHAMPIONS}</p>
                  {[1, 2, 3, 4, 5, 6]
                    .filter((pos) => (planner.rankCounts[pos] ?? 0) > 0)
                    .map((pos) => (
                      <label key={`c-${pos}`} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={parsePositions(cfg.champions_direct_positions).includes(pos)}
                          onChange={(e) =>
                            setCfg((p) => ({
                              ...p,
                              champions_direct_positions: togglePositionCsv(p.champions_direct_positions, pos, e.target.checked),
                            }))
                          }
                        />
                        <span>{pos}º</span>
                      </label>
                    ))}
                </div>
                <div className="rounded border border-slate-200 p-2">
                  <p className="mb-1 text-xs font-semibold">{TORNEO_COMPETICIONES.EUROPA}</p>
                  {[1, 2, 3, 4, 5, 6]
                    .filter((pos) => (planner.rankCounts[pos] ?? 0) > 0)
                    .map((pos) => (
                      <label key={`e-${pos}`} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={parsePositions(cfg.europa_direct_positions).includes(pos)}
                          onChange={(e) =>
                            setCfg((p) => ({
                              ...p,
                              europa_direct_positions: togglePositionCsv(p.europa_direct_positions, pos, e.target.checked),
                            }))
                          }
                        />
                        <span>{pos}º</span>
                      </label>
                    ))}
                </div>
                <div className="rounded border border-slate-200 p-2">
                  <p className="mb-1 text-xs font-semibold">{TORNEO_COMPETICIONES.CONFERENCE}</p>
                  {[1, 2, 3, 4, 5, 6]
                    .filter((pos) => (planner.rankCounts[pos] ?? 0) > 0)
                    .map((pos) => (
                      <label key={`f-${pos}`} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={parsePositions(cfg.conference_direct_positions).includes(pos)}
                          onChange={(e) =>
                            setCfg((p) => ({
                              ...p,
                              conference_direct_positions: togglePositionCsv(p.conference_direct_positions, pos, e.target.checked),
                            }))
                          }
                        />
                        <span>{pos}º</span>
                      </label>
                    ))}
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-700">Con esta configuración se quedan fuera: {planner.fuera}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1 sm:col-span-2 rounded-lg border border-slate-200 p-3">
                <p className="font-semibold">{TORNEO_COMPETICIONES.CHAMPIONS}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Puestos fijos por grupo</label>
                    <input className="rounded-lg border border-slate-300 p-2" value={cfg.champions_direct_positions} onChange={(e) => setCfg((p) => ({ ...p, champions_direct_positions: e.target.value }))} placeholder="Ej: 1" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Cuantos mejores segundos pasan a {TORNEO_COMPETICIONES.CHAMPIONS}</label>
                    <input className="rounded-lg border border-slate-300 p-2" type="number" min={0} value={Number(cfg.champions_best_seconds ?? 0)} onChange={(e) => setCfg((p) => ({ ...p, champions_best_seconds: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2 rounded-lg border border-slate-200 p-3">
                <p className="font-semibold">{TORNEO_COMPETICIONES.EUROPA}</p>
                <p className="text-xs text-slate-600">
                  Pasan automatico a {TORNEO_COMPETICIONES.EUROPA} los mejores segundos que quedan: {planner.europaAutoBest2}
                </p>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Cuantos mejores terceros pasan a {TORNEO_COMPETICIONES.EUROPA}</label>
                  <input className="rounded-lg border border-slate-300 p-2" type="number" min={0} value={Number(cfg.europa_best_thirds ?? 0)} onChange={(e) => setCfg((p) => ({ ...p, europa_best_thirds: Number(e.target.value) }))} />
                </div>
                <p className="text-xs text-slate-600">Tras {TORNEO_COMPETICIONES.CHAMPIONS}: {planner.linesAfterChampions.join(" | ")}</p>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2 rounded-lg border border-slate-200 p-3">
                <p className="font-semibold">{TORNEO_COMPETICIONES.CONFERENCE}</p>
                <p className="text-xs text-slate-600">
                  Pasan automatico a {TORNEO_COMPETICIONES.CONFERENCE} los mejores terceros que quedan: {planner.conferenceAutoBest3}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Cuantos mejores cuartos pasan a {TORNEO_COMPETICIONES.CONFERENCE}</label>
                    <input className="rounded-lg border border-slate-300 p-2" type="number" min={0} value={Number(cfg.conference_best_fourths ?? 0)} onChange={(e) => setCfg((p) => ({ ...p, conference_best_fourths: Number(e.target.value) }))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Cuantos mejores quintos pasan a {TORNEO_COMPETICIONES.CONFERENCE}</label>
                    <input className="rounded-lg border border-slate-300 p-2" type="number" min={0} value={Number(cfg.conference_best_fifths ?? 0)} onChange={(e) => setCfg((p) => ({ ...p, conference_best_fifths: Number(e.target.value) }))} />
                  </div>
                </div>
                <p className="text-xs text-slate-600">Tras {TORNEO_COMPETICIONES.EUROPA}: {planner.linesAfterEuropa.join(" | ")}</p>
                <p className="text-xs font-semibold text-slate-700">Equipos que se quedan fuera de eliminatorias: {planner.fuera}</p>
              </div>
            </>
          )}

          <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">Desempates (activar y ordenar)</p>
            <div className="grid gap-2">
              {TIEBREAK_OPTIONS.map((opt) => {
                const enabled = cfg.criterios_desempate.includes(opt.key);
                return (
                  <label key={opt.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        setCfg((p) => {
                          const next = p.criterios_desempate.filter((k) => k !== opt.key);
                          if (e.target.checked) next.push(opt.key);
                          return { ...p, criterios_desempate: next };
                        })
                      }
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">Orden actual de desempate</p>
              <div className="grid gap-2">
                {cfg.criterios_desempate.map((rule, index) => (
                  <div key={rule} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
                    <span className="text-sm">
                      {index + 1}. {TIEBREAK_OPTIONS.find((o) => o.key === rule)?.label ?? rule}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        disabled={index === 0}
                        onClick={() =>
                          setCfg((p) => {
                            const next = [...p.criterios_desempate];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            return { ...p, criterios_desempate: next };
                          })
                        }
                      >
                        Subir
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        disabled={index === cfg.criterios_desempate.length - 1}
                        onClick={() =>
                          setCfg((p) => {
                            const next = [...p.criterios_desempate];
                            [next[index + 1], next[index]] = [next[index], next[index + 1]];
                            return { ...p, criterios_desempate: next };
                          })
                        }
                      >
                        Bajar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Juego limpio (puntos por incidencia, menos es mejor)</label>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Falta</label>
            <input className="rounded-lg border border-slate-300 p-3" type="number" min={0} value={cfg.fairplay_falta_pts} onChange={(e) => setCfg((p) => ({ ...p, fairplay_falta_pts: Number(e.target.value) }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Tarjeta amarilla</label>
            <input className="rounded-lg border border-slate-300 p-3" type="number" min={0} value={cfg.fairplay_amarilla_pts} onChange={(e) => setCfg((p) => ({ ...p, fairplay_amarilla_pts: Number(e.target.value) }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Tarjeta roja</label>
            <input className="rounded-lg border border-slate-300 p-3" type="number" min={0} value={cfg.fairplay_roja_pts} onChange={(e) => setCfg((p) => ({ ...p, fairplay_roja_pts: Number(e.target.value) }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-700">Roja por agresion</label>
            <input className="rounded-lg border border-slate-300 p-3" type="number" min={0} value={cfg.fairplay_roja_agresion_pts} onChange={(e) => setCfg((p) => ({ ...p, fairplay_roja_agresion_pts: Number(e.target.value) }))} />
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-300 p-3 sm:col-span-2">
            <input type="checkbox" checked={cfg.excluir_ultimo_grupo_mayor} onChange={(e) => setCfg((p) => ({ ...p, excluir_ultimo_grupo_mayor: e.target.checked }))} />
            <span>Para mejores segundos/terceros entre grupos desiguales: excluir resultado contra el ultimo del grupo grande</span>
          </label>

          <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Limite de cambios de jugadores (fecha/hora)</label>
          <input
            className="rounded-lg border border-slate-300 p-3 sm:col-span-2"
            type="datetime-local"
            value={cfg.limite_cambios_hasta ? cfg.limite_cambios_hasta.slice(0, 16) : ""}
            onChange={(e) =>
              setCfg((p) => ({
                ...p,
                limite_cambios_hasta: e.target.value ? new Date(e.target.value).toISOString() : null,
              }))
            }
          />

          <button className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white sm:col-span-2" type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar configuracion"}
          </button>
        </form>

        {message ? <p className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p> : null}
      </div>
    </main>
  );
}
