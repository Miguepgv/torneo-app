import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildConsentPdfBuffer, type JugadorConsentPdfRow } from "@/lib/server/build-consent-pdf";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: jugadorId } = await context.params;
  if (!jugadorId) {
    return NextResponse.json({ error: "Falta id de jugador." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Faltan variables de entorno." }, { status: 500 });
  }

  if (!token) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
  }

  const { data: me, error: roleError } = await userClient
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single();
  if (roleError || me?.rol !== "admin") {
    return NextResponse.json({ error: "Solo administradores pueden descargar este PDF." }, { status: 403 });
  }

  const admin = createClient(url, serviceRoleKey);
  const { data: row, error: qErr } = await admin
    .from("jugadores")
    .select(
      "id,nombre,apellidos,alias,fecha_nacimiento,es_menor,consentimiento_firma,consentimiento_aceptado_at,consentimiento_ip,consentimiento_user_agent,consentimiento_legal_version,consentimiento_legal_texto,tutor_email,tutor_telefono,tutor_correo_enviado_at,equipos(nombre)",
    )
    .eq("id", jugadorId)
    .maybeSingle();

  if (qErr || !row) {
    return NextResponse.json({ error: "Jugador no encontrado." }, { status: 404 });
  }

  const pdf = buildConsentPdfBuffer(row as unknown as JugadorConsentPdfRow);
  const r = row as { nombre?: string; apellidos?: string };
  const safeName = `${r.nombre ?? "jugador"}-${r.apellidos ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="inscripcion-${safeName}-${jugadorId.slice(0, 8)}.pdf"`,
    },
  });
}
