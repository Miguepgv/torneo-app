import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findAuthUserIdByEmail } from "@/lib/server/resolve-delegado";

type Body = {
  email?: string;
  password?: string;
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
  const password = body.password ?? "";
  const nombre = (body.nombre ?? "").trim();
  const apellidos = (body.apellidos ?? "").trim();
  const telefono = (body.telefono ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Indica un correo valido." }, { status: 400 });
  }
  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contrasena debe tener al menos 6 caracteres." }, { status: 400 });
  }

  const adminClient = createClient(url, serviceRoleKey);
  const fullName = `${nombre} ${apellidos}`.trim() || nombre;
  const authMeta = {
    nombre,
    apellidos,
    nombre_completo: fullName,
    rol_app: "director_campo",
    must_set_password: false,
  };

  const { data: existing } = await adminClient
    .from("usuarios")
    .select("id,rol")
    .eq("correo", email)
    .maybeSingle();

  let userId: string | null = existing?.id ?? null;
  let createdNewUser = false;
  const alreadyDirector = existing?.rol === "director_campo";

  if (!userId) {
    const created = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: authMeta,
    });

    if (!created.error && created.data.user?.id) {
      userId = created.data.user.id;
      createdNewUser = true;
    } else {
      const msg = created.error?.message?.toLowerCase() ?? "";
      const already =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        created.error?.status === 422;
      if (!already) {
        return NextResponse.json(
          { error: created.error?.message ?? "No se pudo crear el usuario." },
          { status: 400 },
        );
      }
      userId = await findAuthUserIdByEmail(adminClient.auth.admin, email);
      if (!userId) {
        return NextResponse.json(
          { error: "El correo ya existe en Auth pero no se pudo localizar el usuario." },
          { status: 400 },
        );
      }
    }
  }

  if (!createdNewUser && userId) {
    const updated = await adminClient.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: authMeta,
    });
    if (updated.error) {
      return NextResponse.json(
        { error: updated.error.message ?? "No se pudo actualizar la contrasena del usuario." },
        { status: 400 },
      );
    }
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
    mensaje = "Director de campo actualizado. Ya puede entrar con el correo y la contrasena indicados.";
  } else if (createdNewUser) {
    mensaje = "Director de campo creado. Comunica el correo y la contrasena para que entre en Login.";
  } else {
    mensaje = "Usuario existente configurado como director de campo. Ya puede entrar con esa contrasena.";
  }

  return NextResponse.json({
    ok: true,
    mensaje,
    created_new_user: createdNewUser,
    already_director: alreadyDirector,
  });
}
