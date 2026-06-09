"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { partesJugadorDisplay, type JugadorNombre } from "@/lib/jugador-display";

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
  propia_meta?: boolean | null;
};

function JugadorGoalAvatar(props: {
  fotoUrl: string | null | undefined;
  nombreCompleto: string;
}) {
  const url = props.fotoUrl?.trim();
  const letter = (props.nombreCompleto || "?").trim().slice(0, 1).toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-200 text-sm font-bold text-slate-600">
      {letter}
    </div>
  );
}

export default function ResultadoDetallePage() {
  const params = useParams<{ id: string }>();
  const partidoId = params.id;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [partido, setPartido] = useState<Partido | null>(null);
  const [localNombre, setLocalNombre] = useState("");
  const [visitNombre, setVisitNombre] = useState("");
  const [goles, setGoles] = useState<
    (GolRow & { nombreCompleto: string; alias: string | null; fotoUrl: string | null })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!partidoId) return;

      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      if (!silent) setMessage("");

      const { data: pData, error: pErr } = await supabase
        .from("partidos")
        .select(
          "id,estado,fecha_hora,goles_local,goles_visitante,fase,equipo_local_id,equipo_visitante_id",
        )
        .eq("id", partidoId)
        .single();

      if (pErr || !pData) {
        if (!silent) {
          setMessage(`No se encontro el partido: ${pErr?.message ?? ""}`);
        }
        setPartido(null);
        if (!silent) setLoading(false);
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
        .select("id,minuto,jugador_id,equipo_id,propia_meta")
        .eq("partido_id", partidoId)
        .order("minuto", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (gErr) {
        if (!silent) setMessage(`Error cargando goles: ${gErr.message}`);
        setGoles([]);
      } else {
        const rows = (gData as GolRow[]) ?? [];
        const jugadorIds = [...new Set(rows.map((r) => r.jugador_id).filter(Boolean))] as string[];
        const jugadorMap = new Map<string, JugadorNombre & { foto_url?: string | null }>();

        if (jugadorIds.length > 0) {
          const { data: jugadoresData } = await supabase
            .from("jugadores")
            .select("id,nombre,apellidos,alias,foto_url")
            .in("id", jugadorIds);

          for (const j of (jugadoresData as (JugadorNombre & { id: string; foto_url?: string | null })[]) ?? []) {
            jugadorMap.set(j.id, j);
          }
        }

        setGoles(
          rows.map((g) => {
            const j = g.jugador_id ? jugadorMap.get(g.jugador_id) : null;
            const { nombreCompleto, alias } = partesJugadorDisplay(j);
            return {
              ...g,
              nombreCompleto,
              alias,
              fotoUrl: j?.foto_url ?? null,
            };
          }),
        );
      }
      if (!silent) setLoading(false);
    },
    [partidoId, supabase],
  );

  useEffect(() => {
    if (!partidoId) return;
    void load();
    const id = window.setInterval(() => void load({ silent: true }), 7000);
    return () => window.clearInterval(id);
  }, [partidoId, load]);

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
            <p className="mt-1 text-xs text-slate-500">
              Marcador y goles · se refrescan cada pocos segundos mientras tienes abierta esta pantalla.
            </p>
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
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800"
                  >
                    <JugadorGoalAvatar fotoUrl={g.fotoUrl} nombreCompleto={g.nombreCompleto} />
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium">{g.nombreCompleto}</span>
                      {g.alias ? (
                        <span className="mt-0.5 block text-sm font-semibold text-violet-600">{g.alias}</span>
                      ) : null}
                      <span className="mt-0.5 block text-sm text-slate-600">
                        {g.minuto != null ? `Min ${g.minuto}` : "Min —"}
                        {g.propia_meta ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">
                            Propia puerta
                          </span>
                        ) : null}
                      </span>
                    </div>
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
