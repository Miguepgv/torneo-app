import * as readline from "node:readline";
import * as tls from "node:tls";

export type SmtpTlsResult = { ok: true } | { ok: false; message: string };

function extractAddr(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  if (m?.[1]) return m[1].trim();
  const t = fromHeader.trim();
  return t.includes("@") ? t : fromHeader;
}

function encodeSubjectRfc2047(subject: string): string {
  if (!/[^\x00-\x7F]/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function wrapBase64(b64: string): string {
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    parts.push(b64.slice(i, i + 76));
  }
  return parts.join("\r\n");
}

function dotStuff(s: string): string {
  return s.replace(/^\./gm, "..");
}

/**
 * SMTP sobre TLS implicito (puerto 465), AUTH LOGIN.
 * Sin dependencias externas (solo Node). Probado con Gmail.
 */
export function sendMailAuthLoginTls(opts: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SmtpTlsResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: SmtpTlsResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    if (opts.port !== 465) {
      finish({
        ok: false,
        message:
          `Puerto SMTP ${opts.port}: esta app solo implementa TLS implicito en 465 (Gmail). Cambia SMTP_PORT a 465 o usa RESEND_API_KEY.`,
      });
      return;
    }

    const socket = tls.connect(
      {
        host: opts.host,
        port: opts.port,
        servername: opts.host,
        rejectUnauthorized: true,
      },
      () => {
        void (async () => {
          const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
          const write = (s: string) => {
            socket.write(s, "utf8");
          };

          const readFinal = (): Promise<string> =>
            new Promise((resolveLine, rejectLine) => {
              const onLine = (line: string) => {
                if (/^\d{3} /.test(line)) {
                  rl.off("line", onLine);
                  resolveLine(line);
                } else if (!/^\d{3}-/.test(line)) {
                  rl.off("line", onLine);
                  rejectLine(new Error(`Respuesta SMTP inesperada: ${line}`));
                }
              };
              rl.on("line", onLine);
            });

          const fail = (e: unknown) => {
            try {
              socket.destroy();
            } catch {
              /* ignore */
            }
            const msg = e instanceof Error ? e.message : String(e);
            finish({ ok: false, message: msg });
          };

          try {
            await readFinal();

            write(`EHLO torneo-app.local\r\n`);
            await readFinal();

            write(`AUTH LOGIN\r\n`);
            let line = await readFinal();
            if (!line.startsWith("334")) throw new Error(`AUTH LOGIN: ${line}`);

            write(`${Buffer.from(opts.user, "utf8").toString("base64")}\r\n`);
            line = await readFinal();
            if (!line.startsWith("334")) throw new Error(`AUTH usuario: ${line}`);

            write(`${Buffer.from(opts.pass, "utf8").toString("base64")}\r\n`);
            line = await readFinal();
            if (!line.startsWith("235")) throw new Error(`AUTH contraseña: ${line}`);

            const fromAddr = extractAddr(opts.from);
            write(`MAIL FROM:<${fromAddr}>\r\n`);
            line = await readFinal();
            if (!line.startsWith("250")) throw new Error(`MAIL FROM: ${line}`);

            write(`RCPT TO:<${opts.to}>\r\n`);
            line = await readFinal();
            if (!line.startsWith("250")) throw new Error(`RCPT TO: ${line}`);

            write(`DATA\r\n`);
            line = await readFinal();
            if (!line.startsWith("354")) throw new Error(`DATA: ${line}`);

            const mime = [
              `From: ${opts.from}`,
              `To: ${opts.to}`,
              `Subject: ${encodeSubjectRfc2047(opts.subject)}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=UTF-8`,
              `Content-Transfer-Encoding: base64`,
              ``,
              wrapBase64(Buffer.from(opts.html, "utf8").toString("base64")),
            ].join("\r\n");

            write(`${dotStuff(mime)}\r\n.\r\n`);
            line = await readFinal();
            if (!line.startsWith("250")) throw new Error(`Envio mensaje: ${line}`);

            write(`QUIT\r\n`);
            try {
              await readFinal();
            } catch {
              /* ignore QUIT reply */
            }
            socket.end();
            finish({ ok: true });
          } catch (e) {
            fail(e);
          }
        })();
      },
    );

    socket.on("error", (err) => {
      if (!settled) finish({ ok: false, message: err.message });
    });
  });
}
