"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminHomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rol, setRol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRol(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      setRol((data?.rol as string | undefined) ?? null);
      setLoading(false);
    }
    void loadRole();
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-16 sm:p-8">
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl sm:p-8">
          <p className="text-slate-600">Cargando panel...</p>
        </div>
      </main>
    );
  }

  if (!rol || !["admin", "director_campo", "delegado"].includes(rol)) {
    return (
      <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-16 sm:p-8">
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-2xl font-bold text-violet-900">Panel Admin</h1>
          <p className="mt-2 text-sm text-slate-700">No tienes permisos para esta sección.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-16 sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold text-violet-900">Panel Admin</h1>
        <div className="grid gap-3 sm:grid-cols-4">
          {rol === "admin" || rol === "delegado" ? (
            <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/equipos">
              Equipos
            </a>
          ) : null}
          {rol === "admin" ? (
            <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/configuracion">
              Configuracion torneo
            </a>
          ) : null}
          {rol === "admin" ? (
            <a
              className="rounded-lg border-2 border-violet-600 bg-white px-4 py-3 text-center font-semibold text-violet-800"
              href="/admin/administradores"
            >
              Administradores
            </a>
          ) : null}
          {rol === "admin" ? (
            <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/calendario">
              Calendario
            </a>
          ) : null}
          {rol === "admin" || rol === "director_campo" ? (
            <a className="rounded-lg bg-violet-600 px-4 py-3 text-center font-semibold text-white" href="/admin/directo">
              Directo
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}
