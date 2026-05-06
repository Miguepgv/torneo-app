import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ exists: false });
  }

  const adminClient = createClient(url, serviceRoleKey);
  const { data, error } = await adminClient
    .from("usuarios")
    .select("id")
    .eq("correo", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ exists: Boolean(data?.id) });
}
