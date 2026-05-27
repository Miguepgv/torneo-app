import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type AdminGate =
  | { ok: true; url: string; serviceRoleKey: string; userId: string }
  | { ok: false; response: NextResponse };

export async function requireAdmin(request: NextRequest): Promise<AdminGate> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anonKey || !serviceRoleKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Faltan variables de entorno." }, { status: 500 }),
    };
  }
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Sesion invalida." }, { status: 401 }) };
  }

  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Solo administradores." }, { status: 403 }),
    };
  }

  return { ok: true, url, serviceRoleKey, userId: user.id };
}
