"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function bootstrapRecoverySession() {
      const linkError = searchParams.get("error");
      if (linkError === "enlace_invalido") {
        setMessage(
          "El enlace ha caducado o ya se uso. Pide al administrador que reenvie la invitacion, o usa «Olvide mi contrasena» en el login.",
        );
        setReady(true);
        return;
      }

      try {
        const urlCode = searchParams.get("code");
        if (urlCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(urlCode);
          if (error) {
            setMessage(
              "No se pudo validar el enlace del correo. Pide una invitacion nueva o usa «Olvide mi contrasena» en el login.",
            );
            setReady(true);
            return;
          }
          window.history.replaceState({}, "", "/reset-password");
        } else {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) {
              setMessage("El enlace de recuperacion no es valido o ha caducado. Pide uno nuevo.");
              setReady(true);
              return;
            }
            window.history.replaceState({}, "", "/reset-password");
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        setHasSession(Boolean(session));
        if (!session) {
          setMessage(
            "Abre esta pantalla desde el enlace del correo (invitacion o recuperacion). Si ya lo hiciste, pide un enlace nuevo en el login.",
          );
        }
      } finally {
        setReady(true);
      }
    }
    void bootstrapRecoverySession();
  }, [supabase, searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!hasSession) {
      setMessage("Primero debes entrar desde el enlace del correo. Sin sesion no se puede guardar la contrasena.");
      return;
    }

    if (password.length < 6) {
      setMessage("La contrasena debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setMessage("Las contrasenas no coinciden.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_set_password: false },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      const samePassword =
        msg.includes("same") ||
        msg.includes("should be different") ||
        msg.includes("different from the old password") ||
        msg.includes("new password should be different");
      if (samePassword) {
        setMessage("Esa es tu contrasena actual. Escribe una distinta para continuar.");
      } else if (msg.includes("session") || msg.includes("jwt")) {
        setMessage(
          "Sesion no valida. Vuelve a abrir el enlace del correo o pide al administrador que reenvie la invitacion.",
        );
      } else {
        setMessage(`Error actualizando contrasena: ${error.message}`);
      }
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setMessage("Contrasena guardada. Inicia sesion con tu correo y la contrasena que acabas de crear.");
    setLoading(false);
    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 800);
  }

  return (
    <>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-300 p-3 text-slate-900"
            type={showPassword ? "text" : "password"}
            placeholder="Contrasena"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={!hasSession}
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
          disabled={!hasSession}
        />
        <button
          className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
          type="submit"
          disabled={loading || !ready || !hasSession}
        >
          {loading ? "Guardando..." : !ready ? "Preparando enlace..." : "Guardar contrasena"}
        </button>
      </form>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-violet-800">Crea tu contrasena</h1>
        <p className="text-sm text-slate-600">
          El primer paso es elegir una contrasena y pulsar Guardar. Luego podras iniciar sesion en la app con tu
          correo y esa contrasena.
        </p>
        <Suspense fallback={<p className="text-sm text-slate-600">Preparando enlace...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <a className="text-sm font-medium text-violet-700 underline" href="/login">
          Volver al login
        </a>
      </div>
    </main>
  );
}
