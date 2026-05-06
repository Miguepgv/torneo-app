"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
};

export default function ResultadosPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [nombresEquipo, setNombresEquipo] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("partidos")
        .select(
          "id,estado,fecha_hora,goles_local,goles_visitante,fase,equipo_local_id,equipo_visitante_id",
        )
        .order("fecha_hora", { ascending: false, nullsFirst: false });

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
    }
    void load();
  }, [supabase]);

  function nombreEquipo(id: string | null) {
    if (!id) return "—";
    return nombresEquipo[id] ?? "Equipo";
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-violet-800">Resultados</h1>
          <Link
            className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700"
            href="/"
          >
            Inicio
          </Link>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {message ? (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>
        ) : null}

        {!loading && partidos.length === 0 ? (
          <p className="text-slate-600">No hay partidos registrados aun.</p>
        ) : null}

        <div className="grid gap-2">
          {partidos.map((p) => (
            <Link
              key={p.id}
              className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              href={`/resultados/${p.id}`}
            >
              <div>
                <p className="font-semibold text-slate-900">
                  {nombreEquipo(p.equipo_local_id)} {p.goles_local ?? 0} — {p.goles_visitante ?? 0}{" "}
                  {nombreEquipo(p.equipo_visitante_id)}
                </p>
                <p className="text-sm text-slate-600">
                  {p.fecha_hora
                    ? new Date(p.fecha_hora).toLocaleString("es-ES")
                    : "Fecha por confirmar"}{" "}
                  · {p.estado ?? "—"}
                  {p.fase ? ` · ${p.fase}` : ""}
                </p>
              </div>
              <span className="text-sm font-medium text-violet-700">Ver detalle →</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
