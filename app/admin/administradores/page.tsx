"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AdminRow = {
  id: string;
  correo: string | null;
  nombre: string | null;
  apellidos: string | null;
  created_at: string | null;
};

export default function AdminAdministradoresPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rol, setRol] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [lista, setLista] = useState<AdminRow[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [message, setMessage] = useState("");

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, [supabase]);

  const cargarLista = useCallback(async () => {
    setLoadingLista(true);
    const token = await getToken();
    if (!token) {
      setLista([]);
      setLoadingLista(false);
      return;
    }
    const res = await fetch("/api/admin/administradores", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { error?: string; administradores?: AdminRow[] };
    if (res.ok) setLista(json.administradores ?? []);
    setLoadingLista(false);
  }, [getToken]);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRol(null);
        setCheckingRole(false);
        return;
      }
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      setRol((data?.rol as string) ?? null);
      setCheckingRole(false);
    }
    void init();
  }, [supabase]);

  useEffect(() => {
    if (rol === "admin") void cargarLista();
  }, [rol, cargarLista]);

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const correo = email.trim().toLowerCase();
    if (!correo) {
      setMessage("Indica el correo del nuevo administrador.");
      return;
    }
    setEnviando(true);
    const token = await getToken();
    if (!token) {
      setMessage("Sesion caducada. Vuelve a iniciar sesion.");
      setEnviando(false);
      return;
    }
    const res = await fetch("/api/admin/administradores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: correo,
        nombre: nombre.trim(),
        apellidos: apellidos.trim(),
      }),
    });
    const json = (await res.json()) as {
      error?: string;
      mensaje?: string;
      email_error?: string | null;
      redirect_usado?: string;
    };
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo enviar la invitacion.");
      setEnviando(false);
      return;
    }
    let texto = json.mensaje ?? "Invitacion enviada.";
    if (json.email_error) texto += ` Detalle correo: ${json.email_error}`;
    if (json.redirect_usado) {
      texto += ` (El enlace del correo debe poder usar esta URL en Supabase Auth > URL Configuration: ${json.redirect_usado})`;
    }
    setMessage(texto);
    setEmail("");
    setNombre("");
    setApellidos("");
    setEnviando(false);
    await cargarLista();
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-16 sm:p-8">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl">
          <p className="text-slate-600">Cargando...</p>
        </div>
      </main>
    );
  }

  if (rol !== "admin") {
    return (
      <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-16 sm:p-8">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl">
          <h1 className="text-2xl font-bold text-violet-900">Administradores</h1>
          <p className="mt-2 text-sm text-slate-700">Solo los superadministradores pueden invitar a otros.</p>
          <a className="mt-4 inline-block text-sm font-semibold text-violet-700 underline" href="/admin">
            Volver al panel
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex-1 bg-gradient-to-b from-slate-100 to-violet-50/30 p-4 pb-16 sm:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-violet-900">Superadministradores</h1>
          <a className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700" href="/admin">
            Volver al panel
          </a>
        </div>

        <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
          <h2 className="text-lg font-bold text-violet-900">Invitar administrador</h2>
          <p className="mt-1 text-sm text-slate-700">
            Escribe su correo y pulsa enviar. Recibira un email de Supabase (como el login) para crear contraseña y
            entrar por primera vez con permisos de administrador.
          </p>
          <form className="mt-4 grid gap-3" onSubmit={onInvite}>
            <input
              className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Correo del nuevo administrador *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
                placeholder="Nombre (opcional)"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
                placeholder="Apellidos (opcional)"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            >
              {enviando ? "Enviando invitacion..." : "Enviar invitacion"}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h2 className="text-lg font-bold text-slate-900">Administradores actuales</h2>
          {loadingLista ? (
            <p className="mt-2 text-sm text-slate-600">Cargando lista...</p>
          ) : lista.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No hay administradores registrados.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200">
              {lista.map((a) => (
                <li key={a.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {[a.nombre, a.apellidos].filter(Boolean).join(" ").trim() || "Sin nombre"}
                    </p>
                    <p className="text-sm text-slate-600">{a.correo ?? "—"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {message ? <p className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm text-slate-900">{message}</p> : null}
      </div>
    </main>
  );
}
