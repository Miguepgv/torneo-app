"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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

type GolRow = {
  id: string;
  minuto: number | null;
  jugador_id: string | null;
  equipo_id: string | null;
  jugadores: { nombre: string; apellidos: string } | null;
};

export default function ResultadoDetallePage() {
  const params = useParams<{ id: string }>();
  const partidoId = params.id;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [partido, setPartido] = useState<Partido | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [visitNombre, setVisitNombre] = useState("");
  const [goles, setGoles] = useState<GolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      const { data: pData, error: pErr } = await supabase
        .from("partidos")
        .select(
          "id,estado,fecha_hora,goles_local,goles_visitante,fase,equipo_local_id,equipo_visitante_id",
        )
        .eq("id", partidoId)
        .single();

      if (pErr || !pData) {
        setMessage(`No se encontro el partido: ${pErr?.message ?? ""}`);
        setPartido(null);
        setLoading(false);
        return;
      }

      const p = pData as Partido;
      setPartido(p);

      const ids = [p.equipo_local_id, p.equipo_visitante_id].filter(Boolean) as string[];
      if (ids.length) {
        const { data: eqData } = await supabase.from("equipos").select("id,nombre").in("id", ids);
        const map = new Map((eqData as { id: string; nombre: string }[] | null)?.map((e) => [e.id, e.nombre]));
        setLocalNombre(p.equipo_local_id ? map.get(p.equipo_local_id) ?? "—" : "—");
        setVisitNombre(p.equipo_visitante_id ? map.get(p.equipo_visitante_id) ?? "—" : "—");
      }

      const { data: gData, error: gErr } = await supabase
        .from("goles")
        .select("id,minuto,jugador_id,equipo_id,jugadores(nombre,apellidos)")
        .eq("partido_id", partidoId)
        .order("minuto", { ascending: true, nullsFirst: false });

      if (gErr) {
        setMessage(`Error cargando goles: ${gErr.message}`);
        setGoles([]);
      } else {
        setGoles((gData as GolRow[]) ?? []);
      }
      setLoading(false);
    }
    if (partidoId) void load();
  }, [partidoId, supabase]);

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <Link className="text-sm font-medium text-violet-700 underline" href="/resultados">
            ← Resultados
          </Link>
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

        {partido ? (
          <>
            <h1 className="text-2xl font-bold text-violet-800">Detalle partido</h1>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {localNombre} {partido.goles_local ?? 0} — {partido.goles_visitante ?? 0} {visitNombre}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {partido.fecha_hora
                ? new Date(partido.fecha_hora).toLocaleString("es-ES")
                : "Fecha por confirmar"}{" "}
              · {partido.estado ?? "—"}
              {partido.fase ? ` · ${partido.fase}` : ""}
            </p>

            <h2 className="mt-6 text-lg font-semibold text-slate-900">Goles del partido</h2>
            {goles.length === 0 ? (
              <p className="mt-2 text-slate-600">No hay goles registrados en este partido.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {goles.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800"
                  >
                    <span className="font-medium">
                      {g.jugadores
                        ? `${g.jugadores.nombre} ${g.jugadores.apellidos}`
                        : "Jugador desconocido"}
                    </span>
                    {g.minuto != null ? (
                      <span className="ml-2 text-sm text-slate-600">min {g.minuto}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
