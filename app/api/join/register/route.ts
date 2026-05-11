import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calcEdadAniosCumplidos } from "@/lib/edad-inscripcion";
import { getInscriptionLegalBundle } from "@/lib/inscripcion-legal";
import { getClientIp, getUserAgent } from "@/lib/server/request-meta";
import { sendTutorInscriptionEmail } from "@/lib/server/send-tutor-inscription-email";

async function uploadFile(
  client: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  file: File,
) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await client.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (upload.error) throw new Error(upload.error.message);
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function hayDatosTutorEnFormulario(
  tutorEmail: string,
  tutorTelefono: string,
  tutorDni: string,
  dniTutorDelante: File | null,
  dniTutorDetras: File | null,
): boolean {
  if (tutorEmail.trim()) return true;
  if (tutorTelefono.replace(/\D/g, "").length > 0) return true;
  if (tutorDni.trim()) return true;
  if (dniTutorDelante && dniTutorDetras) return true;
  return false;
}

function normalizeTutorDni(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    const falta: string[] = [];
    if (!url) falta.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!serviceRoleKey) falta.push("SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      {
        error: `Faltan variables en el servidor (.env.local o Vercel): ${falta.join(", ")}. La clave service_role esta en Supabase → Project Settings → API.`,
      },
      { status: 500 },
    );
  }

  const form = await request.formData();
  const codigo = String(form.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(form.get("nombre") ?? "").trim();
  const apellidos = String(form.get("apellidos") ?? "").trim();
  const alias = String(form.get("alias") ?? "").trim();
  const fechaNacimiento = String(form.get("fechaNacimiento") ?? "").trim();
  const firma = String(form.get("firma") ?? "").trim();
  const acepta = String(form.get("acepta") ?? "false") === "true";
  const legalVersion = String(form.get("legalVersion") ?? "").trim();
  const tutorEmail = String(form.get("tutorEmail") ?? "").trim().toLowerCase();
  const tutorTelefono = String(form.get("tutorTelefono") ?? "").trim();
  const tutorDniRaw = String(form.get("tutorDni") ?? "");

  const dniDelante = form.get("dniDelante") as File | null;
  const dniDetras = form.get("dniDetras") as File | null;
  const fotoPerfil = form.get("fotoPerfil") as File | null;
  const dniTutorDelante = form.get("dniTutorDelante") as File | null;
  const dniTutorDetras = form.get("dniTutorDetras") as File | null;

  if (!codigo || !nombre || !apellidos || !fechaNacimiento || !firma || !acepta) {
    return NextResponse.json({ error: "Faltan datos obligatorios." }, { status: 400 });
  }
  if (!dniDelante || !dniDetras) {
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

  const hayTutor = hayDatosTutorEnFormulario(
    tutorEmail,
    tutorTelefono,
    tutorDniRaw,
    dniTutorDelante,
    dniTutorDetras,
  );
  if (hayTutor && !esMenor) {
    return NextResponse.json(
      {
        error:
          "La fecha de nacimiento indica mayor de edad, pero se enviaron datos de tutor. Revisa la fecha (dia/mes/año) o quita archivos/campos de tutor.",
      },
      { status: 400 },
    );
  }

  if (esMenor && (!dniTutorDelante || !dniTutorDetras)) {
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
            "Para menores, indica el DNI/NIE del tutor tal como figura en el documento (entre 5 y 20 caracteres, sin espacios innecesarios).",
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

  const safeName = `${Date.now()}-${nombre.toLowerCase().replace(/\s+/g, "-")}`;
  const basePath = `inscripciones/${equipo.id}/${safeName}`;
  const fotoPath = fotoPerfil ? `jugadores/${equipo.id}/${safeName}-perfil` : null;

  try {
    await uploadFile(adminClient, "dnis_privados", `${basePath}-dni-delante`, dniDelante);
    await uploadFile(adminClient, "dnis_privados", `${basePath}-dni-detras`, dniDetras);
    if (esMenor && dniTutorDelante && dniTutorDetras) {
      await uploadFile(adminClient, "dnis_privados", `${basePath}-tutor-delante`, dniTutorDelante);
      await uploadFile(adminClient, "dnis_privados", `${basePath}-tutor-detras`, dniTutorDetras);
    }
    if (fotoPerfil && fotoPath) {
      await uploadFile(adminClient, "escudos", fotoPath, fotoPerfil);
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Error subiendo DNI: ${error instanceof Error ? error.message : "desconocido"}` },
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
      dni_delante: `${basePath}-dni-delante`,
      dni_detras: `${basePath}-dni-detras`,
      dni_tutor_delante: esMenor ? `${basePath}-tutor-delante` : null,
      dni_tutor_detras: esMenor ? `${basePath}-tutor-detras` : null,
      es_menor: esMenor,
      fecha_nacimiento: fechaNacimiento,
      foto_url: fotoPath
        ? adminClient.storage.from("escudos").getPublicUrl(fotoPath).data.publicUrl
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
