"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const msg = error.message.toLowerCase();
      const samePassword =
        msg.includes("same") ||
        msg.includes("should be different") ||
        msg.includes("different from the old password") ||
        msg.includes("new password should be different");
      if (samePassword) {
        setMessage(
          "Esa es tu contrasena actual. Escribe una distinta para continuar.",
        );
      } else {
        setMessage(`Error actualizando contrasena: ${error.message}`);
      }
      setLoading(false);
      return;
    }

    setMessage("Contrasena guardada. Ya puedes iniciar sesion.");
    setLoading(false);
    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 800);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-violet-800">Crea tu contrasena</h1>
        <p className="text-sm text-slate-600">
          El primer paso es elegir una contrasena y pulsar Guardar. Luego podras iniciar sesion en
          la app con tu correo y esa contrasena.
        </p>
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 p-3 text-slate-900"
              type={showPassword ? "text" : "password"}
              placeholder="Contrasena"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              onClick={() => setShowPassword((v) => !v)}
              type="button"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <input
            className="rounded-lg border border-slate-300 p-3 text-slate-900"
            type={showPassword ? "text" : "password"}
            placeholder="Repite la contrasena"
            value={password2}
            onChange={(event) => setPassword2(event.target.value)}
            required
          />
          <button
            className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Guardando..." : "Guardar contrasena"}
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
