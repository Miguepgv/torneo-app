import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/reset-password";
  if (raw.includes("://")) return "/reset-password";
  return raw;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_missing_code`);
  }

  try {
    const supabase = await createSupabaseRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[torneo] auth/callback exchangeCodeForSession:", error.message);
      return NextResponse.redirect(
        `${origin}/reset-password?error=${encodeURIComponent("enlace_invalido")}`,
      );
    }
    return NextResponse.redirect(`${origin}${next}`);
  } catch (e) {
    console.error("[torneo] auth/callback:", e);
    return NextResponse.redirect(`${origin}/login?error=auth_config`);
  }
}
