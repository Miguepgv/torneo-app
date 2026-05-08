"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PartidoLive = {
  id: string;
  estado: string | null;
  fecha_hora: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
  fase: string | null;
  equipo_local_id: string | null;
  equipo_visitante_id: string | null;
};

function nombre(ids: Record<string, string>, id: string | null) {
  if (!id) return "—";
  return ids[id] ?? "Equipo";
}

function estadoBadge(estado: string | null) {
  const e = (estado ?? "pendiente").toLowerCase();
  if (e === "jugandose")
    return <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white animate-pulse">En directo</span>;
  if (e === "finalizado") return <span className="rounded-full bg-slate-500 px-2.5 py-0.5 text-xs font-semibold text-white">Finalizado</span>;
  return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Pendiente</span>;
}

export default function Home() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [partidos, setPartidos] = useState<PartidoLive[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("partidos")
      .select("id,estado,fecha_hora,goles_local,goles_visitante,fase,equipo_local_id,equipo_visitante_id")
      .order("fecha_hora", { ascending: false, nullsFirst: false });

    if (error) {
      setErr(error.message);
      setPartidos([]);
      setLoading(false);
      return;
    }

    const rows = (data as PartidoLive[]) ?? [];
    setPartidos(rows);
    setErr("");

    const ids = new Set<string>();
    for (const p of rows) {
      if (p.equipo_local_id) ids.add(p.equipo_local_id);
      if (p.equipo_visitante_id) ids.add(p.equipo_visitante_id);
    }
    if (ids.size === 0) {
      setNombres({});
      setLoading(false);
      return;
    }

    const { data: eq, error: e2 } = await supabase.from("equipos").select("id,nombre").in("id", [...ids]);
    if (e2) setErr(e2.message);
    else {
      const map: Record<string, string> = {};
      for (const row of eq ?? []) map[(row as { id: string }).id] = (row as { nombre: string }).nombre;
      setNombres(map);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const enDirecto = useMemo(
    () => partidos.filter((p) => (p.estado ?? "").toLowerCase() === "jugandose"),
    [partidos],
  );
  const resto = useMemo(
    () => partidos.filter((p) => (p.estado ?? "").toLowerCase() !== "jugandose").slice(0, 12),
    [partidos],
  );

  return (
    <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 via-violet-50/40 to-slate-100 pb-16">
      <div className="relative overflow-hidden border-b border-violet-200/60 bg-gradient-to-br from-violet-700 via-violet-800 to-indigo-900 px-4 py-12 sm:py-16">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-200">Maratón cofrade</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white drop-shadow-md sm:text-5xl">
            2026
          </h1>
          <p className="mt-4 max-w-xl mx-auto text-base text-violet-100">
            Marcadores actualizados en vivo, clasificación, equipos y goleadores. Lo que marca el equipo de campo aparece aquí cada pocos segundos.
          </p>
          <Link
            href="/clasificaciones"
            className="mt-8 inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-bold text-violet-900 shadow-lg hover:bg-violet-50 transition-colors"
          >
            Ver clasificación
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50">
          <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Resultados en directo</h2>
              <p className="text-sm text-slate-500">
                Actualización automática. Los mismos marcadores que en <Link className="text-violet-700 underline" href="/resultados">Resultados</Link>.
              </p>
            </div>
            <span className="text-xs font-medium text-slate-400">Últimos datos cada ~8 s</span>
          </div>

          {loading ? <p className="text-slate-500">Cargando partidos…</p> : null}
          {err ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p> : null}

          {!loading && enDirecto.length === 0 && resto.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-600">Todavía no hay partidos en el sistema.</p>
          ) : null}

          {enDirecto.length > 0 ? (
            <div className="mb-8">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Ahora mismo
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {enDirecto.map((p) => (
                  <Link
                    key={p.id}
                    href={`/resultados/${p.id}`}
                    className="group relative overflow-hidden rounded-2xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-md transition hover:border-emerald-500 hover:shadow-lg"
                  >
                    {estadoBadge(p.estado)}
                    <p className="mt-3 text-center text-lg font-bold text-slate-900 sm:text-xl">
                      <span className="text-slate-700">{nombre(nombres, p.equipo_local_id)}</span>
                      <span className="mx-3 font-black text-emerald-700">
                        {p.goles_local ?? 0}
                        <span className="mx-2 text-slate-300"> · </span>
                        {p.goles_visitante ?? 0}
                      </span>
                      <span className="text-slate-700">{nombre(nombres, p.equipo_visitante_id)}</span>
                    </p>
                    <p className="mt-2 text-center text-xs text-slate-500">
                      {p.fase ?? ""}
                      {p.fecha_hora ? ` · ${new Date(p.fecha_hora).toLocaleString("es-ES")}` : ""}
                    </p>
                    <span className="mt-3 block text-center text-xs font-semibold text-emerald-700 group-hover:underline">Ir al detalle</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {resto.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">Otros partidos</h3>
              <div className="grid gap-3">
                {resto.map((p) => (
                  <Link
                    key={p.id}
                    href={`/resultados/${p.id}`}
                    className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 transition hover:border-violet-300 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-slate-900">
                        {nombre(nombres, p.equipo_local_id)} {p.goles_local ?? 0} — {p.goles_visitante ?? 0}{" "}
                        {nombre(nombres, p.equipo_visitante_id)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {estadoBadge(p.estado)}
                      <span className="text-xs text-slate-500">
                        {p.fecha_hora ? new Date(p.fecha_hora).toLocaleString("es-ES") : "Sin fecha"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-bold text-slate-800">Accesos rápidos</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/clasificaciones"
              className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-600 to-indigo-700 p-5 text-white shadow-lg transition hover:scale-[1.02] hover:shadow-xl"
            >
              <p className="text-sm font-semibold text-violet-100">Clasificación</p>
              <p className="mt-1 text-lg font-bold">Grupos y cuadros</p>
            </Link>
            <Link
              href="/resultados"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md transition hover:border-violet-300 hover:shadow-lg"
            >
              <p className="text-sm font-semibold text-slate-500">Todos los</p>
              <p className="mt-1 text-lg font-bold text-slate-900">Resultados</p>
            </Link>
            <Link
              href="/equipos"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md transition hover:border-violet-300 hover:shadow-lg"
            >
              <p className="text-sm font-semibold text-slate-500">Listado</p>
              <p className="mt-1 text-lg font-bold text-slate-900">Equipos</p>
            </Link>
            <Link
              href="/goleadores"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md transition hover:border-violet-300 hover:shadow-lg"
            >
              <p className="text-sm font-semibold text-slate-500">Ranking</p>
              <p className="mt-1 text-lg font-bold text-slate-900">Goleadores</p>
            </Link>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6">
          <Link
            href="/login"
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Login organización
          </Link>
          <Link href="/admin" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Panel admin
          </Link>
        </section>
      </div>
    </main>
  );
}
