"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Equipo = {
  id: string;
  nombre: string;
  codigo_inscripcion: string;
  logo_url: string | null;
  delegado_id: string | null;
};

type RolUsuario = "admin" | "delegado" | string | null;

type Jugador = {
  id: string;
  nombre: string;
  apellidos: string;
  alias: string | null;
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
  const [nuevoDelEmail, setNuevoDelEmail] = useState("");
  const [nuevoDelTelefono, setNuevoDelTelefono] = useState("");
  const [guardandoDelegado, setGuardandoDelegado] = useState(false);

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
      .select("id,nombre,codigo_inscripcion,logo_url,delegado_id")
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
    if (rol === "delegado" && equipoCargado.delegado_id !== user.id) {
      setForbidden(true);
      setMessage("Solo puedes ver y editar tu propio equipo.");
      setEquipo(null);
      setJugadores([]);
      setLoading(false);
      return;
    }

    const { data: playersData, error: playersError } = await supabase
      .from("jugadores")
      .select("id,nombre,apellidos,alias")
      .eq("equipo_id", equipoId)
      .order("created_at", { ascending: false });

    if (playersError) {
      setMessage(`Error cargando jugadores: ${playersError.message}`);
      setJugadores([]);
    } else {
      setJugadores((playersData as Jugador[]) ?? []);
    }

    setEquipo(equipoCargado);

    if (equipoCargado.delegado_id) {
      const { data: delData } = await supabase
        .from("usuarios")
        .select("correo,telefono")
        .eq("id", equipoCargado.delegado_id)
        .maybeSingle();
      const row = delData as { correo: string | null; telefono: string | null } | null;
      const c = row?.correo ?? "";
      const t = row?.telefono ?? "";
      setDelegadoCorreo(c);
      setDelegadoTelefono(t);
      setNuevoDelEmail(c);
      setNuevoDelTelefono(t);
    } else {
      setDelegadoCorreo("");
      setDelegadoTelefono("");
      setNuevoDelEmail("");
      setNuevoDelTelefono("");
    }

    setLoading(false);
  }

  useEffect(() => {
    if (equipoId) void cargarTodo();
  }, [equipoId]);

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
        emailDelegado: nuevoDelEmail.trim(),
        telefonoDelegado: nuevoDelTelefono.trim(),
      }),
    });
    const json = (await res.json()) as { error?: string; mensaje?: string };
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo actualizar el delegado.");
      setGuardandoDelegado(false);
      return;
    }
    setMessage(json.mensaje ?? "Delegado actualizado.");
    setGuardandoDelegado(false);
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

              {miRol === "admin" ? (
                <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="font-semibold text-amber-950">Delegado del equipo</h3>
                  <p className="mt-1 text-sm text-amber-900">
                    Actual: {delegadoCorreo || "sin delegado"} {delegadoTelefono ? `· ${delegadoTelefono}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-amber-800">
                    Si cambias correo, se invita al nuevo delegado (correo con enlace) y este equipo
                    pasa a su cuenta.
                  </p>
                  <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onActualizarDelegado}>
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
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Jugadores</h2>
                <button
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
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
                      <div>
                        <p className="font-semibold">
                          {jugador.nombre} {jugador.apellidos}
                        </p>
                        <p className="text-sm text-slate-600">
                          Alias: {jugador.alias || "-"}
                        </p>
                      </div>
                      <button
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
                        onClick={() => void onBorrarJugador(jugador.id)}
                        type="button"
                      >
                        Borrar
                      </button>
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
