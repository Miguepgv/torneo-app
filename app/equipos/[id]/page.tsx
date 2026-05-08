"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Equipo = {
  id: string;
  nombre: string;
  logo_url: string | null;
};

type Jugador = {
  id: string;
  nombre: string;
  apellidos: string;
  alias: string | null;
  foto_url?: string | null;
};

type Gol = {
  jugador_id: string | null;
  propia_meta?: boolean | null;
};

export default function EquipoDetallePage() {
  const params = useParams<{ id: string }>();
  const equipoId = params.id;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [golesPorJugador, setGolesPorJugador] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setMessage("");

      const { data: teamData, error: teamError } = await supabase
        .from("equipos")
        .select("id,nombre,logo_url")
        .eq("id", equipoId)
        .single();

      if (teamError) {
        setMessage(`Error cargando equipo: ${teamError.message}`);
        setLoading(false);
        return;
      }

      const { data: playersData, error: playersError } = await supabase
        .from("jugadores")
        .select("id,nombre,apellidos,alias,foto_url")
        .eq("equipo_id", equipoId)
        .order("nombre", { ascending: true });

      if (playersError) {
        setMessage(`Error cargando jugadores: ${playersError.message}`);
        setLoading(false);
        return;
      }

      const { data: goalsData, error: goalsError } = await supabase
        .from("goles")
        .select("jugador_id,propia_meta")
        .eq("equipo_id", equipoId);

      if (goalsError) {
        setMessage(`Error cargando goles: ${goalsError.message}`);
        setLoading(false);
        return;
      }

      const resumen: Record<string, number> = {};
      for (const gol of ((goalsData as Gol[]) ?? [])) {
        if (!gol.jugador_id || gol.propia_meta) continue;
        resumen[gol.jugador_id] = (resumen[gol.jugador_id] ?? 0) + 1;
      }

      setEquipo(teamData as Equipo);
      setJugadores((playersData as Jugador[]) ?? []);
      setGolesPorJugador(resumen);
      setLoading(false);
    }

    if (equipoId) void loadData();
  }, [equipoId, supabase]);

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-violet-800">Equipo</h1>
          <a className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700" href="/equipos">
            Volver
          </a>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {message ? <p className="mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-900">{message}</p> : null}

        {!loading && equipo ? (
          <>
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              {equipo.logo_url ? (
                <Image
                  src={equipo.logo_url}
                  alt={`Escudo ${equipo.nombre}`}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-500">
                  Sin escudo
                </div>
              )}
              <p className="text-xl font-bold text-slate-900">{equipo.nombre}</p>
            </div>

            <h2 className="mb-2 text-lg font-semibold">Jugadores</h2>
            {jugadores.length === 0 ? (
              <p className="text-slate-600">No hay jugadores en este equipo.</p>
            ) : (
              <div className="grid gap-2">
                {jugadores.map((jugador) => (
                  <div key={jugador.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-3">
                      {jugador.foto_url ? (
                        <Image
                          src={jugador.foto_url}
                          alt={`${jugador.nombre} ${jugador.apellidos}`}
                          width={44}
                          height={44}
                          className="h-11 w-11 rounded-full border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-xs font-semibold text-slate-500">
                          {(jugador.nombre || "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">
                          {jugador.nombre} {jugador.apellidos}
                        </p>
                        <p className="text-sm text-slate-600">Alias: {jugador.alias || "-"}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-800">
                      Goles: {golesPorJugador[jugador.id] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
