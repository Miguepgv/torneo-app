"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type JugadorDetalle = {
  id: string;
  nombre: string;
  apellidos: string;
  alias: string | null;
  fechaNacimiento: string | null;
  esMenor: boolean;
  fotoUrl: string | null;
  tutorEmail: string | null;
  tutorTelefono: string | null;
  tutorDni: string | null;
  firma: string | null;
  aceptadoAt: string | null;
  ip: string | null;
  userAgent: string | null;
  legalVersion: string | null;
  legalTexto: string | null;
  tutorCorreoEnviadoAt: string | null;
  equipoId: string;
  equipo: { id: string; nombre: string; codigo_inscripcion: string } | null;
  imagenes: {
    dniDelante: string | null;
    dniDetras: string | null;
    dniTutorDelante: string | null;
    dniTutorDetras: string | null;
  };
  imagenesFaltan: {
    dniDelante: boolean;
    dniDetras: boolean;
    dniTutorDelante: boolean;
    dniTutorDetras: boolean;
  };
};

function DocImage({
  label,
  url,
  faltaEnStorage,
}: {
  label: string;
  url: string | null;
  faltaEnStorage?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-800">{label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="max-h-80 w-full rounded-lg border border-slate-200 bg-white object-contain"
          />
        </a>
      ) : (
        <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {faltaEnStorage
            ? "Hay ruta en base de datos pero no se encontro el archivo en Storage."
            : "No consta archivo subido."}
        </p>
      )}
      {url ? (
        <p className="mt-2 text-xs text-slate-600">Toca la imagen para abrirla a tamano completo.</p>
      ) : null}
    </div>
  );
}

export default function AdminJugadorDetallePage() {
  const params = useParams<{ id: string }>();
  const jugadorId = params.id;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [jugador, setJugador] = useState<JugadorDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [descargandoPdf, setDescargandoPdf] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setForbidden(false);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Debes iniciar sesion como administrador.");
      setJugador(null);
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/admin/jugadores/${jugadorId}/detalle`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = (await res.json()) as { error?: string; jugador?: JugadorDetalle };

    if (res.status === 403) {
      setForbidden(true);
      setMessage(json.error ?? "Solo administradores pueden ver esta ficha.");
      setJugador(null);
      setLoading(false);
      return;
    }

    if (!res.ok || !json.jugador) {
      setMessage(json.error ?? "No se pudo cargar el jugador.");
      setJugador(null);
      setLoading(false);
      return;
    }

    setJugador(json.jugador);
    setLoading(false);
  }, [jugadorId, supabase]);

  useEffect(() => {
    if (jugadorId) void cargar();
  }, [jugadorId, cargar]);

  async function onDescargarPdf() {
    setDescargandoPdf(true);
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sesion caducada.");
        return;
      }
      const res = await fetch(`/api/admin/jugadores/${jugadorId}/consent-pdf`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setMessage(j.error ?? "No se pudo descargar el PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } finally {
      setDescargandoPdf(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <p className="text-slate-700">Cargando ficha del jugador...</p>
      </main>
    );
  }

  if (forbidden || !jugador) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-slate-800">{message || "No disponible."}</p>
          <Link className="mt-4 inline-block text-violet-700 underline" href="/admin">
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  const equipoHref = `/admin/equipos/${jugador.equipoId}`;

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link className="text-sm text-violet-700 underline" href={equipoHref}>
              ← Volver al equipo{jugador.equipo ? `: ${jugador.equipo.nombre}` : ""}
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-violet-900">
              Ficha de inscripcion: {jugador.nombre} {jugador.apellidos}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Revisa DNI y fotos subidas para validar que la inscripcion es correcta.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 disabled:opacity-60"
              onClick={() => void onDescargarPdf()}
              disabled={descargandoPdf}
            >
              {descargandoPdf ? "Abriendo PDF..." : "PDF consentimiento"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
              onClick={() => void cargar()}
            >
              Recargar imagenes
            </button>
          </div>
        </div>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Datos personales</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Nombre</dt>
              <dd className="font-medium text-slate-900">
                {jugador.nombre} {jugador.apellidos}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Alias</dt>
              <dd className="font-medium text-slate-900">{jugador.alias || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Fecha de nacimiento</dt>
              <dd className="font-medium text-slate-900">{jugador.fechaNacimiento || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Menor de edad</dt>
              <dd className="font-medium text-slate-900">{jugador.esMenor ? "Si" : "No"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Equipo</dt>
              <dd className="font-medium text-slate-900">
                {jugador.equipo?.nombre ?? "—"} ({jugador.equipo?.codigo_inscripcion ?? "—"})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Firma registrada</dt>
              <dd className="font-medium text-slate-900">{jugador.firma || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Aceptacion (UTC)</dt>
              <dd className="font-medium text-slate-900">{jugador.aceptadoAt || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Version legal</dt>
              <dd className="font-medium text-slate-900">{jugador.legalVersion || "—"}</dd>
            </div>
          </dl>

          {jugador.esMenor ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <h3 className="font-semibold text-amber-950">Tutor (menor)</h3>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-amber-800">Email</dt>
                  <dd className="font-medium text-amber-950">{jugador.tutorEmail || "—"}</dd>
                </div>
                <div>
                  <dt className="text-amber-800">Telefono</dt>
                  <dd className="font-medium text-amber-950">{jugador.tutorTelefono || "—"}</dd>
                </div>
                <div>
                  <dt className="text-amber-800">DNI tutor</dt>
                  <dd className="font-medium text-amber-950">{jugador.tutorDni || "—"}</dd>
                </div>
                <div>
                  <dt className="text-amber-800">Correo enviado al tutor</dt>
                  <dd className="font-medium text-amber-950">
                    {jugador.tutorCorreoEnviadoAt ? jugador.tutorCorreoEnviadoAt : "No consta envio"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Foto de perfil</h2>
          <div className="mt-3">
            {jugador.fotoUrl ? (
              <Image
                src={jugador.fotoUrl}
                alt="Foto de perfil"
                width={200}
                height={200}
                className="h-48 w-48 rounded-xl border border-slate-200 object-cover"
                unoptimized
              />
            ) : (
              <p className="text-sm text-slate-600">Sin foto de perfil.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Documentos subidos (DNI)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Comprueba que las imagenes corresponden al DNI y no a otro documento.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <DocImage
              label="DNI delante"
              url={jugador.imagenes.dniDelante}
              faltaEnStorage={jugador.imagenesFaltan.dniDelante}
            />
            <DocImage
              label="DNI detras"
              url={jugador.imagenes.dniDetras}
              faltaEnStorage={jugador.imagenesFaltan.dniDetras}
            />
            {jugador.esMenor ? (
              <>
                <DocImage
                  label="DNI tutor delante"
                  url={jugador.imagenes.dniTutorDelante}
                  faltaEnStorage={jugador.imagenesFaltan.dniTutorDelante}
                />
                <DocImage
                  label="DNI tutor detras"
                  url={jugador.imagenes.dniTutorDetras}
                  faltaEnStorage={jugador.imagenesFaltan.dniTutorDetras}
                />
              </>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Texto legal aceptado</h2>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {jugador.legalTexto || "(No consta en base de datos)"}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            IP: {jugador.ip || "—"} · User-Agent: {(jugador.userAgent || "—").slice(0, 120)}
          </p>
        </section>

        {message ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-900">
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
