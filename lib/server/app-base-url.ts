import type { NextRequest } from "next/server";

/** URL publica de la app para redirects de Auth (invitacion, reset password). */
export function appBaseUrl(request: NextRequest): string {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) return origin;
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  if (origin) return origin;
  return "http://localhost:3000";
}
