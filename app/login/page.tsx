"use client";

import { FormEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    const checkResponse = await fetch("/api/auth/organization-email-exists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail }),
    });

    const checkResult = (await checkResponse.json()) as {
      exists?: boolean;
      error?: string;
    };

    if (!checkResponse.ok) {
      setMessage(`Error validando correo: ${checkResult.error ?? "desconocido"}`);
      setLoading(false);
      return;
    }

    if (!checkResult.exists) {
      setMessage("Ese correo no pertenece a nadie de la organizacion.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });
    if (error) {
      const isInvalidCredentials =
        error.message.toLowerCase().includes("invalid login credentials") ||
        error.message.toLowerCase().includes("invalid_credentials");
      if (isInvalidCredentials) {
        setMessage("Contrasena incorrecta.");
      } else {
        setMessage(`Error login: ${error.message}`);
      }
      setLoading(false);
      return;
    }

    const { data: me } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single();

    setMessage(`Login correcto. Rol: ${me?.rol ?? "sin rol"}`);
    setLoading(false);
  }

  async function onLogout() {
    await supabase.auth.signOut();
    setMessage("Sesion cerrada.");
  }

  async function onForgotPassword() {
    setMessage("");
    if (!email.trim()) {
      setMessage("Escribe tu correo y pulsa de nuevo.");
      return;
    }

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) {
      setMessage(`Error enviando correo: ${error.message}`);
      return;
    }
    setMessage("Te hemos enviado un correo para restablecer la contraseña.");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-violet-800">Login organizacion</h1>

        <form className="flex flex-col gap-3" onSubmit={onLogin}>
          <input
            className="rounded-lg border border-slate-300 p-3"
            placeholder="Correo"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 p-3"
              placeholder="Contrasena"
              type={showPassword ? "text" : "password"}
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
          <button
            className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <button
            className="rounded-lg border border-violet-300 px-4 py-2 font-semibold text-violet-700"
            onClick={() => void onForgotPassword()}
            type="button"
            disabled={loading}
          >
            Olvide mi contrasena
          </button>
        </form>

        <button
          className="rounded-lg border border-violet-300 px-4 py-2 font-semibold text-violet-700"
          onClick={onLogout}
          type="button"
        >
          Cerrar sesion
        </button>

        {message ? <p className="text-sm text-slate-700">{message}</p> : null}

        <a className="text-sm font-medium text-violet-700 underline" href="/">
          Volver al inicio
        </a>
      </div>
    </main>
  );
}
