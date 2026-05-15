/** URL de callback tras invitacion / recuperacion (PKCE). Seguro en cliente y servidor. */
export function setPasswordAuthCallbackUrlFromOrigin(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
}
