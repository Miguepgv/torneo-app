import type { NextRequest } from "next/server";

/** IP del cliente (proxy / Vercel suelen enviar x-forwarded-for). */
export function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  return null;
}

export function getUserAgent(request: NextRequest): string | null {
  const ua = request.headers.get("user-agent");
  return ua?.trim() ? ua.trim().slice(0, 2000) : null;
}
