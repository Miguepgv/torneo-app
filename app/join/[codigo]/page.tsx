"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function calcAge(fechaNacimiento: string): number {
  const birth = new Date(fechaNacimiento);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function JoinByCodePage() {
  const params = useParams<{ codigo: string }>();
  const router = useRouter();
  const codigo = params.codigo;

  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [dniDelante, setDniDelante] = useState<File | null>(null);
  const [dniDetras, setDniDetras] = useState<File | null>(null);
  const [dniTutorDelante, setDniTutorDelante] = useState<File | null>(null);
  const [dniTutorDetras, setDniTutorDetras] = useState<File | null>(null);
  const [firma, setFirma] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const edad = fechaNacimiento ? calcAge(fechaNacimiento) : null;
  const esMenor = edad !== null ? edad < 18 : false;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!dniDelante || !dniDetras) {
      setMessage("Debes subir DNI delante y detras.");
      return;
    }
    if (esMenor && (!dniTutorDelante || !dniTutorDetras)) {
      setMessage("Si eres menor, debes subir tambien DNI del padre/madre/tutor.");
      return;
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
    formData.append("fechaNacimiento", fechaNacimiento);
    formData.append("firma", firma);
    formData.append("acepta", "true");
    formData.append("dniDelante", dniDelante);
    formData.append("dniDetras", dniDetras);
    if (dniTutorDelante) formData.append("dniTutorDelante", dniTutorDelante);
    if (dniTutorDetras) formData.append("dniTutorDetras", dniTutorDetras);

    const response = await fetch("/api/join/register", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as { error?: string; ok?: boolean };

    if (!response.ok) {
      setMessage(`Error: ${result.error ?? "No se pudo completar la inscripcion."}`);
      setLoading(false);
      return;
    }

    setMessage("Inscripcion completada correctamente.");
    setLoading(false);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1000);
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

          {esMenor ? (
            <>
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

          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-bold">TERMINOS Y CONDICIONES, DESCARGO DE RESPONSABILIDAD Y USO DE IMAGEN</p>
            <p className="mt-2 font-semibold">Maraton Cofrade 2026</p>
            <p className="mt-2">
              Al marcar la casilla de aceptacion y firmar este documento de forma digital para formalizar mi inscripcion
              en el torneo, declaro bajo mi propia responsabilidad que:
            </p>
            <p className="mt-2">1) Estoy en condiciones fisicas y mentales aptas para la practica del futbol.</p>
            <p className="mt-1">
              2) Asumo los riesgos inherentes del deporte y exonero de responsabilidad a organizacion, arbitros,
              patrocinadores e instalaciones por lesiones, accidentes o danos.
            </p>
            <p className="mt-1">3) Acepto y respetare el reglamento del torneo y conducta deportiva.</p>
            <p className="mt-1">
              4) Autorizo el uso de imagen, nombre, alias y foto de perfil para app, redes y promocion del evento.
            </p>
            <p className="mt-1">
              5) Consiento el tratamiento de datos personales e imagenes de DNI para gestion, verificacion de identidad
              y funcionamiento de la app.
            </p>
            <p className="mt-1 font-semibold">
              Si soy menor de edad, el padre/madre/tutor legal autoriza expresamente mi participacion bajo su
              responsabilidad.
            </p>
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
            placeholder="Firma (nombre y apellidos)"
            value={firma}
            onChange={(event) => setFirma(event.target.value)}
            required
          />

          <button
            className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Enviando..." : "Completar inscripcion"}
          </button>
        </form>

        {message ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-900">{message}</p> : null}
      </div>
    </main>
  );
}
