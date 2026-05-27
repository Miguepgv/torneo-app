import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcEdadAniosCumplidos } from "@/lib/edad-inscripcion";
import { getInscriptionLegalBundle } from "@/lib/inscripcion-legal";
import { getClientIp, getUserAgent } from "@/lib/server/request-meta";
import { sendTutorInscriptionEmail } from "@/lib/server/send-tutor-inscription-email";
import type { JoinUploadSlotKey } from "@/lib/server/join-storage-paths";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizeTutorDni(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

async function assertStorageObjectExists(
  client: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
) {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const list = await client.storage.from(bucket).list(folder, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (list.error) throw new Error(list.error.message);
  const found = (list.data ?? []).some((item) => item.name === name);
  if (!found) throw new Error(`Falta el archivo subido: ${path}`);
}

type StoragePathsPayload = Partial<Record<JoinUploadSlotKey, string>>;

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    const falta: string[] = [];
    if (!url) falta.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!serviceRoleKey) falta.push("SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      {
        error: `Faltan variables en el servidor (.env.local o Vercel): ${falta.join(", ")}.`,
      },
      { status: 500 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let codigo = "";
  let nombre = "";
  let apellidos = "";
  let alias = "";
  let fechaNacimiento = "";
  let firma = "";
  let acepta = false;
  let legalVersion = "";
  let tutorEmail = "";
  let tutorTelefono = "";
  let tutorDniRaw = "";
  let storagePaths: StoragePathsPayload = {};
  let basePath = "";
  let fotoPath: string | null = null;

  if (isJson) {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Peticion invalida." }, { status: 400 });
    }

    codigo = String(body.codigo ?? "").trim().toUpperCase();
    nombre = String(body.nombre ?? "").trim();
    apellidos = String(body.apellidos ?? "").trim();
    alias = String(body.alias ?? "").trim();
    fechaNacimiento = String(body.fechaNacimiento ?? "").trim();
    firma = String(body.firma ?? "").trim();
    acepta = body.acepta === true;
    legalVersion = String(body.legalVersion ?? "").trim();
    tutorEmail = String(body.tutorEmail ?? "").trim().toLowerCase();
    tutorTelefono = String(body.tutorTelefono ?? "").trim();
    tutorDniRaw = String(body.tutorDni ?? "");
    basePath = String(body.basePath ?? "").trim();
    fotoPath = body.fotoPath ? String(body.fotoPath).trim() : null;
    storagePaths = (body.storagePaths as StoragePathsPayload) ?? {};
  } else {
    const form = await request.formData();
    codigo = String(form.get("codigo") ?? "").trim().toUpperCase();
    nombre = String(form.get("nombre") ?? "").trim();
    apellidos = String(form.get("apellidos") ?? "").trim();
    alias = String(form.get("alias") ?? "").trim();
    fechaNacimiento = String(form.get("fechaNacimiento") ?? "").trim();
    firma = String(form.get("firma") ?? "").trim();
    acepta = String(form.get("acepta") ?? "false") === "true";
    legalVersion = String(form.get("legalVersion") ?? "").trim();
    tutorEmail = String(form.get("tutorEmail") ?? "").trim().toLowerCase();
    tutorTelefono = String(form.get("tutorTelefono") ?? "").trim();
    tutorDniRaw = String(form.get("tutorDni") ?? "");

    return NextResponse.json(
      {
        error:
          "Actualiza la pagina e intentalo de nuevo. Las fotos ahora se suben directamente (sin limite de tamano del servidor).",
      },
      { status: 400 },
    );
  }

  if (!codigo || !nombre || !apellidos || !fechaNacimiento || !firma || !acepta) {
    return NextResponse.json({ error: "Faltan datos obligatorios." }, { status: 400 });
  }
  if (!basePath) {
    return NextResponse.json({ error: "Faltan rutas de almacenamiento. Recarga e intentalo de nuevo." }, { status: 400 });
  }

  const dniDelantePath = storagePaths.dniDelante?.trim();
  const dniDetrasPath = storagePaths.dniDetras?.trim();
  const dniTutorDelantePath = storagePaths.dniTutorDelante?.trim();
  const dniTutorDetrasPath = storagePaths.dniTutorDetras?.trim();
  const fotoPerfilPath = storagePaths.fotoPerfil?.trim() ?? fotoPath ?? null;

  if (!dniDelantePath || !dniDetrasPath) {
    return NextResponse.json({ error: "DNI delante y detras son obligatorios." }, { status: 400 });
  }

  const edad = calcEdadAniosCumplidos(fechaNacimiento);
  if (edad === null) {
    return NextResponse.json(
      { error: "La fecha de nacimiento no es valida (usa el calendario del formulario)." },
      { status: 400 },
    );
  }
  const esMenor = edad < 18;

  const tutorDniNorm = normalizeTutorDni(tutorDniRaw);
  const legalEsperado = getInscriptionLegalBundle(esMenor);
  if (legalVersion !== legalEsperado.version) {
    return NextResponse.json(
      {
        error:
          "El texto legal ha sido actualizado. Recarga la pagina de inscripcion y vuelve a aceptar los terminos.",
      },
      { status: 400 },
    );
  }

  const hayTutor =
    Boolean(tutorEmail.trim()) ||
    tutorTelefono.replace(/\D/g, "").length > 0 ||
    Boolean(tutorDniRaw.trim()) ||
    Boolean(dniTutorDelantePath && dniTutorDetrasPath);

  if (hayTutor && !esMenor) {
    return NextResponse.json(
      {
        error:
          "La fecha de nacimiento indica mayor de edad, pero se enviaron datos de tutor. Revisa la fecha o quita archivos/campos de tutor.",
      },
      { status: 400 },
    );
  }

  if (esMenor && (!dniTutorDelantePath || !dniTutorDetrasPath)) {
    return NextResponse.json(
      { error: "Para menores de edad, DNI del tutor es obligatorio." },
      { status: 400 },
    );
  }
  if (esMenor) {
    if (!tutorEmail || !isValidEmail(tutorEmail)) {
      return NextResponse.json(
        { error: "Para menores, el email del tutor es obligatorio y debe ser valido." },
        { status: 400 },
      );
    }
    if (!tutorTelefono || tutorTelefono.replace(/\D/g, "").length < 6) {
      return NextResponse.json(
        { error: "Para menores, el telefono de contacto del tutor es obligatorio (minimo 6 digitos)." },
        { status: 400 },
      );
    }
    if (tutorDniNorm.length < 5 || tutorDniNorm.length > 20) {
      return NextResponse.json(
        {
          error:
            "Para menores, indica el DNI/NIE del tutor tal como figura en el documento (entre 5 y 20 caracteres).",
        },
        { status: 400 },
      );
    }
  }

  const adminClient = createClient(url, serviceRoleKey);

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
    .select("id,codigo_inscripcion,nombre")
    .eq("codigo_inscripcion", codigo)
    .single();
  if (equipoError || !equipo) {
    return NextResponse.json({ error: "Codigo de equipo no valido." }, { status: 400 });
  }

  const pathPrefix = `inscripciones/${equipo.id}/`;
  const fotoPrefix = `jugadores/${equipo.id}/`;
  const pathsToCheck: { bucket: string; path: string }[] = [
    { bucket: "dnis_privados", path: dniDelantePath },
    { bucket: "dnis_privados", path: dniDetrasPath },
  ];
  if (esMenor && dniTutorDelantePath && dniTutorDetrasPath) {
    pathsToCheck.push(
      { bucket: "dnis_privados", path: dniTutorDelantePath },
      { bucket: "dnis_privados", path: dniTutorDetrasPath },
    );
  }
  if (fotoPerfilPath) {
    pathsToCheck.push({ bucket: "escudos", path: fotoPerfilPath });
  }

  for (const item of pathsToCheck) {
    if (!item.path.startsWith(pathPrefix) && !item.path.startsWith(fotoPrefix)) {
      return NextResponse.json({ error: "Ruta de archivo no valida." }, { status: 400 });
    }
  }

  try {
    for (const item of pathsToCheck) {
      await assertStorageObjectExists(adminClient, item.bucket, item.path);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: `Error comprobando archivos subidos: ${error instanceof Error ? error.message : "desconocido"}. Vuelve a intentar la subida.`,
      },
      { status: 400 },
    );
  }

  const consentimientoAceptadoAt = new Date().toISOString();
  const legalTexto = legalEsperado.fullText;
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  const { data: inserted, error: insertError } = await adminClient
    .from("jugadores")
    .insert({
      equipo_id: equipo.id,
      nombre,
      apellidos,
      alias: alias || null,
      dni_delante: dniDelantePath,
      dni_detras: dniDetrasPath,
      dni_tutor_delante: esMenor ? dniTutorDelantePath : null,
      dni_tutor_detras: esMenor ? dniTutorDetrasPath : null,
      es_menor: esMenor,
      fecha_nacimiento: fechaNacimiento,
      foto_url: fotoPerfilPath
        ? adminClient.storage.from("escudos").getPublicUrl(fotoPerfilPath).data.publicUrl
        : null,
      consentimiento_aceptado: true,
      consentimiento_firma: firma,
      consentimiento_aceptado_at: consentimientoAceptadoAt,
      tutor_email: esMenor ? tutorEmail : null,
      tutor_telefono: esMenor ? tutorTelefono : null,
      tutor_dni: esMenor ? tutorDniNorm : null,
      consentimiento_ip: ip,
      consentimiento_user_agent: userAgent,
      consentimiento_legal_version: legalEsperado.version,
      consentimiento_legal_texto: legalTexto,
      tutor_correo_enviado_at: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    return NextResponse.json(
      { error: `No se pudo registrar jugador: ${insertError?.message ?? "sin id"}` },
      { status: 400 },
    );
  }

  let tutorEmailEnviado = false;
  let tutorEmailError: string | null = null;
  if (esMenor && tutorEmail) {
    const equipoNombre = (equipo as { nombre?: string }).nombre ?? "Equipo";
    const mail = await sendTutorInscriptionEmail({
      tutorEmail,
      jugadorNombre: nombre,
      jugadorApellidos: apellidos,
      equipoNombre,
      firmaRegistrada: firma,
      fechaHoraIso: consentimientoAceptadoAt,
      ip,
      userAgent,
      tutorTelefono,
      tutorDni: tutorDniNorm,
      legalTitle: legalEsperado.title,
      legalFullText: legalTexto,
      legalVersion: legalEsperado.version,
    });
    tutorEmailEnviado = mail.ok;
    if (!mail.ok) tutorEmailError = mail.hint;
    if (mail.ok) {
      await adminClient
        .from("jugadores")
        .update({ tutor_correo_enviado_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }
  }

  return NextResponse.json({
    ok: true,
    tutorEmailEnviado: esMenor ? tutorEmailEnviado : null,
    tutorEmailError: esMenor ? tutorEmailError : null,
  });
}

export const maxDuration = 60;
