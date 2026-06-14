"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Partido = {
  id: string;
  estado: string | null;
  fecha_hora: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
  fase: string | null;
  equipo_local_id: string | null;
  equipo_visitante_id: string | null;
  slot_local?: string | null;
  slot_visitante?: string | null;
};

function estadoNorm(estado: string | null | undefined) {
  return (estado ?? "pendiente").toLowerCase();
}

function faseSortKey(fase: string | null | undefined) {
  const f = (fase ?? "").trim();
  if (f.startsWith("Grupo ")) return 0;
  if (f.startsWith("Cuadro ") || f.startsWith("Cruce ")) return 2;
  return 1;
}

/** Orden de juego: fecha/hora ascendente; en directo primero jugándose, luego pendientes. */
function sortPartidos(list: Partido[], tab: "activos" | "finalizados") {
  return [...list].sort((a, b) => {
    if (tab === "activos") {
      const rank = (e: string) => (e === "jugandose" ? 0 : e === "pendiente" ? 1 : 2);
      const dr = rank(estadoNorm(a.estado)) - rank(estadoNorm(b.estado));
      if (dr !== 0) return dr;
    }
    const fa = faseSortKey(a.fase);
    const fb = faseSortKey(b.fase);
    if (fa !== fb) return fa - fb;
    const ta = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return (a.fase ?? "").localeCompare(b.fase ?? "", "es");
  });
}

function PartidoCard({
  p,
  etiquetaLado,
}: {
  p: Partido;
  etiquetaLado: (partido: Partido, side: "local" | "visit") => string;
}) {
  const vivo = estadoNorm(p.estado) === "jugandose";
  const finalizado = estadoNorm(p.estado) === "finalizado";
  return (
    <Link
      href={`/resultados/${p.id}`}
      className={`flex flex-col gap-2 rounded-2xl border-2 p-4 transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${
        vivo
          ? "border-emerald-400/70 bg-emerald-50/50"
          : finalizado
            ? "border-slate-200 bg-slate-50/80 hover:border-slate-300"
            : "border-amber-200/80 bg-amber-50/30 hover:border-amber-300"
      }`}
    >
      <div>
        <p className="font-bold text-slate-900">
          {etiquetaLado(p, "local")}{" "}
          <span className="text-violet-800">{p.goles_local ?? 0}</span>
          {" — "}
          <span className="text-violet-800">{p.goles_visitante ?? 0}</span> {etiquetaLado(p, "visit")}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {p.fecha_hora ? new Date(p.fecha_hora).toLocaleString("es-ES") : "Fecha por confirmar"} ·{" "}
          {(p.estado ?? "pendiente").replace(/^./, (c) => c.toUpperCase())}
          {p.fase ? ` · ${p.fase}` : ""}
        </p>
      </div>
      <span className="text-sm font-semibold text-violet-700">Ver detalle →</span>
    </Link>
  );
}

export default function ResultadosPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [nombresEquipo, setNombresEquipo] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"activos" | "finalizados">("activos");

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("partidos")
      .select("id,estado,fecha_hora,goles_local,goles_visitante,fase,equipo_local_id,equipo_visitante_id,slot_local,slot_visitante");

    if (error) {
      setMessage(`Error cargando partidos: ${error.message}`);
      setPartidos([]);
      setLoading(false);
      return;
    }

    const rows = (data as Partido[]) ?? [];
    setPartidos(rows);

    const ids = new Set<string>();
    for (const p of rows) {
      if (p.equipo_local_id) ids.add(p.equipo_local_id);
      if (p.equipo_visitante_id) ids.add(p.equipo_visitante_id);
    }

    if (ids.size === 0) {
      setNombresEquipo({});
      setLoading(false);
      return;
    }

    const { data: equiposData, error: equiposError } = await supabase
      .from("equipos")
      .select("id,nombre")
      .in("id", [...ids]);

    if (equiposError) {
      setMessage(`Error cargando equipos: ${equiposError.message}`);
    } else {
      const map: Record<string, string> = {};
      for (const e of equiposData ?? []) {
        const row = e as { id: string; nombre: string };
        map[row.id] = row.nombre;
      }
      setNombresEquipo(map);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const partidosActivos = useMemo(
    () => sortPartidos(partidos.filter((p) => estadoNorm(p.estado) !== "finalizado"), "activos"),
    [partidos],
  );
  const partidosFinalizados = useMemo(
    () => sortPartidos(partidos.filter((p) => estadoNorm(p.estado) === "finalizado"), "finalizados"),
    [partidos],
  );
  const visibles = tab === "activos" ? partidosActivos : partidosFinalizados;

  function etiquetaLado(partido: Partido, side: "local" | "visit") {
    if (side === "local") {
      if (partido.equipo_local_id) return nombresEquipo[partido.equipo_local_id] ?? "Equipo";
      if (partido.slot_local?.trim()) return partido.slot_local.trim();
      return "Por definir";
    }
    if (partido.equipo_visitante_id) return nombresEquipo[partido.equipo_visitante_id] ?? "Equipo";
    if (partido.slot_visitante?.trim()) return partido.slot_visitante.trim();
    return "Por definir";
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-violet-50/40 p-4 pb-14 sm:p-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl shadow-slate-200/70 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-violet-900">Resultados</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ordenados por horario de juego · se refresca cada pocos segundos con el directo.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-1">
          <button
            type="button"
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
              tab === "activos" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            onClick={() => setTab("activos")}
          >
            En directo / Pendientes
            {partidosActivos.length > 0 ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${tab === "activos" ? "bg-white/25" : "bg-violet-100 text-violet-800"}`}
              >
                {partidosActivos.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
              tab === "finalizados" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            onClick={() => setTab("finalizados")}
          >
            Finalizados
            {partidosFinalizados.length > 0 ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${tab === "finalizados" ? "bg-white/25" : "bg-slate-300 text-slate-800"}`}
              >
                {partidosFinalizados.length}
              </span>
            ) : null}
          </button>
        </div>

        {tab === "activos" ? (
          <p className="mb-3 text-xs text-slate-600">
            Primero los que se están jugando, después los pendientes, por fecha y hora del calendario (grupos antes que
            cruces).
          </p>
        ) : (
          <p className="mb-3 text-xs text-slate-600">Partidos ya cerrados, del primero al último según horario.</p>
        )}

        {loading ? <p>Cargando...</p> : null}
        {message ? (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>
        ) : null}

        {!loading && visibles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            {tab === "activos" ? "No hay partidos pendientes ni en juego." : "Aún no hay partidos finalizados."}
          </p>
        ) : null}

        <div className="grid gap-3">
          {visibles.map((p) => (
            <PartidoCard key={p.id} p={p} etiquetaLado={etiquetaLado} />
          ))}
        </div>
      </div>
    </main>
  );
}
