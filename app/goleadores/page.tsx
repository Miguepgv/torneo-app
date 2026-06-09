"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { partesJugadorDisplay, type JugadorNombre } from "@/lib/jugador-display";

type GolRow = {
  jugador_id: string | null;
  propia_meta?: boolean | null;
  equipos: { nombre: string } | { nombre: string }[] | null;
};

type RankingRow = {
  nombreCompleto: string;
  alias: string | null;
  equipo: string;
  goles: number;
};

function equipoNombre(e: GolRow["equipos"]): string {
  if (!e) return "—";
  if (Array.isArray(e)) return e[0]?.nombre ?? "—";
  return e.nombre ?? "—";
}

export default function GoleadoresPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("goles")
        .select("jugador_id,propia_meta,equipos(nombre)")
        .not("jugador_id", "is", null)
        .not("propia_meta", "eq", true);

      if (error) {
        setMessage(`Error cargando goles: ${error.message}`);
        setRanking([]);
        setLoading(false);
        return;
      }

      const rows = (data as GolRow[]) ?? [];
      const jugadorIds = [...new Set(rows.map((r) => r.jugador_id).filter(Boolean))] as string[];

      const jugadorMap = new Map<string, JugadorNombre>();
      if (jugadorIds.length > 0) {
        const { data: jugadoresData, error: jugadoresError } = await supabase
          .from("jugadores")
          .select("id,nombre,apellidos,alias")
          .in("id", jugadorIds);

        if (jugadoresError) {
          setMessage(`Error cargando jugadores: ${jugadoresError.message}`);
          setRanking([]);
          setLoading(false);
          return;
        }

        for (const j of (jugadoresData as (JugadorNombre & { id: string })[]) ?? []) {
          jugadorMap.set(j.id, j);
        }
      }

      const conteo: Record<string, RankingRow> = {};
      for (const row of rows) {
        const jid = row.jugador_id;
        if (!jid || row.propia_meta) continue;
        const { nombreCompleto, alias } = partesJugadorDisplay(jugadorMap.get(jid) ?? null);
        const equipoN = equipoNombre(row.equipos);
        if (!conteo[jid]) {
          conteo[jid] = { nombreCompleto, alias, equipo: equipoN, goles: 0 };
        }
        conteo[jid].goles += 1;
      }

      const lista = Object.values(conteo).sort(
        (a, b) => b.goles - a.goles || a.nombreCompleto.localeCompare(b.nombreCompleto, "es"),
      );
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
          <p className="mt-1 text-sm text-slate-500">Nombre y alias de cada jugador.</p>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {message ? (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>
        ) : null}

        {!loading && ranking.length === 0 ? (
          <p className="text-slate-600">Aún no hay goles registrados en el torneo.</p>
        ) : null}

        <ol className="mt-2 grid gap-2">
          {ranking.map((r, i) => (
            <li
              key={`${r.nombreCompleto}-${r.alias ?? ""}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  <span className="mr-2 text-violet-600">{i + 1}.</span>
                  {r.nombreCompleto}
                </p>
                {r.alias ? (
                  <p className="mt-0.5 text-sm font-semibold text-violet-600">{r.alias}</p>
                ) : null}
                <p className="mt-0.5 text-sm text-slate-600">{r.equipo}</p>
              </div>
              <span className="shrink-0 rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800">
                {r.goles}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
