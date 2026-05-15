import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setPasswordAuthCallbackUrl } from "@/lib/server/auth-redirect";
import { findAuthUserIdByEmail } from "@/lib/server/resolve-delegado";

type InviteBody = {
  email?: string;
  nombre?: string;
  apellidos?: string;
};

async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: "Faltan variables de entorno de Supabase." }, { status: 500 }) };
  }
  if (!token) {
    return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sesion invalida." }, { status: 401 }) };
  }

  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin") {
    return { error: NextResponse.json({ error: "Solo administradores pueden gestionar otros admins." }, { status: 403 }) };
  }

  return { url, anonKey, serviceRoleKey, userClient, user };
}

/** Lista administradores actuales. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const { serviceRoleKey, url } = gate as Exclude<typeof gate, { error: NextResponse }>;

  const admin = createClient(url!, serviceRoleKey!);
  const { data, error } = await admin
    .from("usuarios")
    .select("id,correo,nombre,apellidos,created_at")
    .eq("rol", "admin")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ administradores: data ?? [] });
}

/** Invita o promueve a superadministrador y envia correo de primer acceso / contraseña. */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate && gate.error) return gate.error;
  const { url, anonKey, serviceRoleKey } = gate as Exclude<typeof gate, { error: NextResponse }>;

  const body = (await request.json()) as InviteBody;
  const email = (body.email ?? "").trim().toLowerCase();
  const nombre = (body.nombre ?? "").trim();
  const apellidos = (body.apellidos ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Indica un correo valido." }, { status: 400 });
  }

  const adminClient = createClient(url!, serviceRoleKey!);
  const redirectTo = setPasswordAuthCallbackUrl(request);
  const fullName = `${nombre} ${apellidos}`.trim() || nombre || email.split("@")[0] || "Administrador";

  const { data: existing } = await adminClient.from("usuarios").select("id,rol").eq("correo", email).maybeSingle();

  let userId: string | null = existing?.id ?? null;
  let invitedNewUser = false;
  let accessEmailSent = false;
  let emailError: string | null = null;
  const alreadyAdmin = existing?.rol === "admin";

  if (!userId) {
    const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        nombre: nombre || fullName,
        apellidos,
        nombre_completo: fullName,
        rol_app: "admin",
      },
    });

    if (!invite.error && invite.data?.user?.id) {
      userId = invite.data.user.id;
      invitedNewUser = true;
      accessEmailSent = true;
    } else {
      const msg = invite.error?.message?.toLowerCase() ?? "";
      const already =
        msg.includes("already") || msg.includes("registered") || msg.includes("exists") || invite.error?.status === 422;
      if (!already) {
        return NextResponse.json(
          { error: invite.error?.message ?? "No se pudo enviar la invitacion." },
          { status: 400 },
        );
      }
      userId = await findAuthUserIdByEmail(adminClient.auth.admin, email);
      if (!userId) {
        return NextResponse.json(
          { error: invite.error?.message ?? "No se pudo crear el usuario en Auth." },
          { status: 400 },
        );
      }
    }
  }

  if (!invitedNewUser) {
    const anon = createClient(url!, anonKey!);
    const reset = await anon.auth.resetPasswordForEmail(email, { redirectTo });
    accessEmailSent = !reset.error;
    emailError = reset.error?.message ?? null;
  }

  const perfil: Record<string, unknown> = {
    id: userId,
    correo: email,
    rol: "admin",
    nombre: nombre || fullName,
  };
  if (apellidos) perfil.apellidos = apellidos;

  const up = await adminClient.from("usuarios").upsert(perfil, { onConflict: "id" });
  if (up.error) {
    const hint = up.error.message.toLowerCase();
    if (hint.includes("apellidos") || hint.includes("column")) {
      const fallback = await adminClient.from("usuarios").upsert(
        { id: userId, correo: email, rol: "admin", nombre: fullName },
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
  if (alreadyAdmin) {
    mensaje = accessEmailSent
      ? "Ya era administrador. Se ha enviado un correo para entrar o cambiar la contraseña."
      : "Ya era administrador, pero no se pudo enviar el correo automatico.";
  } else if (invitedNewUser) {
    mensaje = "Invitacion enviada. Recibira un correo para crear su contraseña y entrar por primera vez.";
  } else {
    mensaje = accessEmailSent
      ? "Usuario promovido a administrador. Se ha enviado un correo para definir contraseña y acceder."
      : "Usuario promovido a administrador, pero no se pudo enviar el correo automatico.";
  }

  return NextResponse.json({
    ok: true,
    mensaje,
    invited_new_user: invitedNewUser,
    already_admin: alreadyAdmin,
    access_email_sent: accessEmailSent,
    email_error: emailError,
    redirect_usado: redirectTo,
  });
}
