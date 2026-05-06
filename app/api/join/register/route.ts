import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function calcAge(fechaNacimiento: string): number {
  const birth = new Date(fechaNacimiento);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

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

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Faltan variables de entorno." }, { status: 500 });
  }

  const form = await request.formData();
  const codigo = String(form.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(form.get("nombre") ?? "").trim();
  const apellidos = String(form.get("apellidos") ?? "").trim();
  const fechaNacimiento = String(form.get("fechaNacimiento") ?? "").trim();
  const firma = String(form.get("firma") ?? "").trim();
  const acepta = String(form.get("acepta") ?? "false") === "true";

  const dniDelante = form.get("dniDelante") as File | null;
  const dniDetras = form.get("dniDetras") as File | null;
  const dniTutorDelante = form.get("dniTutorDelante") as File | null;
  const dniTutorDetras = form.get("dniTutorDetras") as File | null;

  if (!codigo || !nombre || !apellidos || !fechaNacimiento || !firma || !acepta) {
    return NextResponse.json({ error: "Faltan datos obligatorios." }, { status: 400 });
  }
  if (!dniDelante || !dniDetras) {
    return NextResponse.json({ error: "DNI delante y detras son obligatorios." }, { status: 400 });
  }

  const edad = calcAge(fechaNacimiento);
  const esMenor = edad < 18;
  if (esMenor && (!dniTutorDelante || !dniTutorDetras)) {
    return NextResponse.json(
      { error: "Para menores de edad, DNI del tutor es obligatorio." },
      { status: 400 },
    );
  }

  const adminClient = createClient(url, serviceRoleKey);

  const { data: equipo, error: equipoError } = await adminClient
    .from("equipos")
    .select("id,codigo_inscripcion")
    .eq("codigo_inscripcion", codigo)
    .single();
  if (equipoError || !equipo) {
    return NextResponse.json({ error: "Codigo de equipo no valido." }, { status: 400 });
  }

  const safeName = `${Date.now()}-${nombre.toLowerCase().replace(/\s+/g, "-")}`;
  const basePath = `inscripciones/${equipo.id}/${safeName}`;

  try {
    await uploadFile(adminClient, "dnis_privados", `${basePath}-dni-delante`, dniDelante);
    await uploadFile(adminClient, "dnis_privados", `${basePath}-dni-detras`, dniDetras);
    if (esMenor && dniTutorDelante && dniTutorDetras) {
      await uploadFile(adminClient, "dnis_privados", `${basePath}-tutor-delante`, dniTutorDelante);
      await uploadFile(adminClient, "dnis_privados", `${basePath}-tutor-detras`, dniTutorDetras);
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Error subiendo DNI: ${error instanceof Error ? error.message : "desconocido"}` },
      { status: 400 },
    );
  }

  const { error: insertError } = await adminClient.from("jugadores").insert({
    equipo_id: equipo.id,
    nombre,
    apellidos,
    dni_delante: `${basePath}-dni-delante`,
    dni_detras: `${basePath}-dni-detras`,
    dni_tutor_delante: esMenor ? `${basePath}-tutor-delante` : null,
    dni_tutor_detras: esMenor ? `${basePath}-tutor-detras` : null,
    es_menor: esMenor,
    fecha_nacimiento: fechaNacimiento,
    consentimiento_aceptado: true,
    consentimiento_firma: firma,
    consentimiento_aceptado_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json(
      { error: `No se pudo registrar jugador: ${insertError.message}` },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
