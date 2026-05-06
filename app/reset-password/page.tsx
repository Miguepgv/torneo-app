"use client";

import { FormEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessage("La contrasena debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setMessage("Las contrasenas no coinciden.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(`Error actualizando contrasena: ${error.message}`);
      setLoading(false);
      return;
    }

    setMessage("Contrasena actualizada. Ya puedes iniciar sesion.");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-violet-800">Restablecer contrasena</h1>
        <p className="text-sm text-slate-600">
          Define tu nueva contrasena para acceder a la app.
        </p>

        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <input
            className="rounded-lg border border-slate-300 p-3 text-slate-900"
            type="password"
            placeholder="Nueva contrasena"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-300 p-3 text-slate-900"
            type="password"
            placeholder="Repite nueva contrasena"
            value={password2}
            onChange={(event) => setPassword2(event.target.value)}
            required
          />
          <button
            className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Guardando..." : "Guardar nueva contrasena"}
          </button>
        </form>

        {message ? <p className="text-sm text-slate-700">{message}</p> : null}

        <a className="text-sm font-medium text-violet-700 underline" href="/login">
          Volver al login
        </a>
      </div>
    </main>
  );
}
