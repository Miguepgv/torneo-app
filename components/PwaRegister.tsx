"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1";
    const isProd = process.env.NODE_ENV === "production";

    // En local/dev desactivamos SW para evitar hydration mismatch con caché vieja.
    if (!isProd || isLocalhost) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          void r.unregister();
        });
      });
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // Si falla el registro, la web sigue funcionando normal.
      }
    };

    void register();
  }, []);

  return null;
}
