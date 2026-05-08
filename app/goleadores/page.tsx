"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type GolRow = {
  jugador_id: string | null;
  propia_meta?: boolean | null;
  jugadores: { nombre: string; apellidos: string } | null;
  equipos: { nombre: string } | null;
};

export default function GoleadoresPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [ranking, setRanking] = useState<{ nombre: string; equipo: string; goles: number }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("goles")
        .select("jugador_id,propia_meta,jugadores(nombre,apellidos),equipos(nombre)")
        .not("jugador_id", "is", null)
        .not("propia_meta", "eq", true);

      if (error) {
        setMessage(`Error cargando goles: ${error.message}`);
        setRanking([]);
        setLoading(false);
        return;
      }

      const conteo: Record<string, { nombre: string; equipo: string; goles: number }> = {};
      for (const row of (data as GolRow[]) ?? []) {
        const jid = row.jugador_id;
        if (!jid || row.propia_meta) continue;
        const nombreJ =
          row.jugadores != null
            ? `${row.jugadores.nombre} ${row.jugadores.apellidos}`
            : "Sin nombre";
        const equipoN = row.equipos?.nombre ?? "—";
        if (!conteo[jid]) {
          conteo[jid] = { nombre: nombreJ, equipo: equipoN, goles: 0 };
        }
        conteo[jid].goles += 1;
      }

      const lista = Object.values(conteo).sort((a, b) => b.goles - a.goles);
      setRanking(lista);
      setLoading(false);
    }
    void load();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-14 sm:p-8">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-violet-900">Goleadores</h1>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {message ? (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>
        ) : null}

        {!loading && ranking.length === 0 ? (
          <p className="text-slate-600">Aun no hay goles registrados en el torneo.</p>
        ) : null}

        <ol className="mt-2 grid gap-2">
          {ranking.map((r, i) => (
            <li
              key={`${r.nombre}-${i}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
            >
              <span className="font-medium text-slate-900">
                <span className="mr-2 text-violet-600">{i + 1}.</span>
                {r.nombre}
                <span className="ml-2 text-sm font-normal text-slate-600">({r.equipo})</span>
              </span>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800">
                {r.goles}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
