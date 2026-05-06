"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Equipo = {
  id: string;
  nombre: string;
  logo_url: string | null;
};

export default function EquiposPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadEquipos() {
      const { data, error } = await supabase
        .from("equipos")
        .select("id,nombre,logo_url")
        .order("nombre", { ascending: true });

      if (error) {
        setMessage(`Error cargando equipos: ${error.message}`);
      } else {
        setEquipos((data as Equipo[]) ?? []);
      }
      setLoading(false);
    }
    void loadEquipos();
  }, [supabase]);

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-violet-800">Equipos</h1>
          <a className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700" href="/">
            Inicio
          </a>
        </div>

        {loading ? <p>Cargando...</p> : null}
        {message ? <p className="mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-900">{message}</p> : null}

        {!loading && equipos.length === 0 ? <p>No hay equipos disponibles.</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {equipos.map((equipo) => (
            <a
              key={equipo.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
              href={`/equipos/${equipo.id}`}
            >
              {equipo.logo_url ? (
                <Image
                  src={equipo.logo_url}
                  alt={`Escudo ${equipo.nombre}`}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-500">
                  Sin
                </div>
              )}
              <span className="font-semibold text-slate-900">{equipo.nombre}</span>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
