import {
  getInscriptionLegalFullText,
  getInscriptionLegalTitle,
  INSCRIPTION_LEGAL_VERSION,
} from "@/lib/inscripcion-legal";
import { sendMailAuthLoginTls } from "@/lib/server/smtp-send-tls";

type Args = {
  tutorEmail: string;
  tutorTelefono: string;
  jugadorNombre: string;
  jugadorApellidos: string;
  equipoNombre: string;
  firmaRegistrada: string;
  fechaHoraIso: string;
  ip: string | null;
  userAgent: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SendTutorInscriptionEmailResult =
  | { ok: true }
  | { ok: false; hint: string };

function buildMail(args: Args): { subject: string; html: string } {
  const legal = escapeHtml(getInscriptionLegalFullText()).replace(/\n/g, "<br/>");
  const subject = `Resguardo inscripcion menor — ${args.equipoNombre}`;
  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:16px;color:#111">
  <h1 style="font-size:18px;color:#5b21b6">Resguardo de inscripcion (menor)</h1>
  <p>Se ha completado la inscripcion de un menor en el torneo. A continuacion consta la informacion registrada y el texto legal aceptado.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>Equipo</strong></td><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(args.equipoNombre)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>Jugador/a</strong></td><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(`${args.jugadorNombre} ${args.jugadorApellidos}`)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>Tel. tutor (urgencias)</strong></td><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(args.tutorTelefono)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>Firma registrada (tutor)</strong></td><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(args.firmaRegistrada)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>Fecha y hora (UTC)</strong></td><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(args.fechaHoraIso)}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>IP aproximada</strong></td><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(args.ip ?? "—")}</td></tr>
    <tr><td style="padding:6px 0;border-bottom:1px solid #eee"><strong>Versión texto legal</strong></td><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(INSCRIPTION_LEGAL_VERSION)}</td></tr>
  </table>
  <p style="font-size:12px;color:#555">User-Agent (navegador/dispositivo, truncado):<br/><code style="word-break:break-all">${escapeHtml(args.userAgent ?? "—")}</code></p>
  <h2 style="font-size:15px;margin-top:24px">${escapeHtml(getInscriptionLegalTitle())}</h2>
  <div style="font-size:13px;line-height:1.45;color:#333;border:1px solid #e5e7eb;padding:12px;border-radius:8px;background:#fafafa">${legal}</div>
  <p style="font-size:12px;color:#666;margin-top:24px">Este mensaje se ha generado automaticamente. Conserve este correo como resguardo.</p>
</body></html>`;
  return { subject, html };
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<SendTutorInscriptionEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Torneo <onboarding@resend.dev>";
  if (!apiKey) {
    return { ok: false, hint: "RESEND_API_KEY vacia" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[torneo] Resend error:", res.status, errText);
    let hint = `Resend respondio ${res.status}. Revisa dominio verificado y el correo del tutor.`;
    try {
      const j = JSON.parse(errText) as { message?: string };
      if (j.message && typeof j.message === "string") hint = `Resend: ${j.message}`;
    } catch {
      if (errText.length > 0 && errText.length < 400) hint = `Resend: ${errText}`;
    }
    return { ok: false, hint };
  }
  return { ok: true };
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
): Promise<SendTutorInscriptionEmailResult> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const portRaw = process.env.SMTP_PORT?.trim() ?? "587";
  const port = Number.parseInt(portRaw, 10) || 587;

  if (!host || !user || !pass || !from) {
    return {
      ok: false,
      hint: "SMTP incompleto (necesita SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM)",
    };
  }

  const result = await sendMailAuthLoginTls({
    host,
    port,
    user,
    pass,
    from,
    to,
    subject,
    html,
  });
  if (!result.ok) {
    const msg = result.message;
    console.error("[torneo] SMTP error:", msg);
    const lower = msg.toLowerCase();
    let extra = "";
    if (
      lower.includes("invalid login") ||
      lower.includes("authentication failed") ||
      lower.includes("535") ||
      lower.includes("534") ||
      lower.includes("eauth") ||
      lower.includes("auth contraseña")
    ) {
      extra =
        " (Gmail: activa verificacion en 2 pasos y crea una «Contraseña de aplicaciones» en myaccount.google.com/apppasswords; pegala en SMTP_PASS, no uses la clave normal de la cuenta.)";
    }
    return { ok: false, hint: `SMTP: ${msg}${extra}` };
  }
  return { ok: true };
}

/**
 * Correo al tutor tras inscripcion de un menor.
 *
 * Los correos de login (magic link, invitacion delegado) los envia **Supabase Auth** desde su panel (SMTP propio o el de Supabase).
 * Este mensaje lo envia **esta app**; usa, en este orden:
 * 1) Resend si hay `RESEND_API_KEY`
 * 2) Si no, SMTP si hay `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` + `EMAIL_FROM` (copia los mismos datos que en Supabase → Authentication → SMTP Settings)
 */
export async function sendTutorInscriptionEmail(args: Args): Promise<SendTutorInscriptionEmailResult> {
  const { subject, html } = buildMail(args);
  const to = args.tutorEmail;

  if (process.env.RESEND_API_KEY?.trim()) {
    return sendViaResend(to, subject, html);
  }

  const smtpReady =
    Boolean(process.env.SMTP_HOST?.trim()) &&
    Boolean(process.env.SMTP_USER?.trim()) &&
    Boolean(process.env.SMTP_PASS?.trim()) &&
    Boolean(process.env.EMAIL_FROM?.trim());

  if (smtpReady) {
    return sendViaSmtp(to, subject, html);
  }

  const missingSmtp: string[] = [];
  if (!process.env.SMTP_HOST?.trim()) missingSmtp.push("SMTP_HOST");
  if (!process.env.SMTP_USER?.trim()) missingSmtp.push("SMTP_USER");
  if (!process.env.SMTP_PASS?.trim()) {
    missingSmtp.push("SMTP_PASS (en Gmail: contraseña de aplicación de 16 caracteres, no la clave normal)");
  }
  if (!process.env.EMAIL_FROM?.trim()) missingSmtp.push("EMAIL_FROM");

  const hint =
    missingSmtp.length > 0
      ? [
          "No se ha configurado RESEND_API_KEY y el SMTP está incompleto o vacío.",
          `Revisa que existan y tengan valor (sin comillas raras): ${missingSmtp.join(", ")}.`,
          "Local: archivo .env.local en la raíz del proyecto. Producción (Vercel): Settings → Environment Variables → redeploy.",
          "Después de cambiar variables, reinicia npm run dev o vuelve a desplegar.",
        ].join(" ")
      : [
          "No hay RESEND_API_KEY ni un bloque SMTP completo.",
          "Opción A: RESEND_API_KEY=re_... en .env.local o Vercel.",
          "Opción B: SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM (Gmail: puerto 465 en SMTP_PORT).",
        ].join(" ");

  console.warn("[torneo] correo tutor no enviado:", hint);
  return { ok: false, hint };
}
