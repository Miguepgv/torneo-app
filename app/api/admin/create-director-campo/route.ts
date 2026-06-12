import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { INVITE_USER_METADATA, markAuthUserMustSetPassword } from "@/lib/server/auth-invite-metadata";
import { setPasswordAuthCallbackUrl } from "@/lib/server/auth-redirect";
import { findAuthUserIdByEmail } from "@/lib/server/resolve-delegado";

type Body = {
  email?: string;
  nombre?: string;
  apellidos?: string;
  telefono?: string;
};

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
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Indica un correo valido." }, { status: 400 });
  }
  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }

  const adminClient = createClient(url, serviceRoleKey);
  const redirectTo = setPasswordAuthCallbackUrl(request);
  const fullName = `${nombre} ${apellidos}`.trim() || nombre;

  const { data: existing } = await adminClient
    .from("usuarios")
    .select("id,rol")
    .eq("correo", email)
    .maybeSingle();

  let userId: string | null = existing?.id ?? null;
  let invitedNewUser = false;
  let accessEmailSent = false;
  let emailError: string | null = null;
  const alreadyDirector = existing?.rol === "director_campo";

  if (!userId) {
    const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        nombre,
        apellidos,
        nombre_completo: fullName,
        rol_app: "director_campo",
        ...INVITE_USER_METADATA,
      },
    });

    if (!invite.error && invite.data?.user?.id) {
      userId = invite.data.user.id;
      invitedNewUser = true;
      accessEmailSent = true;
    } else {
      const msg = invite.error?.message?.toLowerCase() ?? "";
      const already =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        invite.error?.status === 422;
      if (!already) {
        return NextResponse.json(
          { error: invite.error?.message ?? "No se pudo enviar la invitacion." },
          { status: 400 },
        );
      }
      userId = await findAuthUserIdByEmail(adminClient.auth.admin, email);
      if (!userId) {
        return NextResponse.json(
          {
            error:
              "El correo parece estar en uso en Auth pero no se pudo localizar. Revisa Supabase > Authentication > Users.",
          },
          { status: 400 },
        );
      }
    }
  }

  if (!invitedNewUser) {
    const anon = createClient(url, anonKey);
    const reset = await anon.auth.resetPasswordForEmail(email, { redirectTo });
    accessEmailSent = !reset.error;
    emailError = reset.error?.message ?? null;
    if (userId) await markAuthUserMustSetPassword(adminClient.auth.admin, userId);
  }

  const perfil: Record<string, unknown> = {
    id: userId,
    correo: email,
    telefono: telefono || null,
    rol: "director_campo",
    nombre: fullName,
  };
  if (apellidos) perfil.apellidos = apellidos;

  const up = await adminClient.from("usuarios").upsert(perfil, { onConflict: "id" });
  if (up.error) {
    const hint = up.error.message.toLowerCase();
    if (hint.includes("apellidos") || hint.includes("column")) {
      const fallback = await adminClient.from("usuarios").upsert(
        { id: userId, correo: email, telefono: telefono || null, rol: "director_campo", nombre: fullName },
        { onConflict: "id" },
      );
      if (fallback.error) {
        return NextResponse.json({ error: `Perfil no guardado: ${fallback.error.message}` }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: `Perfil no guardado: ${up.error.message}` }, { status: 400 });
    }
  }

  let mensaje: string;
  if (alreadyDirector) {
    mensaje = accessEmailSent
      ? "Ya era director de campo. Se ha reenviado un correo para crear o cambiar la contraseña."
      : "Ya era director de campo, pero no se pudo enviar el correo automatico.";
  } else if (invitedNewUser) {
    mensaje = "Invitacion enviada. Recibira un correo para crear su contraseña y entrar por primera vez.";
  } else {
    mensaje = accessEmailSent
      ? "Director de campo registrado. Se ha enviado un correo para definir contraseña y acceder."
      : "Director registrado, pero no se pudo enviar el correo automatico.";
  }

  return NextResponse.json({
    ok: true,
    mensaje,
    invited_new_user: invitedNewUser,
    already_director: alreadyDirector,
    access_email_sent: accessEmailSent,
    email_error: emailError,
    redirect_usado: redirectTo,
  });
}
