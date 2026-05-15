import type { NextRequest } from "next/server";
import { setPasswordAuthCallbackUrlFromOrigin } from "@/lib/auth-redirect-url";
import { appBaseUrl } from "@/lib/server/app-base-url";

export { setPasswordAuthCallbackUrlFromOrigin } from "@/lib/auth-redirect-url";

/** URL a la que Supabase redirige tras invitacion / recuperacion. */
export function setPasswordAuthCallbackUrl(request: NextRequest): string {
  return setPasswordAuthCallbackUrlFromOrigin(appBaseUrl(request));
}
