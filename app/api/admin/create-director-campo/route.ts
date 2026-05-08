import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findAuthUserIdByEmail } from "@/lib/server/resolve-delegado";

type Body = {
  email?: string;
  nombre?: string;
  apellidos?: string;
  telefono?: string;
};

function appBaseUrl(request: NextRequest) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) return origin;
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  if (origin) return origin;
  return "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Faltan variables de entorno de Supabase." }, { status: 500 });
  }
  if (!token) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });

  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin") {
    return NextResponse.json({ error: "Solo admin puede crear directores de campo." }, { status: 403 });
  }

  const body = (await request.json()) as Body;
  const email = (body.email ?? "").trim().toLowerCase();
  const nombre = (body.nombre ?? "").trim();
  const apellidos = (body.apellidos ?? "").trim();
  const telefono = (body.telefono ?? "").trim();
  if (!email || !nombre) {
    return NextResponse.json({ error: "Correo y nombre son obligatorios." }, { status: 400 });
  }

  const adminClient = createClient(url, serviceRoleKey);
  const redirectTo = `${appBaseUrl(request)}/reset-password`;
  const fullName = `${nombre} ${apellidos}`.trim() || nombre;
  const perfilPayload = {
    correo: email,
    telefono: telefono || null,
    rol: "director_campo",
    nombre: fullName,
  };

  let userId: string | null = null;
  let invited = false;
  let accessEmailSent = false;
  let emailError: string | null = null;

  const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      nombre,
      apellidos,
      nombre_completo: fullName,
      rol_app: "director_campo",
    },
  });

  if (!invite.error && invite.data?.user?.id) {
    userId = invite.data.user.id;
    invited = true;
    accessEmailSent = true;
  } else {
    const authId = await findAuthUserIdByEmail(adminClient.auth.admin, email);
    if (!authId) {
      return NextResponse.json(
        { error: invite.error?.message ?? "No se pudo crear/invitar al director de campo." },
        { status: 400 },
      );
    }
    userId = authId;
    const anon = createClient(url, anonKey);
    const reset = await anon.auth.resetPasswordForEmail(email, { redirectTo });
    accessEmailSent = !reset.error;
    emailError = reset.error?.message ?? null;
  }

  const up = await adminClient
    .from("usuarios")
    .upsert({ id: userId, ...perfilPayload }, { onConflict: "id" });
  if (up.error) {
    return NextResponse.json({ error: `Usuario creado pero perfil no guardado: ${up.error.message}` }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    invited_new_user: invited,
    access_email_sent: accessEmailSent,
    email_error: emailError,
    redirect_usado: redirectTo,
  });
}
