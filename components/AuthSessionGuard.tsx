"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SKIP_PATHS = ["/reset-password", "/auth/callback", "/login", "/join"];

function mustSetPassword(meta: Record<string, unknown> | undefined): boolean {
  return meta?.must_set_password === true || meta?.must_set_password === "true";
}

function isStaleRefreshTokenError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("refresh token") || m.includes("invalid refresh");
}

async function clearStaleAuthSession() {
  const supabase = getSupabaseBrowserClient();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }
}

function pathIsSkipped(pathname: string): boolean {
  return SKIP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Tras invitacion/recuperacion: fuerza pantalla de contraseña antes de usar la app.
 * Tambien captura enlaces que caen en / con #access_token&type=invite.
 * En paginas publicas (/join) no toca la sesion para evitar errores de refresh token.
 */
export function AuthSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathIsSkipped(pathname)) return;

    const supabase = getSupabaseBrowserClient();

    async function handleHashOrCode() {
      if (typeof window === "undefined") return;

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      if (code && !pathname.startsWith("/auth/callback")) {
        const next = encodeURIComponent("/reset-password");
        window.location.replace(`/auth/callback?code=${encodeURIComponent(code)}&next=${next}`);
        return;
      }

      const hashRaw = window.location.hash.replace(/^#/, "");
      if (!hashRaw) return;

      const hash = new URLSearchParams(hashRaw);
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const type = hash.get("type");

      if (!accessToken || !refreshToken) return;

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      window.history.replaceState({}, "", pathname || "/");

      if (error) {
        if (isStaleRefreshTokenError(error.message)) void clearStaleAuthSession();
        return;
      }

      if (type === "invite" || type === "recovery" || type === "signup") {
        router.replace("/reset-password");
      }
    }

    void handleHashOrCode();
  }, [pathname, router]);

  useEffect(() => {
    if (pathIsSkipped(pathname)) return;

    const supabase = getSupabaseBrowserClient();

    async function enforcePasswordIfNeeded() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error && isStaleRefreshTokenError(error.message)) {
        await clearStaleAuthSession();
        return;
      }

      if (!user) return;

      if (mustSetPassword(user.user_metadata as Record<string, unknown>)) {
        router.replace("/reset-password");
      }
    }

    void enforcePasswordIfNeeded();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const meta = session.user.user_metadata as Record<string, unknown>;
        if (mustSetPassword(meta) && !pathIsSkipped(pathname)) {
          router.replace("/reset-password");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
