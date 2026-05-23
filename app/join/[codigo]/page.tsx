"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { compressImageFile } from "@/lib/client/compress-image";
import { calcEdadAniosCumplidos } from "@/lib/edad-inscripcion";
import { getInscriptionLegalFullText, INSCRIPTION_LEGAL_VERSION } from "@/lib/inscripcion-legal";

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
  const [firma, setFirma] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("");
  const [message, setMessage] = useState("");
  const [inscripcionOk, setInscripcionOk] = useState(false);

  const edad = fechaNacimiento ? calcEdadAniosCumplidos(fechaNacimiento) : null;
  const esMenor = edad !== null ? edad < 18 : false;

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
    }
    if (!acepta || !firma.trim()) {
      setMessage("Debes aceptar terminos y firmar para completar la inscripcion.");
      return;
    }

    setLoading(true);
    setLoadingHint("Preparando fotos...");

    try {
      const dniDelanteOk = await compressImageFile(dniDelante);
      const dniDetrasOk = await compressImageFile(dniDetras);
      const fotoPerfilOk = fotoPerfil ? await compressImageFile(fotoPerfil, 1200) : null;
      const dniTutorDelanteOk =
        dniTutorDelante && esMenor ? await compressImageFile(dniTutorDelante) : null;
      const dniTutorDetrasOk =
        dniTutorDetras && esMenor ? await compressImageFile(dniTutorDetras) : null;

      setLoadingHint("Subiendo inscripcion, no cierres la pagina (puede tardar varios minutos)...");

      const formData = new FormData();
      formData.append("codigo", codigo);
      formData.append("nombre", nombre);
      formData.append("apellidos", apellidos);
      formData.append("alias", alias);
      formData.append("fechaNacimiento", fechaNacimiento);
      formData.append("firma", firma);
      formData.append("acepta", "true");
      formData.append("legalVersion", INSCRIPTION_LEGAL_VERSION);
      formData.append("dniDelante", dniDelanteOk);
      formData.append("dniDetras", dniDetrasOk);
      if (fotoPerfilOk) formData.append("fotoPerfil", fotoPerfilOk);
      if (dniTutorDelanteOk) formData.append("dniTutorDelante", dniTutorDelanteOk);
      if (dniTutorDetrasOk) formData.append("dniTutorDetras", dniTutorDetrasOk);
      if (esMenor) {
        formData.append("tutorEmail", tutorEmail.trim().toLowerCase());
        formData.append("tutorTelefono", tutorTelefono.trim());
      }

      const response = await fetch("/api/join/register", {
        method: "POST",
        body: formData,
      });

      let result: { error?: string; ok?: boolean; tutorEmailPendiente?: boolean | null } = {};
      try {
        result = (await response.json()) as typeof result;
      } catch {
        setMessage(
          response.ok
            ? "Inscripcion enviada, pero la respuesta del servidor no es valida. Recarga la pagina y comprueba si el jugador aparece en el equipo."
            : `Error del servidor (${response.status}). Espera un momento e intentalo de nuevo.`,
        );
        return;
      }

      if (!response.ok) {
        setMessage(`Error: ${result.error ?? "No se pudo completar la inscripcion."}`);
        return;
      }

      setInscripcionOk(true);
      if (result.tutorEmailPendiente) {
        setMessage(
          "Inscripcion completada correctamente.\n\nSi eres menor, el correo al tutor se envia en segundo plano (puede tardar unos minutos).",
        );
      } else {
        setMessage("Inscripcion completada correctamente.");
      }
    } catch {
      setMessage("No se pudo conectar con el servidor. Comprueba tu conexion e intentalo de nuevo.");
    } finally {
      setLoading(false);
      setLoadingHint("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-violet-800">Inscripcion de jugador</h1>
        <p className="text-sm text-slate-600">Codigo de equipo: {codigo}</p>

        <form className="grid gap-3" onSubmit={onSubmit}>
          <input
            className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
            placeholder="Nombre"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
            placeholder="Apellidos"
            value={apellidos}
            onChange={(event) => setApellidos(event.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
            placeholder="Alias (opcional)"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
            type="date"
            value={fechaNacimiento}
            onChange={(event) => setFechaNacimiento(event.target.value)}
            required
          />

          <label className="text-sm font-semibold text-slate-700">DNI delante</label>
          <input
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
            type="file"
            accept="image/*"
            onChange={(event) => setDniDelante(event.target.files?.[0] ?? null)}
            required
          />

          <label className="text-sm font-semibold text-slate-700">DNI detras</label>
          <input
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
            type="file"
            accept="image/*"
            onChange={(event) => setDniDetras(event.target.files?.[0] ?? null)}
            required
          />

          <label className="text-sm font-semibold text-slate-700">
            Foto de perfil (cara, tipo ficha)
          </label>
          <input
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
            type="file"
            accept="image/*"
            onChange={(event) => setFotoPerfil(event.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-slate-600">
            Sube una foto de la cara, como para ficha de jugador. Puedes usar las fotos del movil tal cual.
          </p>

          {esMenor ? (
            <>
              <p className="text-sm font-semibold text-amber-800">
                Menor de edad: datos del padre/madre/tutor legal (obligatorios)
              </p>
              <input
                className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Email del tutor (recibira el resguardo con las condiciones aceptadas)"
                value={tutorEmail}
                onChange={(event) => setTutorEmail(event.target.value)}
                required
              />
              <input
                className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Telefono de contacto del tutor (urgencias)"
                value={tutorTelefono}
                onChange={(event) => setTutorTelefono(event.target.value)}
                required
              />
              <label className="text-sm font-semibold text-slate-700">
                DNI tutor delante (obligatorio por ser menor)
              </label>
              <input
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
                type="file"
                accept="image/*"
                onChange={(event) => setDniTutorDelante(event.target.files?.[0] ?? null)}
                required
              />
              <label className="text-sm font-semibold text-slate-700">
                DNI tutor detras (obligatorio por ser menor)
              </label>
              <input
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
                type="file"
                accept="image/*"
                onChange={(event) => setDniTutorDetras(event.target.files?.[0] ?? null)}
                required
              />
            </>
          ) : null}

          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
            {getInscriptionLegalFullText()}
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={acepta}
              onChange={(event) => setAcepta(event.target.checked)}
              className="mt-1"
              required
            />
            <span>He leido y acepto los terminos y condiciones, y consiento la inscripcion.</span>
          </label>

          <input
            className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900"
            placeholder={
              esMenor
                ? "Firma del Padre/Madre/Tutor legal (nombre y apellidos)"
                : "Firma (nombre y apellidos)"
            }
            value={firma}
            onChange={(event) => setFirma(event.target.value)}
            required
          />

          <button
            className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={loading || inscripcionOk}
          >
            {loading ? "Enviando inscripcion..." : "Completar inscripcion"}
          </button>
          {loading && loadingHint ? (
            <p className="text-center text-sm font-medium text-violet-800">{loadingHint}</p>
          ) : null}
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
