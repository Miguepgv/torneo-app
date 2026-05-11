"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Equipo = {
  id: string;
  nombre: string;
  codigo_inscripcion: string;
  grupo: string | null;
  logo_url: string | null;
  delegado_id: string | null;
};

type RolUsuario = "admin" | "delegado" | string | null;

type Jugador = {
  id: string;
  nombre: string;
  apellidos: string;
  alias: string | null;
  foto_url: string | null;
};

export default function AdminEquipoDetallePage() {
  const params = useParams<{ id: string }>();
  const equipoId = params.id;
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [jugadores, setJugadores] = useState<Jugador[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [miRol, setMiRol] = useState<RolUsuario>(null);
  const [delegadoCorreo, setDelegadoCorreo] = useState("");
  const [delegadoTelefono, setDelegadoTelefono] = useState("");
  const [delegadoFotoUrl, setDelegadoFotoUrl] = useState("");
  const [nuevoDelNombre, setNuevoDelNombre] = useState("");
  const [nuevoDelApellidos, setNuevoDelApellidos] = useState("");
  const [nuevoDelEmail, setNuevoDelEmail] = useState("");
  const [nuevoDelTelefono, setNuevoDelTelefono] = useState("");
  const [subiendoFotoDelegado, setSubiendoFotoDelegado] = useState(false);
  const [guardandoFotoDelegado, setGuardandoFotoDelegado] = useState(false);
  const [guardandoDelegado, setGuardandoDelegado] = useState(false);
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [guardandoAliasId, setGuardandoAliasId] = useState<string | null>(null);
  const [grupoDraft, setGrupoDraft] = useState("");
  const [guardandoGrupo, setGuardandoGrupo] = useState(false);
  const [descargandoPdfId, setDescargandoPdfId] = useState<string | null>(null);

  async function cargarTodo() {
    setLoading(true);
    setMessage("");
    setForbidden(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: perfil } = user
      ? await supabase.from("usuarios").select("rol").eq("id", user.id).single()
      : { data: null };
    const rol = (perfil?.rol as RolUsuario) ?? null;
    setMiRol(rol);

    if (!user) {
      setMessage("Debes iniciar sesion para gestionar el equipo.");
      setEquipo(null);
      setJugadores([]);
      setLoading(false);
      return;
    }

    if (rol !== "admin" && rol !== "delegado") {
      setForbidden(true);
      setMessage("No tienes permiso para acceder a esta pagina.");
      setEquipo(null);
      setJugadores([]);
      setLoading(false);
      return;
    }

    const { data: teamData, error: teamError } = await supabase
      .from("equipos")
      .select("id,nombre,codigo_inscripcion,grupo,logo_url,delegado_id")
      .eq("id", equipoId)
      .single();

    if (teamError) {
      setMessage(`Error cargando equipo: ${teamError.message}`);
      setEquipo(null);
      setJugadores([]);
      setLoading(false);
      return;
    }

    const equipoCargado = teamData as Equipo;
    setGrupoDraft(equipoCargado.grupo ?? "");
    if (rol === "delegado") {
      const allowedIds = new Set<string>([user.id]);
      const email = (user.email ?? "").trim().toLowerCase();
      if (email) {
        const { data: rows } = await supabase.from("usuarios").select("id").eq("correo", email);
        for (const r of (rows ?? []) as { id: string }[]) allowedIds.add(r.id);
      }
      if (!equipoCargado.delegado_id || !allowedIds.has(equipoCargado.delegado_id)) {
        setForbidden(true);
        setMessage("Solo puedes ver y editar tu propio equipo.");
        setEquipo(null);
        setJugadores([]);
        setLoading(false);
        return;
      }
    }

    const { data: playersData, error: playersError } = await supabase
      .from("jugadores")
      .select("id,nombre,apellidos,alias,foto_url")
      .eq("equipo_id", equipoId)
      .order("created_at", { ascending: false });

    if (playersError) {
      setMessage(`Error cargando jugadores: ${playersError.message}`);
      setJugadores([]);
      setAliasDrafts({});
    } else {
      const rows = (playersData as Jugador[]) ?? [];
      setJugadores(rows);
      const nextDrafts: Record<string, string> = {};
      for (const jugador of rows) {
        nextDrafts[jugador.id] = jugador.alias ?? "";
      }
      setAliasDrafts(nextDrafts);
    }

    setEquipo(equipoCargado);

    if (equipoCargado.delegado_id) {
      let delData: {
        correo: string | null;
        telefono: string | null;
        nombre: string | null;
        apellidos?: string | null;
        foto_url?: string | null;
      } | null = null;

      const full = await supabase
        .from("usuarios")
        .select("correo,telefono,nombre,apellidos,foto_url")
        .eq("id", equipoCargado.delegado_id)
        .maybeSingle();

      if (!full.error && full.data) {
        delData = full.data as typeof delData;
      } else {
        const legacy = await supabase
          .from("usuarios")
          .select("correo,telefono,nombre,foto_url")
          .eq("id", equipoCargado.delegado_id)
          .maybeSingle();
        delData = legacy.data as typeof delData;
        const raw = (delData?.nombre ?? "").trim();
        const sp = raw.indexOf(" ");
        if (sp === -1) {
          delData = { ...delData, nombre: raw, apellidos: "" };
        } else {
          delData = {
            ...delData,
            nombre: raw.slice(0, sp).trim(),
            apellidos: raw.slice(sp + 1).trim(),
          };
        }
      }

      const row = delData;
      const c = row?.correo ?? "";
      const t = row?.telefono ?? "";
      const nom = row?.nombre ?? "";
      const ape = row?.apellidos ?? "";
      const foto = row?.foto_url ?? "";
      setDelegadoCorreo(c);
      setDelegadoTelefono(t);
      setDelegadoFotoUrl(foto);
      setNuevoDelNombre(nom);
      setNuevoDelApellidos(ape);
      setNuevoDelEmail(c);
      setNuevoDelTelefono(t);
    } else {
      setDelegadoCorreo("");
      setDelegadoTelefono("");
      setDelegadoFotoUrl("");
      setNuevoDelNombre("");
      setNuevoDelApellidos("");
      setNuevoDelEmail("");
      setNuevoDelTelefono("");
    }

    setLoading(false);
  }

  useEffect(() => {
    if (equipoId) void cargarTodo();
  }, [equipoId]);

  async function onDescargarPdfConsentimiento(jugadorId: string) {
    setDescargandoPdfId(jugadorId);
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage("Sesion caducada. Vuelve a iniciar sesion.");
        return;
      }
      const res = await fetch(`/api/admin/jugadores/${jugadorId}/consent-pdf`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        let err = res.statusText;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) err = j.error;
        } catch {
          /* ignore */
        }
        setMessage(`No se pudo descargar el PDF: ${err}`);
        return;
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition");
      let filename = `inscripcion-${jugadorId.slice(0, 8)}.pdf`;
      const m = dispo?.match(/filename="([^"]+)"/);
      if (m?.[1]) filename = m[1];
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 120_000);
      setMessage(
        opened
          ? "PDF de consentimiento abierto en una pestaña nueva (puedes guardarlo desde el visor del navegador)."
          : "PDF de consentimiento descargado (el navegador bloqueo abrir pestaña nueva).",
      );
    } finally {
      setDescargandoPdfId(null);
    }
  }

  async function onSubirEscudo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !equipo) return;

    setSubiendoLogo(true);
    setMessage("");

    const extension = file.name.split(".").pop() || "png";
    const path = `equipos/${equipo.id}-${Date.now()}.${extension}`;

    const upload = await supabase.storage.from("escudos").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (upload.error) {
      setMessage(`Error subiendo escudo: ${upload.error.message}`);
      setSubiendoLogo(false);
      return;
    }

    const { data: publicData } = supabase.storage.from("escudos").getPublicUrl(path);
    const logoUrl = publicData.publicUrl;

    const rpc = await supabase.rpc("actualizar_logo_equipo", {
      p_equipo_id: equipo.id,
      p_logo_url: logoUrl,
    });

    if (rpc.error) {
      const fallback = await supabase
        .from("equipos")
        .update({ logo_url: logoUrl })
        .eq("id", equipo.id);
      if (fallback.error) {
        setMessage(`Error actualizando escudo: ${fallback.error.message}`);
        setSubiendoLogo(false);
        return;
      }
    }

    setMessage("Escudo actualizado.");
    setSubiendoLogo(false);
    await cargarTodo();
  }

  async function onBorrarJugador(jugadorId: string) {
    const ok = window.confirm("Quieres borrar este jugador?");
    if (!ok) return;

    const { error } = await supabase.from("jugadores").delete().eq("id", jugadorId);
    if (error) {
      setMessage(`Error borrando jugador: ${error.message}`);
      return;
    }
    setMessage("Jugador borrado.");
    await cargarTodo();
  }

  async function onGuardarAlias(jugadorId: string) {
    const alias = (aliasDrafts[jugadorId] ?? "").trim() || null;
    setGuardandoAliasId(jugadorId);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || !equipo) {
      setMessage("Sesion caducada. Vuelve a iniciar sesion.");
      setGuardandoAliasId(null);
      return;
    }

    const res = await fetch("/api/jugadores/update-alias", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        equipoId: equipo.id,
        jugadorId,
        alias,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(`Error guardando alias: ${json.error ?? "desconocido"}`);
      setGuardandoAliasId(null);
      return;
    }
    setMessage("Alias actualizado.");
    setGuardandoAliasId(null);
    await cargarTodo();
  }

  async function onActualizarDelegado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!equipo || miRol !== "admin") return;
    setGuardandoDelegado(true);
    setMessage("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Sesion caducada. Vuelve a iniciar sesion.");
      setGuardandoDelegado(false);
      return;
    }
    const res = await fetch("/api/admin/update-delegado", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        equipoId: equipo.id,
        nombreDelegado: nuevoDelNombre.trim(),
        apellidosDelegado: nuevoDelApellidos.trim(),
        emailDelegado: nuevoDelEmail.trim(),
        telefonoDelegado: nuevoDelTelefono.trim(),
        fotoDelegadoUrl: delegadoFotoUrl || null,
      }),
    });
    const json = (await res.json()) as {
      error?: string;
      mensaje?: string;
      email_error?: string | null;
      redirect_usado?: string;
      access_email_sent?: boolean;
    };
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo actualizar el delegado.");
      setGuardandoDelegado(false);
      return;
    }
    let texto = json.mensaje ?? "Delegado actualizado.";
    if (json.email_error) {
      texto += ` Error envio correo: ${json.email_error}`;
    }
    if (json.access_email_sent === false && json.redirect_usado) {
      texto += ` (Redirect usado: ${json.redirect_usado}; debe estar en Supabase Auth > URL Configuration).`;
    }
    setMessage(texto);
    setGuardandoDelegado(false);
    await cargarTodo();
  }

  async function onGuardarGrupo() {
    if (!equipo || miRol !== "admin") return;
    setGuardandoGrupo(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Sesion caducada. Vuelve a iniciar sesion.");
      setGuardandoGrupo(false);
      return;
    }
    const res = await fetch("/api/admin/update-equipo-grupo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        equipoId: equipo.id,
        grupo: grupoDraft,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo guardar el grupo.");
      setGuardandoGrupo(false);
      return;
    }
    setMessage("Grupo guardado.");
    setGuardandoGrupo(false);
    await cargarTodo();
  }

  async function onSubirFotoDelegado(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!equipo?.delegado_id) {
      setMessage("Primero guarda un delegado para poder subir su foto.");
      return;
    }

    setSubiendoFotoDelegado(true);
    setMessage("");

    const extension = file.name.split(".").pop() || "png";
    const path = `delegados/${equipo.delegado_id}-${Date.now()}.${extension}`;

    const upload = await supabase.storage.from("escudos").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (upload.error) {
      setMessage(`Error subiendo foto del delegado: ${upload.error.message}`);
      setSubiendoFotoDelegado(false);
      return;
    }

    const { data } = supabase.storage.from("escudos").getPublicUrl(path);
    setDelegadoFotoUrl(data.publicUrl);
    setMessage(
      miRol === "admin"
        ? "Foto del delegado subida. Pulsa Guardar delegado para aplicar."
        : "Foto subida. Pulsa Guardar foto para aplicarla.",
    );
    setSubiendoFotoDelegado(false);
  }

  async function onGuardarFotoDelegado() {
    if (!equipo || !delegadoFotoUrl) return;
    setGuardandoFotoDelegado(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Sesion caducada. Vuelve a iniciar sesion.");
      setGuardandoFotoDelegado(false);
      return;
    }

    const res = await fetch("/api/delegado/update-foto", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        equipoId: equipo.id,
        fotoDelegadoUrl: delegadoFotoUrl,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo guardar la foto del delegado.");
      setGuardandoFotoDelegado(false);
      return;
    }
    setMessage("Foto del delegado guardada.");
    setGuardandoFotoDelegado(false);
    await cargarTodo();
  }

  async function copiarEnlaceInscripcion() {
    if (!equipo) return;
    const enlace = `${window.location.origin}/join/${equipo.codigo_inscripcion}`;
    try {
      await navigator.clipboard.writeText(enlace);
      setMessage("Enlace de inscripcion copiado.");
    } catch {
      setMessage("No se pudo copiar el enlace.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-violet-800">Editar equipo</h1>
          <a
            className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700"
            href="/admin/equipos"
          >
            Volver
          </a>
        </div>

        {loading ? (
          <p>Cargando...</p>
        ) : forbidden ? (
          <p className="text-red-700">{message || "Acceso no permitido."}</p>
        ) : !equipo ? (
          <p>No se encontro el equipo.</p>
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 p-4">
              <p className="text-xl font-bold">{equipo.nombre}</p>
              <p className="text-sm text-slate-600">Codigo: {equipo.codigo_inscripcion}</p>
              <p className="text-sm text-slate-600">Grupo: {equipo.grupo || "Sin asignar"}</p>
              {miRol === "admin" ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="w-32 rounded-lg border border-slate-300 p-2 text-sm"
                    placeholder="Grupo (A, B...)"
                    value={grupoDraft}
                    onChange={(e) => setGrupoDraft(e.target.value.toUpperCase())}
                  />
                  <button
                    className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    type="button"
                    onClick={() => void onGuardarGrupo()}
                    disabled={guardandoGrupo}
                  >
                    {guardandoGrupo ? "Guardando..." : "Guardar grupo"}
                  </button>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-4">
                {equipo.logo_url ? (
                  <Image
                    alt="Escudo equipo"
                    className="h-20 w-20 rounded-full border border-slate-200 object-cover"
                    src={equipo.logo_url}
                    width={80}
                    height={80}
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-500">
                    Sin escudo
                  </div>
                )}

                <label className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white">
                  {subiendoLogo ? "Subiendo..." : "Cambiar escudo"}
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void onSubirEscudo(event)}
                    type="file"
                    disabled={subiendoLogo}
                  />
                </label>
              </div>

              {miRol === "admin" || miRol === "delegado" ? (
                <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-2xl font-bold text-amber-950">Delegado</h3>
                  <div className="mt-3 flex items-center gap-3">
                    {delegadoFotoUrl ? (
                      <Image
                        alt="Foto delegado"
                        className="h-16 w-16 rounded-full border border-amber-300 object-cover"
                        src={delegadoFotoUrl}
                        width={64}
                        height={64}
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-amber-300 text-[10px] text-amber-700">
                        Sin foto
                      </div>
                    )}
                    <div>
                      <p className="text-lg font-bold text-amber-950">
                        {[nuevoDelNombre, nuevoDelApellidos].filter(Boolean).join(" ").trim() ||
                          "Sin delegado"}
                      </p>
                      <p className="text-sm text-amber-900">{delegadoCorreo || "-"}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white">
                      {subiendoFotoDelegado ? "Subiendo foto..." : "Subir foto delegado"}
                      <input
                        accept="image/*"
                        className="hidden"
                        type="file"
                        onChange={(event) => void onSubirFotoDelegado(event)}
                        disabled={subiendoFotoDelegado}
                      />
                    </label>
                    <button
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      type="button"
                      onClick={() => void onGuardarFotoDelegado()}
                      disabled={guardandoFotoDelegado || !delegadoFotoUrl}
                    >
                      {guardandoFotoDelegado ? "Guardando foto..." : "Guardar foto"}
                    </button>
                  </div>
                  {miRol === "admin" ? (
                    <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onActualizarDelegado}>
                    <input
                      className="rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"
                      placeholder="Nombre del delegado"
                      value={nuevoDelNombre}
                      onChange={(e) => setNuevoDelNombre(e.target.value)}
                      required
                    />
                    <input
                      className="rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"
                      placeholder="Apellidos del delegado"
                      value={nuevoDelApellidos}
                      onChange={(e) => setNuevoDelApellidos(e.target.value)}
                      required
                    />
                    <input
                      className="rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"
                      placeholder="Correo del delegado"
                      type="email"
                      value={nuevoDelEmail}
                      onChange={(e) => setNuevoDelEmail(e.target.value)}
                      required
                    />
                    <input
                      className="rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"
                      placeholder="Telefono del delegado"
                      value={nuevoDelTelefono}
                      onChange={(e) => setNuevoDelTelefono(e.target.value)}
                      required
                    />
                    <button
                      className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2"
                      disabled={guardandoDelegado}
                      type="submit"
                    >
                      {guardandoDelegado ? "Guardando..." : "Guardar delegado"}
                    </button>
                    </form>
                  ) : null}
                </section>
              ) : null}

              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                Alta de jugadores solo por enlace de equipo:
                <br />
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <a
                    className="font-semibold underline"
                    href={`/join/${equipo.codigo_inscripcion}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {`${typeof window !== "undefined" ? window.location.origin : ""}/join/${equipo.codigo_inscripcion}`}
                  </a>
                  <button
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => void copiarEnlaceInscripcion()}
                    type="button"
                  >
                    Copiar enlace
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Jugadores</h2>
                  {miRol === "admin" ? (
                    <p className="mt-1 text-sm text-slate-600">
                      Como administrador puedes abrir el PDF de consentimiento de cada jugador (mayores y menores),
                      con el mismo texto legal e identificadores guardados en el momento de la inscripcion.
                    </p>
                  ) : null}
                </div>
                <button
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => void cargarTodo()}
                  type="button"
                >
                  Recargar
                </button>
              </div>
              {jugadores.length === 0 ? (
                <p className="text-slate-600">No hay jugadores todavia.</p>
              ) : (
                <div className="grid gap-2">
                  {jugadores.map((jugador) => (
                    <div
                      key={jugador.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-center gap-3">
                        {jugador.foto_url ? (
                          <Image
                            alt="Foto jugador"
                            className="h-12 w-12 rounded-full border border-slate-200 object-cover"
                            src={jugador.foto_url}
                            width={48}
                            height={48}
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-500">
                            Sin foto
                          </div>
                        )}
                        <div>
                          <p className="font-semibold">
                            {jugador.nombre} {jugador.apellidos}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
                              placeholder="Alias"
                              value={aliasDrafts[jugador.id] ?? ""}
                              onChange={(event) =>
                                setAliasDrafts((prev) => ({
                                  ...prev,
                                  [jugador.id]: event.target.value,
                                }))
                              }
                            />
                            <button
                              className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                              type="button"
                              onClick={() => void onGuardarAlias(jugador.id)}
                              disabled={guardandoAliasId === jugador.id}
                            >
                              {guardandoAliasId === jugador.id ? "Guardando..." : "Guardar alias"}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                        {miRol === "admin" ? (
                          <button
                            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 disabled:opacity-60"
                            onClick={() => void onDescargarPdfConsentimiento(jugador.id)}
                            type="button"
                            disabled={descargandoPdfId === jugador.id}
                            title="Abre el PDF de consentimiento (mismo contenido que consta en base de datos; el correo automatico al tutor solo aplica a menores)."
                          >
                            {descargandoPdfId === jugador.id ? "Abriendo..." : "PDF consentimiento"}
                          </button>
                        ) : null}
                        <button
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
                          onClick={() => void onBorrarJugador(jugador.id)}
                          type="button"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {message ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-900">{message}</p> : null}
      </div>
    </main>
  );
}
