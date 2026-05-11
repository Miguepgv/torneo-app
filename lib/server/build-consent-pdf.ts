import { jsPDF } from "jspdf";
import { INSCRIPTION_LEGAL_VERSION_ADULT } from "@/lib/inscripcion-legal";

export type JugadorConsentPdfRow = {
  id: string;
  nombre: string;
  apellidos: string;
  alias: string | null;
  fecha_nacimiento: string | null;
  es_menor: boolean | null;
  consentimiento_firma: string | null;
  consentimiento_aceptado_at: string | null;
  consentimiento_ip: string | null;
  consentimiento_user_agent: string | null;
  consentimiento_legal_version: string | null;
  consentimiento_legal_texto: string | null;
  tutor_email: string | null;
  tutor_telefono: string | null;
  tutor_dni: string | null;
  tutor_correo_enviado_at: string | null;
  equipos: { nombre: string } | null;
};

/**
 * PDF con jsPDF (sin pdfkit: evita cuelgues en `next build` / Turbopack).
 */
export function buildConsentPdfBuffer(row: JugadorConsentPdfRow): Buffer {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - 2 * margin;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const paragraph = (text: string, fontSize: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxW);
    const lh = fontSize * 1.25;
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, margin, y);
      y += lh;
    }
    y += fontSize * 0.35;
  };

  const eq = row.equipos?.nombre ?? "—";
  const esMenor = row.es_menor === true;
  paragraph("Resguardo de inscripcion y consentimiento", 16, true);

  const pairs: [string, string][] = [
    ["Equipo", eq],
    ["Jugador/a", `${row.nombre} ${row.apellidos}`.trim()],
    ["Alias", row.alias?.trim() || "—"],
    ["Fecha nacimiento", row.fecha_nacimiento ?? "—"],
    ["Menor de edad", esMenor ? "Si" : "No"],
    ["Firma registrada", row.consentimiento_firma ?? "—"],
    ["Aceptacion (fecha/hora UTC)", row.consentimiento_aceptado_at ?? "—"],
    ["Direccion IP (registrada)", row.consentimiento_ip ?? "—"],
    ["User-Agent (navegador)", (row.consentimiento_user_agent ?? "—").slice(0, 500)],
    ["Version texto legal", row.consentimiento_legal_version ?? INSCRIPTION_LEGAL_VERSION_ADULT],
  ];

  if (esMenor) {
    pairs.push(
      ["DNI/NIE tutor (declarado en formulario)", row.tutor_dni ?? "—"],
      ["Email tutor", row.tutor_email ?? "—"],
      ["Telefono tutor", row.tutor_telefono ?? "—"],
      ["Correo al tutor enviado (UTC)", row.tutor_correo_enviado_at ?? "No consta envio"],
    );
  } else {
    pairs.push([
      "Correo automatico al tutor",
      "No aplica (mayor de edad). El resguardo por correo solo se envia a tutores en inscripciones de menores.",
    ]);
  }

  for (const [k, v] of pairs) {
    paragraph(`${k}: ${v}`, 10, false);
  }

  paragraph("Texto legal aceptado (copia en el momento de la inscripcion)", 12, true);
  const legal =
    row.consentimiento_legal_texto ?? "(No consta texto en base de datos; posible inscripcion anterior.)";
  paragraph(legal, 9, false);

  paragraph(
    `Documento generado desde la aplicacion del torneo. No sustituye asesoramiento juridico. ID jugador: ${row.id}`,
    8,
    false,
  );

  const out = doc.output("arraybuffer");
  return Buffer.from(new Uint8Array(out as ArrayBuffer));
}
