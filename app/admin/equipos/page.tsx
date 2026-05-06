"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Equipo = {
  id: string;
  nombre: string;
  codigo_inscripcion: string;
};

type RolUsuario = "admin" | "delegado" | "director_campo" | string | null;

export default function AdminEquiposPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [rol, setRol] = useState<RolUsuario>(null);
  const [nombre, setNombre] = useState("");
  const [emailDelegado, setEmailDelegado] = useState("");
  const [telefonoDelegado, setTelefonoDelegado] = useState("");
  const [message, setMessage] = useState("");

  const esAdmin = rol === "admin";
  const esDelegado = rol === "delegado";

  async function cargarEquipos(userId: string | undefined, rolUsuario: RolUsuario) {
    let query = supabase
      .from("equipos")
      .select("id,nombre,codigo_inscripcion")
      .order("created_at", { ascending: false });

    if (rolUsuario === "delegado" && userId) {
      query = query.eq("delegado_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      setMessage(`Error cargando equipos: ${error.message}`);
      setEquipos([]);
    } else {
      setEquipos((data as Equipo[]) ?? []);
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

      await cargarEquipos(user.id, rolUsuario);
    }

    void init();
  }, [supabase]);

  async function crearEquipo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!emailDelegado.trim() || !telefonoDelegado.trim()) {
      setMessage("Debes indicar correo y telefono del delegado.");
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
    await cargarEquipos(user?.id, (perfil?.rol as RolUsuario) ?? rol);
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
    await cargarEquipos(user?.id, (perfil?.rol as RolUsuario) ?? rol);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
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
                <div key={equipo.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <p className="font-semibold">{equipo.nombre}</p>
                    <p className="text-sm text-slate-600">
                      Codigo: {equipo.codigo_inscripcion}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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
