"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Equipo = {
  id: string;
  nombre: string;
  codigo_inscripcion: string;
  grupo?: string | null;
  jugadores_count?: number;
};

type RolUsuario = "admin" | "delegado" | "director_campo" | string | null;

export default function AdminEquiposPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [rol, setRol] = useState<RolUsuario>(null);
  const [nombre, setNombre] = useState("");
  const [nombreDelegado, setNombreDelegado] = useState("");
  const [apellidosDelegado, setApellidosDelegado] = useState("");
  const [emailDelegado, setEmailDelegado] = useState("");
  const [telefonoDelegado, setTelefonoDelegado] = useState("");
  const [message, setMessage] = useState("");
  const [grupoDrafts, setGrupoDrafts] = useState<Record<string, string>>({});
  const [guardandoGrupoId, setGuardandoGrupoId] = useState<string | null>(null);

  const esAdmin = rol === "admin";
  const esDelegado = rol === "delegado";

  async function cargarEquipos(userId: string | undefined, rolUsuario: RolUsuario, userEmail?: string | null) {
    let data: Equipo[] | null = null;
    let error: { message: string } | null = null;

    if (rolUsuario === "delegado") {
      const ids = new Set<string>();
      if (userId) ids.add(userId);
      const email = (userEmail ?? "").trim().toLowerCase();
      if (email) {
        const { data: rows } = await supabase.from("usuarios").select("id").eq("correo", email);
        for (const r of (rows ?? []) as { id: string }[]) ids.add(r.id);
      }
      if (ids.size === 0) {
        data = [];
      } else {
        const q = await supabase
          .from("equipos")
          .select("id,nombre,codigo_inscripcion,grupo")
          .in("delegado_id", [...ids])
          .order("created_at", { ascending: false });
        data = (q.data as Equipo[] | null) ?? [];
        error = q.error ? { message: q.error.message } : null;
      }
    } else {
      const q = await supabase
        .from("equipos")
        .select("id,nombre,codigo_inscripcion,grupo")
        .order("created_at", { ascending: false });
      data = (q.data as Equipo[] | null) ?? [];
      error = q.error ? { message: q.error.message } : null;
    }

    if (error) {
      setMessage(`Error cargando equipos: ${error.message}`);
      setEquipos([]);
    } else {
      const baseEquipos = (data as Equipo[]) ?? [];
      const withCounts = await Promise.all(
        baseEquipos.map(async (equipo) => {
          const { count } = await supabase
            .from("jugadores")
            .select("id", { count: "exact", head: true })
            .eq("equipo_id", equipo.id);
          return {
            ...equipo,
            jugadores_count: count ?? 0,
          };
        }),
      );
      setEquipos(withCounts);
      const groups: Record<string, string> = {};
      for (const e of withCounts) groups[e.id] = (e.grupo ?? "").toUpperCase();
      setGrupoDrafts(groups);
    }
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRol(null);
        setMessage("Inicia sesion para acceder al panel.");
        setEquipos([]);
        setLoading(false);
        return;
      }

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("id", user.id)
        .single();

      const rolUsuario = (perfil?.rol as RolUsuario) ?? null;
      setRol(rolUsuario);

      if (
        rolUsuario !== "admin" &&
        rolUsuario !== "delegado"
      ) {
        setMessage(
          "Este panel solo esta disponible para administradores y delegados.",
        );
        setEquipos([]);
        setLoading(false);
        return;
      }

      await cargarEquipos(user.id, rolUsuario, user.email ?? null);
    }

    void init();
  }, [supabase]);

  async function crearEquipo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (
      !nombreDelegado.trim() ||
      !apellidosDelegado.trim() ||
      !emailDelegado.trim() ||
      !telefonoDelegado.trim()
    ) {
      setMessage(
        "Debes indicar nombre, apellidos, correo y telefono del delegado.",
      );
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Tu sesion ha caducado. Vuelve a iniciar sesion.");
      return;
    }

    const response = await fetch("/api/admin/create-team", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        nombreEquipo: nombre,
        nombreDelegado,
        apellidosDelegado,
        emailDelegado,
        telefonoDelegado,
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      codigo_inscripcion?: string;
    };
    if (!response.ok) {
      setMessage(`Error creando equipo: ${result.error ?? "desconocido"}`);
      return;
    }

    const codigo = result.codigo_inscripcion ?? "(sin codigo)";
    setMessage(`Equipo creado. Codigo inscripcion: ${codigo}`);
    setNombre("");
    setNombreDelegado("");
    setApellidosDelegado("");
    setEmailDelegado("");
    setTelefonoDelegado("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", user?.id ?? "")
      .single();
    await cargarEquipos(user?.id, (perfil?.rol as RolUsuario) ?? rol, user?.email ?? null);
  }

  async function borrarEquipo(id: string) {
    if (!esAdmin) return;
    const confirmar = window.confirm("Quieres borrar este equipo?");
    if (!confirmar) return;

    const { error } = await supabase.from("equipos").delete().eq("id", id);
    if (error) {
      setMessage(`Error borrando equipo: ${error.message}`);
      return;
    }
    setMessage("Equipo borrado.");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", user?.id ?? "")
      .single();
    await cargarEquipos(user?.id, (perfil?.rol as RolUsuario) ?? rol, user?.email ?? null);
  }

  async function guardarGrupo(equipoId: string) {
    if (!esAdmin) return;
    setGuardandoGrupoId(equipoId);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage("Sesion caducada.");
      setGuardandoGrupoId(null);
      return;
    }
    const res = await fetch("/api/admin/update-equipo-grupo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        equipoId,
        grupo: (grupoDrafts[equipoId] ?? "").trim().toUpperCase(),
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(json.error ?? "No se pudo guardar el grupo.");
      setGuardandoGrupoId(null);
      return;
    }
    setMessage("Grupo guardado.");
    setGuardandoGrupoId(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await cargarEquipos(user?.id, rol, user?.email ?? null);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <a className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white" href="/admin/equipos">Equipos</a>
          <a className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700" href="/admin/configuracion">Configuracion torneo</a>
          <a className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700" href="/admin/directo">Directo</a>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-violet-800">
            {esDelegado ? "Mi equipo" : "Panel Admin - Equipos"}
          </h1>
          <a className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700" href="/">
            Inicio
          </a>
        </div>

        {esAdmin ? (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={crearEquipo}>
            <input
              className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Nombre equipo"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Nombre del delegado"
              value={nombreDelegado}
              onChange={(event) => setNombreDelegado(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Apellidos del delegado"
              value={apellidosDelegado}
              onChange={(event) => setApellidosDelegado(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Email delegado (obligatorio)"
              type="email"
              value={emailDelegado}
              onChange={(event) => setEmailDelegado(event.target.value)}
              required
            />
            <input
              className="rounded-lg border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400"
              placeholder="Telefono delegado"
              value={telefonoDelegado}
              onChange={(event) => setTelefonoDelegado(event.target.value)}
              required
            />
            <button
              className="rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white sm:col-span-2"
              type="submit"
            >
              Crear equipo
            </button>
          </form>
        ) : esDelegado ? (
          <p className="text-sm text-slate-600">
            Como delegado solo puedes gestionar tu equipo y compartir el enlace de
            inscripcion para los jugadores.
          </p>
        ) : null}

        {message ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-900">{message}</p> : null}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Equipos</h2>
          {loading ? (
            <p>Cargando...</p>
          ) : equipos.length === 0 ? (
            <p>No hay equipos aun.</p>
          ) : (
            <div className="grid gap-2">
              {equipos.map((equipo) => (
                <div
                  key={equipo.id}
                  className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
                    (equipo.jugadores_count ?? 0) > 12
                      ? "border-red-300 bg-red-50"
                      : "border-slate-200"
                  }`}
                >
                  <div>
                    <p className="font-semibold">{equipo.nombre}</p>
                    <p className="text-sm text-slate-600">
                      Codigo: {equipo.codigo_inscripcion}
                    </p>
                    <p className="text-sm text-slate-600">Grupo: {equipo.grupo || "Sin grupo"}</p>
                    <p
                      className={`text-sm ${
                        (equipo.jugadores_count ?? 0) > 12
                          ? "font-semibold text-red-700"
                          : "text-slate-600"
                      }`}
                    >
                      Jugadores: {equipo.jugadores_count ?? 0}
                      {(equipo.jugadores_count ?? 0) > 12
                        ? " (supera el limite recomendado de 12)"
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {esAdmin ? (
                      <>
                        <input
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          placeholder="Grupo"
                          value={grupoDrafts[equipo.id] ?? ""}
                          onChange={(event) =>
                            setGrupoDrafts((prev) => ({
                              ...prev,
                              [equipo.id]: event.target.value.toUpperCase(),
                            }))
                          }
                        />
                        <button
                          className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                          onClick={() => void guardarGrupo(equipo.id)}
                          type="button"
                          disabled={guardandoGrupoId === equipo.id}
                        >
                          {guardandoGrupoId === equipo.id ? "Guardando..." : "Guardar grupo"}
                        </button>
                      </>
                    ) : null}
                    <a
                      className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white"
                      href={`/admin/equipos/${equipo.id}`}
                    >
                      Editar
                    </a>
                    {esAdmin ? (
                      <button
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
                        onClick={() => void borrarEquipo(equipo.id)}
                        type="button"
                      >
                        Borrar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
