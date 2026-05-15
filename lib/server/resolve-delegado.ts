import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { INVITE_USER_METADATA, markAuthUserMustSetPassword } from "@/lib/server/auth-invite-metadata";

/** Busca usuario en Auth por email (paginado). */
export async function findAuthUserIdByEmail(
  adminAuth: {
    listUsers: (params: { page: number; perPage: number }) => Promise<{
      data?: { users?: { id?: string; email?: string }[] };
      error?: { message: string };
    }>;
  },
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await adminAuth.listUsers({ page, perPage });
    if (error) break;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit?.id) return hit.id;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

export type ResolveDelegadoResult = {
  delegadoId: string;
  /** true si Supabase envió invitación (usuario nuevo en Auth). */
  invitedNewUser: boolean;
  /** Si se disparó envío de correo (invitación o enlace para definir contraseña). */
  accessEmailSent: boolean;
  /** Error devuelto por Auth al enviar enlace (reset); null si ok o invitación nueva. */
  emailError: string | null;
};

/**
 * Envía un enlace para definir la contraseña (mismo flujo técnico que "recuperación";
 * el texto del correo se personaliza en SupabaseAuth > plantillas > "Reset password").
 */
async function sendDelegateSetPasswordEmail(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  setPasswordRedirectTo: string,
): Promise<{ ok: boolean; errorMessage: string | null }> {
  const anon = createClient(supabaseUrl, anonKey);
  const { error } = await anon.auth.resetPasswordForEmail(email, {
    redirectTo: setPasswordRedirectTo,
  });
  if (error) {
    return { ok: false, errorMessage: error.message };
  }
  return { ok: true, errorMessage: null };
}

function normalizeDelegateName(nombre: string, apellidos: string) {
  const n = nombre.trim();
  const a = apellidos.trim();
  const full = `${n} ${a}`.trim();
  return { nombre: n, apellidos: a, displayName: full || n || a };
}

async function upsertDelegadoUsuario(
  adminClient: SupabaseClient,
  row: {
    id: string;
    correo: string;
    telefono: string;
    nombre: string;
    apellidos: string | null;
    fotoUrl: string | null;
  },
): Promise<{ error: { message: string } | null }> {
  const base = {
    id: row.id,
    correo: row.correo,
    telefono: row.telefono,
    rol: "delegado" as const,
    nombre: row.nombre,
  };
  const withApp = {
    ...base,
    apellidos: row.apellidos,
    foto_url: row.fotoUrl,
  };
  const first = await adminClient.from("usuarios").upsert(withApp, { onConflict: "id" });
  if (!first.error) return { error: null };
  const hint = first.error.message.toLowerCase();
  if (!hint.includes("apellidos") && !hint.includes("column") && !hint.includes("schema")) {
    return { error: first.error };
  }
  const full = [row.nombre, row.apellidos ?? ""].join(" ").trim();
  const second = await adminClient.from("usuarios").upsert(
    {
      ...base,
      nombre: full || row.nombre,
      foto_url: row.fotoUrl,
    },
    { onConflict: "id" },
  );
  return { error: second.error };
}

/**
 * Obtiene o crea el usuario Auth y deja fila en públic.usuarios con rol delegado.
 * Invitación y enlaces de acceso redirigen a setPasswordRedirect para crear contraseña primero.
 */
export async function resolveDelegadoForTeam(
  adminClient: SupabaseClient,
  emailRaw: string,
  telefono: string,
  nombreDelegado: string,
  apellidosDelegado: string,
  fotoDelegadoUrl: string | null,
  ctx: {
    /** Tras invitar o acceder, se define primero la contraseña en esta URL. */
    setPasswordRedirect: string;
    supabaseUrl: string;
    anonKey: string;
  },
): Promise<{ ok: true; data: ResolveDelegadoResult } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Correo vacio." };
  }

  const { nombre, apellidos, displayName } = normalizeDelegateName(
    nombreDelegado,
    apellidosDelegado,
  );
  if (!nombre) {
    return { ok: false, error: "El nombre del delegado es obligatorio." };
  }
  if (!apellidos) {
    return { ok: false, error: "Los apellidos del delegado son obligatorios." };
  }

  const { data: existingRow, error: qErr } = await adminClient
    .from("usuarios")
    .select("id,rol")
    .eq("correo", email)
    .maybeSingle();

  if (qErr) {
    return { ok: false, error: `Error buscando usuario: ${qErr.message}` };
  }

  if (existingRow && (existingRow as { rol: string }).rol === "admin") {
    return { ok: false, error: "No puedes asignar como delegado a un administrador." };
  }

  if (existingRow?.id) {
    const { error: upErr } = await upsertDelegadoUsuario(adminClient, {
      id: existingRow.id,
      correo: email,
      telefono,
      nombre,
      apellidos: apellidos || null,
      fotoUrl: fotoDelegadoUrl,
    });
    if (upErr) {
      return { ok: false, error: `No se pudo actualizar usuario: ${upErr.message}` };
    }
    await markAuthUserMustSetPassword(adminClient.auth.admin, existingRow.id);
    const sent = await sendDelegateSetPasswordEmail(
      ctx.supabaseUrl,
      ctx.anonKey,
      email,
      ctx.setPasswordRedirect,
    );
    return {
      ok: true,
      data: {
        delegadoId: existingRow.id,
        invitedNewUser: false,
        accessEmailSent: sent.ok,
        emailError: sent.errorMessage,
      },
    };
  }

  const invite = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: ctx.setPasswordRedirect,
    data: {
      nombre,
      apellidos,
      nombre_completo: displayName,
      rol_app: "delegado",
      ...INVITE_USER_METADATA,
    },
  });

  if (!invite.error && invite.data?.user?.id) {
    const id = invite.data.user.id;
    const { error: insErr } = await upsertDelegadoUsuario(adminClient, {
      id,
      correo: email,
      telefono,
      nombre,
      apellidos: apellidos || null,
      fotoUrl: fotoDelegadoUrl,
    });
    if (insErr) {
      return { ok: false, error: `Usuario invitado pero no se guardo perfil: ${insErr.message}` };
    }
    return {
      ok: true,
      data: {
        delegadoId: id,
        invitedNewUser: true,
        accessEmailSent: true,
        emailError: null,
      },
    };
  }

  const msg = invite.error?.message?.toLowerCase() ?? "";
  const already =
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    invite.error?.status === 422;

  if (!already) {
    return {
      ok: false,
      error: invite.error?.message ?? "No se pudo invitar al delegado.",
    };
  }

  const authId = await findAuthUserIdByEmail(adminClient.auth.admin, email);
  if (!authId) {
    return {
      ok: false,
      error:
        "El correo parece estar en uso en Auth pero no se pudo localizar. Revisa en Supabase Authentication > Users o usa otro correo.",
    };
  }

  const { error: upErr2 } = await upsertDelegadoUsuario(adminClient, {
    id: authId,
    correo: email,
    telefono,
    nombre,
    apellidos: apellidos || null,
    fotoUrl: fotoDelegadoUrl,
  });
  if (upErr2) {
    return { ok: false, error: `No se pudo guardar perfil del delegado: ${upErr2.message}` };
  }

  await markAuthUserMustSetPassword(adminClient.auth.admin, authId);
  const sent = await sendDelegateSetPasswordEmail(
    ctx.supabaseUrl,
    ctx.anonKey,
    email,
    ctx.setPasswordRedirect,
  );
  return {
    ok: true,
    data: {
      delegadoId: authId,
      invitedNewUser: false,
      accessEmailSent: sent.ok,
      emailError: sent.errorMessage,
    },
  };
}
