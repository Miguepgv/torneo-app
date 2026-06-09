"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { jugadorNombreYAlias } from "@/lib/jugador-display";

type TarjetaRow = {
  jugador_id: string | null;
  tipo: string;
  jugadores: { nombre: string; apellidos: string; alias: string | null } | null;
  equipos: { nombre: string } | null;
};

type RankingRow = {
  nombre: string;
  equipo: string;
  puntos: number;
  amarillas: number;
  rojas: number;
};

function labelTarjeta(tipo: string) {
  if (tipo === "amarilla") return "Amarilla";
  if (tipo === "doble_amarilla") return "Doble amarilla";
  if (tipo === "roja") return "Roja";
  if (tipo === "roja_agresion") return "Roja (agresión)";
  return tipo;
}

export default function IncidenciasPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: cfgData }, { data, error }] = await Promise.all([
        supabase.from("configuracion_torneo").select("fairplay_falta_pts,fairplay_amarilla_pts,fairplay_roja_pts,fairplay_roja_agresion_pts").limit(1).maybeSingle(),
        supabase
          .from("tarjetas_partido")
          .select("jugador_id,tipo,jugadores(nombre,apellidos,alias),equipos(nombre)")
          .not("jugador_id", "is", null),
      ]);

      if (error) {
        setMessage(`Error cargando incidencias: ${error.message}`);
        setRanking([]);
        setLoading(false);
        return;
      }

      const cfg = (cfgData as Record<string, number | null> | null) ?? null;
      const ptsAmarilla = Number(cfg?.fairplay_amarilla_pts ?? 3);
      const ptsRoja = Number(cfg?.fairplay_roja_pts ?? 5);
      const ptsRojaAg = Number(cfg?.fairplay_roja_agresion_pts ?? 10);

      const conteo: Record<
        string,
        { nombre: string; equipo: string; puntos: number; amarillas: number; rojas: number }
      > = {};

      for (const row of (data as TarjetaRow[]) ?? []) {
        const jid = row.jugador_id;
        if (!jid) continue;
        const nombreJ = jugadorNombreYAlias(row.jugadores);
        const equipoN = row.equipos?.nombre ?? "—";
        if (!conteo[jid]) {
          conteo[jid] = { nombre: nombreJ, equipo: equipoN, puntos: 0, amarillas: 0, rojas: 0 };
        }

        const tipo = row.tipo;
        if (tipo === "amarilla") {
          conteo[jid].amarillas += 1;
          conteo[jid].puntos += ptsAmarilla;
        } else if (tipo === "doble_amarilla") {
          conteo[jid].amarillas += 2;
          conteo[jid].rojas += 1;
          conteo[jid].puntos += ptsAmarilla * 2 + ptsRoja;
        } else if (tipo === "roja") {
          conteo[jid].rojas += 1;
          conteo[jid].puntos += ptsRoja;
        } else if (tipo === "roja_agresion") {
          conteo[jid].rojas += 1;
          conteo[jid].puntos += ptsRojaAg;
        }
      }

      const lista = Object.values(conteo).sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, "es"));
      setRanking(lista);
      setLoading(false);
    }
    void load();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-14 sm:p-8">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-violet-900">Incidencias</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tarjetas y juego limpio · nombre y alias de cada jugador.
          </p>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {message ? (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>
        ) : null}

        {!loading && ranking.length === 0 ? (
          <p className="text-slate-600">Aún no hay tarjetas registradas en el torneo.</p>
        ) : null}

        <ol className="mt-2 grid gap-2">
          {ranking.map((r, i) => (
            <li
              key={`${r.nombre}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  <span className="mr-2 text-violet-600">{i + 1}.</span>
                  {r.nombre}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{r.equipo}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {r.amarillas > 0 ? `${r.amarillas} amarilla(s)` : null}
                  {r.amarillas > 0 && r.rojas > 0 ? " · " : null}
                  {r.rojas > 0 ? `${r.rojas} roja(s)` : null}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                {r.puntos} pts
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-xs text-slate-500">
          Tipos: {["amarilla", "doble_amarilla", "roja", "roja_agresion"].map(labelTarjeta).join(", ")}. Menos puntos
          de fair play es mejor en la clasificación por grupos.
        </p>
      </div>
    </main>
  );
}
