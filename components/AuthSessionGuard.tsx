"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SKIP_PATHS = ["/reset-password", "/auth/callback", "/login"];

function mustSetPassword(meta: Record<string, unknown> | undefined): boolean {
  return meta?.must_set_password === true || meta?.must_set_password === "true";
}

/**
 * Tras invitacion/recuperacion: fuerza pantalla de contraseña antes de usar la app.
 * Tambien captura enlaces que caen en / con #access_token&type=invite.
 */
export function AuthSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
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

      if (error) return;

      if (type === "invite" || type === "recovery" || type === "signup") {
        router.replace("/reset-password");
      }
    }

    void handleHashOrCode();
  }, [pathname, router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function enforcePasswordIfNeeded() {
      if (SKIP_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        if (mustSetPassword(meta) && !SKIP_PATHS.includes(pathname)) {
          router.replace("/reset-password");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
