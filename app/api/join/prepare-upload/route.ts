import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildJoinStoragePaths,
  makeJoinSafeName,
  type JoinUploadSlotKey,
} from "@/lib/server/join-storage-paths";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

export async function POST(request: NextRequest) {
  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Faltan variables de Supabase en el servidor (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  let body: {
    codigo?: string;
    esMenor?: boolean;
    incluirFotoPerfil?: boolean;
    nombre?: string;
    apellidos?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Peticion invalida." }, { status: 400 });
  }

  const codigo = String(body.codigo ?? "")
    .trim()
    .toUpperCase();
  const esMenor = body.esMenor === true;
  const incluirFotoPerfil = body.incluirFotoPerfil === true;

  if (!codigo) {
    return NextResponse.json({ error: "Codigo de equipo obligatorio." }, { status: 400 });
  }

  const { data: cfg } = await adminClient
    .from("configuracion_torneo")
    .select("limite_cambios_hasta")
    .limit(1)
    .maybeSingle();
  const limite = (cfg as { limite_cambios_hasta?: string | null } | null)?.limite_cambios_hasta;
  if (limite && new Date(limite).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "El plazo para modificar/inscribir jugadores ya ha finalizado." },
      { status: 400 },
    );
  }

  const { data: equipo, error: equipoError } = await adminClient
    .from("equipos")
    .select("id,codigo_inscripcion")
    .eq("codigo_inscripcion", codigo)
    .single();

  if (equipoError || !equipo) {
    return NextResponse.json({ error: "Codigo de equipo no valido." }, { status: 400 });
  }

  const safeName = makeJoinSafeName(
    `${String(body.nombre ?? "").trim()} ${String(body.apellidos ?? "").trim()}`.trim(),
  );
  const { basePath, fotoPath, slots } = buildJoinStoragePaths({
    equipoId: equipo.id,
    safeName,
    esMenor,
    incluirFotoPerfil,
  });

  const uploads: {
    key: JoinUploadSlotKey;
    bucket: string;
    path: string;
    signedUrl: string;
    token: string;
  }[] = [];

  for (const slot of slots) {
    const signed = await adminClient.storage.from(slot.bucket).createSignedUploadUrl(slot.path);
    if (signed.error || !signed.data) {
      return NextResponse.json(
        {
          error: `No se pudo preparar la subida (${slot.key}): ${signed.error?.message ?? "desconocido"}`,
        },
        { status: 500 },
      );
    }
    uploads.push({
      key: slot.key,
      bucket: slot.bucket,
      path: slot.path,
      signedUrl: signed.data.signedUrl,
      token: signed.data.token,
    });
  }

  return NextResponse.json({
    ok: true,
    equipoId: equipo.id,
    basePath,
    fotoPath,
    uploads,
  });
}
