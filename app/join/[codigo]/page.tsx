"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { calcEdadAniosCumplidos } from "@/lib/edad-inscripcion";
import { getInscriptionLegalBundle } from "@/lib/inscripcion-legal";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white p-3 text-base text-slate-900 placeholder:text-slate-400";

const fileInputClass =
  "w-full rounded-lg border border-slate-300 bg-white p-2 text-base text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-900";

function FieldLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1">
      <span className="block text-sm font-semibold text-slate-800">
        {children}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-600">{hint}</span> : null}
    </div>
  );
}

export default function JoinByCodePage() {
  const params = useParams<{ codigo: string }>();
  const router = useRouter();
  const codigo = params.codigo;

  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [alias, setAlias] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [dniDelante, setDniDelante] = useState<File | null>(null);
  const [dniDetras, setDniDetras] = useState<File | null>(null);
  const [fotoPerfil, setFotoPerfil] = useState<File | null>(null);
  const [dniTutorDelante, setDniTutorDelante] = useState<File | null>(null);
  const [dniTutorDetras, setDniTutorDetras] = useState<File | null>(null);
  const [tutorEmail, setTutorEmail] = useState("");
  const [tutorTelefono, setTutorTelefono] = useState("");
  const [tutorDni, setTutorDni] = useState("");
  const [firma, setFirma] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [inscripcionOk, setInscripcionOk] = useState(false);

  const edad = fechaNacimiento ? calcEdadAniosCumplidos(fechaNacimiento) : null;
  const esMenor = edad !== null ? edad < 18 : false;
  const legalBundle = useMemo(() => getInscriptionLegalBundle(esMenor), [esMenor]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setInscripcionOk(false);

    if (!dniDelante || !dniDetras) {
      setMessage("Debes subir DNI delante y detras.");
      return;
    }
    if (esMenor && (!dniTutorDelante || !dniTutorDetras)) {
      setMessage("Si eres menor, debes subir tambien DNI del padre/madre/tutor.");
      return;
    }
    if (esMenor) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tutorEmail.trim());
      if (!emailOk) {
        setMessage("Si eres menor, el email del tutor es obligatorio y debe ser valido.");
        return;
      }
      const digits = tutorTelefono.replace(/\D/g, "");
      if (digits.length < 6) {
        setMessage("Si eres menor, el telefono del tutor es obligatorio (minimo 6 digitos).");
        return;
      }
      const dniT = tutorDni.trim().toUpperCase().replace(/\s+/g, "");
      if (dniT.length < 5 || dniT.length > 20) {
        setMessage("Si eres menor, indica el DNI/NIE del tutor (5 a 20 caracteres, como en el documento).");
        return;
      }
    }
    if (!acepta || !firma.trim()) {
      setMessage("Debes aceptar terminos y firmar para completar la inscripcion.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("codigo", codigo);
    formData.append("nombre", nombre);
    formData.append("apellidos", apellidos);
    formData.append("alias", alias);
    formData.append("fechaNacimiento", fechaNacimiento);
    formData.append("firma", firma);
    formData.append("acepta", "true");
    formData.append("legalVersion", legalBundle.version);
    formData.append("dniDelante", dniDelante);
    formData.append("dniDetras", dniDetras);
    if (fotoPerfil) formData.append("fotoPerfil", fotoPerfil);
    if (dniTutorDelante) formData.append("dniTutorDelante", dniTutorDelante);
    if (dniTutorDetras) formData.append("dniTutorDetras", dniTutorDetras);
    if (esMenor) {
      formData.append("tutorEmail", tutorEmail.trim().toLowerCase());
      formData.append("tutorTelefono", tutorTelefono.trim());
      formData.append("tutorDni", tutorDni.trim());
    }

    const response = await fetch("/api/join/register", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as {
      error?: string;
      ok?: boolean;
      tutorEmailEnviado?: boolean | null;
      tutorEmailError?: string | null;
    };

    if (!response.ok) {
      setMessage(`Error: ${result.error ?? "No se pudo completar la inscripcion."}`);
      setLoading(false);
      return;
    }

    setInscripcionOk(true);
    if (result.tutorEmailEnviado === false) {
      const detalle = result.tutorEmailError?.trim()
        ? `\n\nDetalle:\n${result.tutorEmailError}`
        : "";
      setMessage(
        `Inscripcion completada, pero el correo al tutor no se ha enviado.${detalle}\n\nLos datos del jugador estan guardados. Revisa SMTP_PASS / Gmail o Resend en el servidor.`,
      );
    } else {
      setMessage("Inscripcion completada correctamente.");
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-violet-800">Inscripcion de jugador</h1>
        <p className="text-sm text-slate-600">Codigo de equipo: {codigo}</p>

        <form className="grid gap-4" onSubmit={onSubmit}>
          <div>
            <FieldLabel required>Nombre</FieldLabel>
            <input
              className={inputClass}
              name="nombre"
              autoComplete="given-name"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              required
            />
          </div>

          <div>
            <FieldLabel required>Apellidos</FieldLabel>
            <input
              className={inputClass}
              name="apellidos"
              autoComplete="family-name"
              value={apellidos}
              onChange={(event) => setApellidos(event.target.value)}
              required
            />
          </div>

          <div>
            <FieldLabel hint="Opcional, para la app y clasificaciones.">Alias</FieldLabel>
            <input
              className={inputClass}
              name="alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
            />
          </div>

          <div>
            <FieldLabel required hint="Toca el recuadro para elegir dia, mes y ano.">
              Fecha de nacimiento
            </FieldLabel>
            <input
              className={`${inputClass} min-h-[48px] [color-scheme:light]`}
              type="date"
              name="fechaNacimiento"
              value={fechaNacimiento}
              onChange={(event) => setFechaNacimiento(event.target.value)}
              required
            />
            {edad !== null ? (
              <p className="mt-1 text-xs text-slate-600">
                Edad calculada: {edad} anos {esMenor ? "(menor de edad)" : "(mayor de edad)"}
              </p>
            ) : null}
          </div>

          <div>
            <FieldLabel required>DNI delante (foto)</FieldLabel>
            <input
              className={fileInputClass}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setDniDelante(event.target.files?.[0] ?? null)}
              required
            />
          </div>

          <div>
            <FieldLabel required>DNI detras (foto)</FieldLabel>
            <input
              className={fileInputClass}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setDniDetras(event.target.files?.[0] ?? null)}
              required
            />
          </div>

          <div>
            <FieldLabel hint="Foto de la cara, tipo carnet o ficha.">Foto de perfil</FieldLabel>
            <input
              className={fileInputClass}
              type="file"
              accept="image/*"
              capture="user"
              onChange={(event) => setFotoPerfil(event.target.files?.[0] ?? null)}
            />
          </div>

          {esMenor ? (
            <div className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <p className="text-sm font-semibold text-amber-950">
                Menor de edad: datos del padre, madre o tutor legal
              </p>

              <div>
                <FieldLabel required hint="Recibira el resguardo de la inscripcion.">
                  Email del tutor
                </FieldLabel>
                <input
                  className={inputClass}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={tutorEmail}
                  onChange={(event) => setTutorEmail(event.target.value)}
                  required
                />
              </div>

              <div>
                <FieldLabel required>Telefono del tutor (urgencias)</FieldLabel>
                <input
                  className={inputClass}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={tutorTelefono}
                  onChange={(event) => setTutorTelefono(event.target.value)}
                  required
                />
              </div>

              <div>
                <FieldLabel required hint="Tal como figura en el DNI del tutor.">
                  DNI o NIE del tutor
                </FieldLabel>
                <input
                  className={inputClass}
                  value={tutorDni}
                  onChange={(event) => setTutorDni(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>

              <div>
                <FieldLabel required>DNI del tutor — delante (foto)</FieldLabel>
                <input
                  className={fileInputClass}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => setDniTutorDelante(event.target.files?.[0] ?? null)}
                  required
                />
              </div>

              <div>
                <FieldLabel required>DNI del tutor — detras (foto)</FieldLabel>
                <input
                  className={fileInputClass}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => setDniTutorDetras(event.target.files?.[0] ?? null)}
                  required
                />
              </div>
            </div>
          ) : null}

          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
            {legalBundle.fullText}
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={acepta}
              onChange={(event) => setAcepta(event.target.checked)}
              className="mt-1"
              required
            />
            <span>
              {esMenor
                ? "En calidad de padre/madre/tutor legal declaro haber leido y acepto los terminos anteriores y consiento la inscripcion del menor."
                : "He leido y acepto los terminos y condiciones, y consiento la inscripcion."}
            </span>
          </label>

          <div>
            <FieldLabel
              required
              hint={
                esMenor
                  ? "Escribe nombre y apellidos del padre, madre o tutor legal."
                  : "Escribe tu nombre y apellidos como firma."
              }
            >
              {esMenor ? "Firma del tutor (nombre y apellidos)" : "Firma (nombre y apellidos)"}
            </FieldLabel>
            <input
              className={inputClass}
              value={firma}
              onChange={(event) => setFirma(event.target.value)}
              required
            />
          </div>

          <button
            className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={loading || inscripcionOk}
          >
            {loading ? "Enviando..." : "Completar inscripcion"}
          </button>
        </form>

        {inscripcionOk ? (
          <div className="flex flex-col gap-4 rounded-xl border-2 border-violet-300 bg-violet-50 p-4 shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">{message}</p>
            <button
              type="button"
              className="rounded-lg bg-violet-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-violet-800"
              onClick={() => {
                router.push("/");
                router.refresh();
              }}
            >
              Ir al inicio
            </button>
          </div>
        ) : message ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-900">{message}</p>
        ) : null}
      </div>
    </main>
  );
}
