"use client";

import { createBrowserClient } from "@supabase/ssr";

function requirePublicSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    throw new Error(
      [
        "Faltan variables de Supabase para el cliente del navegador.",
        "En la raiz del proyecto crea un archivo .env.local (puedes copiar .env.example) y define:",
        "  NEXT_PUBLIC_SUPABASE_URL",
        "  NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "Las obtienes en: Supabase → Project Settings → API.",
        "Despues de guardar .env.local, deten el servidor (Ctrl+C) y vuelve a ejecutar: npm run dev",
      ].join(" "),
    );
  }
  return { url, anonKey };
}

export function getSupabaseBrowserClient() {
  const { url, anonKey } = requirePublicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
