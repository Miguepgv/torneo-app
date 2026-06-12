"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { jugadorNombreYAlias, partesJugadorDisplay, unwrapJugadorJoin } from "@/lib/jugador-display";

type Partido = {
  id: string;
  fase: string | null;
  estado: string | null;
  fecha_hora: string | null;
  goles_local: number | null;
  goles_visitante: number | null;
  equipo_local_id: string | null;
  equipo_visitante_id: string | null;
};

type JugadorLite = {
  id: string;
  equipo_id: string;
  nombre: string;
  apellidos: string;
  alias: string | null;
  foto_url: string | null;
};

type JugadorJoin = { nombre: string; apellidos: string; alias: string | null; foto_url?: string | null } | null;

type GolLite = {
  id: string;
  minuto: number | null;
  jugador_id: string | null;
  equipo_id: string | null;
  propia_meta: boolean | null;
  created_at?: string | null;
  jugadores: JugadorJoin;
};

type TarjLite = {
  id: string;
  jugador_id: string | null;
  equipo_id: string | null;
  tipo: string;
  created_at?: string | null;
  jugadores: JugadorJoin;
};

type LivePartidoExtras = {
  amarillas_local?: number | null;
  amarillas_visitante?: number | null;
  rojas_local?: number | null;
  rojas_visitante?: number | null;
  rojas_agresion_local?: number | null;
  rojas_agresion_visitante?: number | null;
} | null;

type GoalModalState = {
  partidoId: string;
  beneficiario: "local" | "visitante";
  equipoLocalId: string;
  equipoVisitId: string;
};

function nombreJugador(j: JugadorLite | JugadorJoin) {
  return jugadorNombreYAlias(unwrapJugadorJoin(j));
}

function JugadorNombreAliasBlock({ j }: { j: JugadorLite | JugadorJoin }) {
  const { nombreCompleto, alias } = partesJugadorDisplay(unwrapJugadorJoin(j));
  return (
    <span className="text-left">
      <span className="block font-semibold text-slate-900">{nombreCompleto}</span>
      {alias ? <span className="block text-[11px] font-semibold text-violet-600">{alias}</span> : null}
    </span>
  );
}

function labelTarjeta(tipo: string) {
  if (tipo === "amarilla") return "Amarilla";
  if (tipo === "doble_amarilla") return "Doble amarilla";
  if (tipo === "roja") return "Roja";
  if (tipo === "roja_agresion") return "Roja (agresión)";
  return tipo;
}

function eventSortKey(createdAt: string | null | undefined, minuto: number | null | undefined, id: string): number {
  if (createdAt) {
    const t = new Date(createdAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (minuto != null && !Number.isNaN(Number(minuto))) return Number(minuto) * 60_000;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

function minutoLabel(minuto: number | null, createdAt: string | null | undefined): string {
  if (minuto != null && minuto >= 0) return `${minuto}'`;
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    }
  }
  return "—";
}

function avatarFrom(j: JugadorJoin, fallbackLetter: string) {
  const url = j?.foto_url?.trim();
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-200 text-xs font-bold text-slate-600">
      {(fallbackLetter || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function cardGlyph(tipo: string) {
  if (tipo === "amarilla") return <span className="inline-block h-3 w-2 rounded-sm bg-yellow-400 ring-1 ring-yellow-600" title="Amarilla" />;
  if (tipo === "doble_amarilla")
    return (
      <span className="inline-flex gap-0.5" title="Doble amarilla">
        <span className="inline-block h-3 w-2 rounded-sm bg-yellow-400 ring-1 ring-yellow-600" />
        <span className="inline-block h-3 w-2 rounded-sm bg-yellow-400 ring-1 ring-yellow-600" />
      </span>
    );
  if (tipo === "roja") return <span className="inline-block h-3 w-2 rounded-sm bg-red-600 ring-1 ring-red-900" title="Roja" />;
  if (tipo === "roja_agresion")
    return <span className="inline-block h-3 w-2 rounded-sm bg-red-950 ring-1 ring-black" title="Roja por agresión" />;
  return null;
}

function estadoNorm(estado: string | null | undefined) {
  return (estado ?? "pendiente").toLowerCase();
}

function partidoSortActivos(a: Partido, b: Partido) {
  const rank = (e: string) => (e === "jugandose" ? 0 : e === "pendiente" ? 1 : 2);
  const dr = rank(estadoNorm(a.estado)) - rank(estadoNorm(b.estado));
  if (dr !== 0) return dr;
  const ta = a.fecha_hora ? new Date(a.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
  const tb = b.fecha_hora ? new Date(b.fecha_hora).getTime() : Number.POSITIVE_INFINITY;
  return ta - tb;
}

function partidoSortFinalizados(a: Partido, b: Partido) {
  const ta = a.fecha_hora ? new Date(a.fecha_hora).getTime() : 0;
  const tb = b.fecha_hora ? new Date(b.fecha_hora).getTime() : 0;
  return tb - ta;
}

export default function AdminDirectoPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rol, setRol] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [equipos, setEquipos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [livePartido, setLivePartido] = useState<Partido | null>(null);
  const [liveExtras, setLiveExtras] = useState<LivePartidoExtras>(null);
  const [jugadoresLocal, setJugadoresLocal] = useState<JugadorLite[]>([]);
  const [jugadoresVisitante, setJugadoresVisitante] = useState<JugadorLite[]>([]);
  const [goles, setGoles] = useState<GolLite[]>([]);
  const [tarjetas, setTarjetas] = useState<TarjLite[]>([]);
  const [goalModal, setGoalModal] = useState<GoalModalState | null>(null);
  const [goalModo, setGoalModo] = useState<"normal" | "pp">("normal");
  const [goalJugadorId, setGoalJugadorId] = useState<string>("");
  const [goalMinuto, setGoalMinuto] = useState<string>("");
  const [savingGoal, setSavingGoal] = useState(false);
  const savingGoalRef = useRef(false);
  const [dcEmail, setDcEmail] = useState("");
  const [dcNombre, setDcNombre] = useState("");
  const [dcApellidos, setDcApellidos] = useState("");
  const [dcTelefono, setDcTelefono] = useState("");
  const [dcLoading, setDcLoading] = useState(false);
  const [directoTab, setDirectoTab] = useState<"activos" | "finalizados">("activos");

  const expandedIdRef = useRef<string | null>(null);
  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  async function load() {
    const [{ data: pData, error: pErr }, { data: eData }] = await Promise.all([
      supabase
        .from("partidos")
        .select("id,fase,estado,fecha_hora,goles_local,goles_visitante,equipo_local_id,equipo_visitante_id")
        .order("fecha_hora", { ascending: true, nullsFirst: false }),
      supabase.from("equipos").select("id,nombre"),
    ]);
    if (pErr) {
      setMsg(`Error: ${pErr.message}`);
      return;
    }
    setPartidos((pData as Partido[]) ?? []);
    const map: Record<string, string> = {};
    for (const e of (eData ?? []) as { id: string; nombre: string }[]) map[e.id] = e.nombre;
    setEquipos(map);
  }

  useEffect(() => {
    async function loadRoleAndData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRol(null);
        setCheckingRole(false);
        return;
      }
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      const r = (data?.rol as string | undefined) ?? null;
      setRol(r);
      setCheckingRole(false);
      if (r === "admin" || r === "director_campo") {
        await load();
      }
    }
    void loadRoleAndData();
  }, [supabase]);

  const fetchLiveDetail = useCallback(
    async (partidoId: string) => {
      setLiveLoading(true);
      setLivePartido(null);
      setLiveExtras(null);
      setJugadoresLocal([]);
      setJugadoresVisitante([]);
      setGoles([]);
      setTarjetas([]);
      setMsg("");
      const token = await getToken();
      if (!token) {
        setMsg("No hay sesion: entra como organizador para usar Directo.");
        setLiveLoading(false);
        return;
      }
      const res = await fetch(`/api/admin/directo?partido_id=${encodeURIComponent(partidoId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (expandedIdRef.current !== partidoId) {
        setLiveLoading(false);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        partido?: Partido & Record<string, unknown>;
        jugadores_local?: JugadorLite[];
        jugadores_visitante?: JugadorLite[];
        goles?: GolLite[];
        tarjetas?: TarjLite[];
      };
      if (!res.ok) {
        setMsg(json.error ?? "No se pudieron cargar los datos del partido.");
        setLiveLoading(false);
        return;
      }
      if (expandedIdRef.current !== partidoId) {
        setLiveLoading(false);
        return;
      }
      if (json.partido) {
        const p = json.partido as Partido & Record<string, number | null | undefined>;
        setLivePartido({
          id: p.id,
          fase: p.fase ?? null,
          estado: p.estado ?? null,
          fecha_hora: p.fecha_hora ?? null,
          goles_local: p.goles_local ?? null,
          goles_visitante: p.goles_visitante ?? null,
          equipo_local_id: p.equipo_local_id ?? null,
          equipo_visitante_id: p.equipo_visitante_id ?? null,
        });
        setLiveExtras({
          amarillas_local: p.amarillas_local ?? null,
          amarillas_visitante: p.amarillas_visitante ?? null,
          rojas_local: p.rojas_local ?? null,
          rojas_visitante: p.rojas_visitante ?? null,
          rojas_agresion_local: p.rojas_agresion_local ?? null,
          rojas_agresion_visitante: p.rojas_agresion_visitante ?? null,
        });
      }
      setJugadoresLocal((json.jugadores_local ?? []) as JugadorLite[]);
      setJugadoresVisitante((json.jugadores_visitante ?? []) as JugadorLite[]);
      setGoles((json.goles ?? []) as GolLite[]);
      setTarjetas((json.tarjetas ?? []) as TarjLite[]);
      setLiveLoading(false);
      await load();
    },
    [getToken],
  );

  useEffect(() => {
    if (expandedId) void fetchLiveDetail(expandedId);
  }, [expandedId, fetchLiveDetail]);

  async function onCreateDirectorCampo() {
    setMsg("");
    if (!dcEmail.trim() || !dcNombre.trim()) {
      setMsg("Para crear director de campo necesitas al menos correo y nombre.");
      return;
    }
    setDcLoading(true);
    const token = await getToken();
    if (!token) {
      setMsg("Sesion caducada.");
      setDcLoading(false);
      return;
    }
    const res = await fetch("/api/admin/create-director-campo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: dcEmail.trim().toLowerCase(),
        nombre: dcNombre.trim(),
        apellidos: dcApellidos.trim(),
        telefono: dcTelefono.trim(),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      mensaje?: string;
      access_email_sent?: boolean;
      email_error?: string;
    };
    if (!res.ok) {
      setMsg(json.error ?? "No se pudo crear el director de campo.");
      setDcLoading(false);
      return;
    }
    setMsg(
      json.mensaje ??
        (json.access_email_sent
          ? "Director de campo creado. Se envio correo para definir contrasena."
          : `Director creado, pero no se pudo enviar correo automatico.${json.email_error ? ` (${json.email_error})` : ""}`),
    );
    setDcEmail("");
    setDcNombre("");
    setDcApellidos("");
    setDcTelefono("");
    setDcLoading(false);
  }

  useEffect(() => {
    if (!goalModal) {
      setGoalJugadorId("");
      setGoalMinuto("");
      setGoalModo("normal");
      return;
    }
    const scoringTeamId = goalModal.beneficiario === "local" ? goalModal.equipoLocalId : goalModal.equipoVisitId;
    const rivalTeamId = goalModal.beneficiario === "local" ? goalModal.equipoVisitId : goalModal.equipoLocalId;
    const team = goalModo === "normal" ? scoringTeamId : rivalTeamId;
    const pool = [...jugadoresLocal, ...jugadoresVisitante].filter((jug) => jug.equipo_id === team);
    setGoalJugadorId(pool[0]?.id ?? "");
  }, [goalModal, goalModo, jugadoresLocal, jugadoresVisitante]);

  const timeline = useMemo(() => {
    if (!livePartido?.equipo_local_id || !livePartido.equipo_visitante_id) return [];
    const lid = livePartido.equipo_local_id;
    type Row =
      | { k: "gol"; id: string; sk: number; g: GolLite }
      | { k: "tarjeta"; id: string; sk: number; t: TarjLite };
    const rows: Row[] = [];
    for (const g of goles) {
      rows.push({ k: "gol", id: `g-${g.id}`, sk: eventSortKey(g.created_at, g.minuto, g.id), g });
    }
    for (const t of tarjetas) {
      rows.push({ k: "tarjeta", id: `t-${t.id}`, sk: eventSortKey(t.created_at, null, t.id), t });
    }
    rows.sort((a, b) => a.sk - b.sk || a.id.localeCompare(b.id));
    return rows.map((row) => {
      if (row.k === "gol") {
        const g = row.g;
        const authorIsLocal = g.equipo_id === lid;
        // Gol normal: lado del autor. Propia puerta: lado del equipo que SUM en el marcador (el rival del autor).
        const alignLeft = g.propia_meta ? !authorIsLocal : authorIsLocal;
        return { ...row, alignLeft, label: minutoLabel(g.minuto, g.created_at) };
      }
      const t = row.t;
      const eid = t.equipo_id;
      const alignLeft = eid === lid;
      return { ...row, alignLeft, label: minutoLabel(null, t.created_at) };
    });
  }, [goles, tarjetas, livePartido]);

  const partidosActivos = useMemo(
    () => partidos.filter((p) => estadoNorm(p.estado) !== "finalizado").sort(partidoSortActivos),
    [partidos],
  );
  const partidosFinalizados = useMemo(
    () => partidos.filter((p) => estadoNorm(p.estado) === "finalizado").sort(partidoSortFinalizados),
    [partidos],
  );
  const partidosVisibles = directoTab === "activos" ? partidosActivos : partidosFinalizados;

  async function setEstado(id: string, estado: string) {
    setMsg("");
    const token = await getToken();
    if (!token) {
      setMsg("No hay sesion: entra como organizador para usar Directo.");
      return false;
    }
    const res = await fetch("/api/admin/calendario", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "set_estado", id, estado }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      knockout_sync?: { groupsComplete?: boolean; finalizedGroups?: string[]; updated?: number };
    };
    if (!res.ok) {
      setMsg(json.error ?? "No se ha podido cambiar el estado del partido.");
      return false;
    }
    const koSync = json.knockout_sync;
    if (estado === "finalizado" && koSync && (koSync.updated ?? 0) > 0) {
      if (koSync.groupsComplete) {
        setMsg(
          `Fase de grupos completada: ${koSync.updated} plaza(s) del cuadro actualizadas (incluye mejores clasificados M2C, M3E…).`,
        );
      } else {
        const gs = (koSync.finalizedGroups ?? []).join(", ");
        setMsg(
          `Grupo(s) finalizado(s) (${gs}): ${koSync.updated} plaza(s) del cuadro actualizadas. Los slots M (mejores 2.º/3.º) se completarán cuando acaben todos los grupos.`,
        );
      }
    }
    if (estado === "finalizado") {
      if (expandedId === id) setExpandedId(null);
      setDirectoTab("activos");
    }
    if (estado === "jugandose") setDirectoTab("activos");
    await load();
    return true;
  }

  async function handleComenzar(id: string) {
    const ok = await setEstado(id, "jugandose");
    if (!ok) return;
    setExpandedId(id);
  }

  async function postDirecto(payload: Record<string, unknown>): Promise<boolean> {
    setMsg("");
    const token = await getToken();
    if (!token) {
      setMsg("Sesion perdida.");
      return false;
    }
    const res = await fetch("/api/admin/directo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMsg(json.error ?? "Error guardando cambios.");
      return false;
    }
    if (expandedId) await fetchLiveDetail(expandedId);
    return true;
  }

  function openGoalModal(
    ctx: Pick<GoalModalState, "partidoId" | "beneficiario" | "equipoLocalId" | "equipoVisitId">,
  ) {
    setGoalModal(ctx);
    setGoalModo("normal");
    setGoalMinuto("");
  }

  async function submitGoalModal() {
    if (!goalModal || !goalJugadorId || savingGoalRef.current) return;
    const lid = goalModal.equipoLocalId;
    const vid = goalModal.equipoVisitId;
    const scoringTeamId = goalModal.beneficiario === "local" ? lid : vid;
    const rivalTeamId = goalModal.beneficiario === "local" ? vid : lid;

    const j = [...jugadoresLocal, ...jugadoresVisitante].find((x) => x.id === goalJugadorId);
    if (!j) {
      setMsg("Selecciona un jugador válido.");
      return;
    }

    let propia_meta = false;
    if (goalModo === "normal") {
      if (j.equipo_id !== scoringTeamId) {
        setMsg("El jugador debe ser del equipo que marca.");
        return;
      }
    } else {
      if (j.equipo_id !== rivalTeamId) {
        setMsg("En propia puerta el autor del gol es jugador del rival (quien marca en propia).");
        return;
      }
      propia_meta = true;
    }

    const mn = goalMinuto.trim();
    savingGoalRef.current = true;
    setSavingGoal(true);
    try {
      const ok = await postDirecto({
        action: "add_goal",
        partido_id: goalModal.partidoId,
        jugador_id: j.id,
        equipo_id: j.equipo_id,
        propia_meta,
        minuto: mn === "" ? null : Number(mn),
      });
      if (ok) setGoalModal(null);
    } finally {
      savingGoalRef.current = false;
      setSavingGoal(false);
    }
  }

  function n(id: string | null) {
    if (!id) return "—";
    return equipos[id] ?? "Equipo";
  }

  function renderJugadorRow(partidoPid: string, j: JugadorLite, editable: boolean) {
    return (
      <div
        key={j.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm"
      >
        <span className="flex items-center gap-2 font-medium text-slate-800">
          {avatarFrom({ nombre: j.nombre, apellidos: j.apellidos, alias: j.alias, foto_url: j.foto_url }, nombreJugador(j))}
          <JugadorNombreAliasBlock j={j} />
        </span>
        {editable ? (
          <span className="flex flex-wrap gap-1">
            <button
              type="button"
              title="Tarjeta amarilla (se guarda al pulsar)"
              className="rounded bg-yellow-300 px-1.5 py-0.5 text-[11px] font-semibold text-yellow-950"
              onClick={() =>
                void postDirecto({
                  action: "add_tarjeta",
                  partido_id: partidoPid,
                  jugador_id: j.id,
                  equipo_id: j.equipo_id,
                  tipo: "amarilla",
                })
              }
            >
              TA
            </button>
            <button
              type="button"
              title="Doble amarilla (se guarda al pulsar)"
              className="rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white"
              onClick={() =>
                void postDirecto({
                  action: "add_tarjeta",
                  partido_id: partidoPid,
                  jugador_id: j.id,
                  equipo_id: j.equipo_id,
                  tipo: "doble_amarilla",
                })
              }
            >
              DA
            </button>
            <button
              type="button"
              title="Tarjeta roja (se guarda al pulsar)"
              className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
              onClick={() =>
                void postDirecto({
                  action: "add_tarjeta",
                  partido_id: partidoPid,
                  jugador_id: j.id,
                  equipo_id: j.equipo_id,
                  tipo: "roja",
                })
              }
            >
              TR
            </button>
            <button
              type="button"
              title="Roja por agresión (se guarda al pulsar)"
              className="rounded bg-red-900 px-1.5 py-0.5 text-[11px] font-semibold text-red-50"
              onClick={() =>
                void postDirecto({
                  action: "add_tarjeta",
                  partido_id: partidoPid,
                  jugador_id: j.id,
                  equipo_id: j.equipo_id,
                  tipo: "roja_agresion",
                })
              }
            >
              Agr
            </button>
          </span>
        ) : null}
      </div>
    );
  }

  const goalPickerList = useMemo(() => {
    if (!goalModal) return [];
    const scoring = goalModal.beneficiario === "local" ? goalModal.equipoLocalId : goalModal.equipoVisitId;
    const rival = goalModal.beneficiario === "local" ? goalModal.equipoVisitId : goalModal.equipoLocalId;
    const team = goalModo === "normal" ? scoring : rival;
    return [...jugadoresLocal, ...jugadoresVisitante].filter((j) => j.equipo_id === team);
  }, [goalModal, goalModo, jugadoresLocal, jugadoresVisitante]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">Comprobando permisos...</p>
        </div>
      </main>
    );
  }

  if (!rol || (rol !== "admin" && rol !== "director_campo")) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            No tienes acceso a Directo. Esta seccion es solo para admin y director de campo.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {rol === "admin" ? (
            <a
              className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm"
              href="/admin/equipos"
            >
              Equipos
            </a>
          ) : null}
          {rol === "admin" ? (
            <a
              className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm"
              href="/admin/configuracion"
            >
              Configuracion torneo
            </a>
          ) : null}
          {rol === "admin" ? (
            <a
              className="rounded-lg border border-violet-300 px-2.5 py-1.5 text-xs font-semibold text-violet-700 sm:px-3 sm:py-2 sm:text-sm"
              href="/admin/calendario"
            >
              Calendario
            </a>
          ) : null}
          <a
            className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:py-2 sm:text-sm"
            href="/admin/directo"
          >
            Directo
          </a>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-violet-800">Directo</h1>
          <p className="mt-1 text-slate-700">
            Pulsa el <strong>+</strong> junto al marcador para sumar un gol (autor o propia puerta). Las tarjetas se guardan al instante al pulsar{" "}
            <strong>TA / DA / TR / Agr</strong>. Los partidos finalizados pasan a la pestaña <strong>Finalizados</strong>, donde puedes corregir incidencias.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
          <button
            type="button"
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
              directoTab === "activos" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            onClick={() => {
              setDirectoTab("activos");
              setExpandedId(null);
            }}
          >
            En directo
            {partidosActivos.length > 0 ? (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${directoTab === "activos" ? "bg-white/25" : "bg-violet-100 text-violet-800"}`}>
                {partidosActivos.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
              directoTab === "finalizados" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            onClick={() => {
              setDirectoTab("finalizados");
              setExpandedId(null);
            }}
          >
            Finalizados
            {partidosFinalizados.length > 0 ? (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${directoTab === "finalizados" ? "bg-white/25" : "bg-slate-300 text-slate-800"}`}>
                {partidosFinalizados.length}
              </span>
            ) : null}
          </button>
        </div>

        {directoTab === "activos" ? (
          <p className="text-xs text-slate-600">
            Primero los que se están jugando, después los pendientes. Al finalizar un partido desaparece de aquí.
          </p>
        ) : (
          <p className="text-xs text-slate-600">
            Partidos ya cerrados. Puedes abrirlos para revisar o corregir goles y tarjetas; los cambios actualizan clasificación y cuadro.
          </p>
        )}

        {rol === "admin" ? (
          <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
            <h2 className="text-base font-bold text-violet-900">Alta de director de campo</h2>
            <p className="mt-1 text-xs text-violet-800">
              Crea acceso para editar marcadores en directo. Se enviara un correo con enlace para crear la contrasena.
              Si ya lo diste de alta y no llego el correo, vuelve a pulsar con el mismo email para reenviarlo.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input className="rounded-lg border border-slate-300 p-2 text-sm" placeholder="Correo" type="email" value={dcEmail} onChange={(e) => setDcEmail(e.target.value)} />
              <input className="rounded-lg border border-slate-300 p-2 text-sm" placeholder="Nombre" value={dcNombre} onChange={(e) => setDcNombre(e.target.value)} />
              <input className="rounded-lg border border-slate-300 p-2 text-sm" placeholder="Apellidos (opcional)" value={dcApellidos} onChange={(e) => setDcApellidos(e.target.value)} />
              <input className="rounded-lg border border-slate-300 p-2 text-sm" placeholder="Telefono (opcional)" value={dcTelefono} onChange={(e) => setDcTelefono(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => void onCreateDirectorCampo()}
              disabled={dcLoading}
              className="mt-3 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {dcLoading ? "Creando..." : "Crear director de campo"}
            </button>
          </section>
        ) : null}

        <div className="grid gap-4">
          {partidosVisibles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              {directoTab === "activos"
                ? "No hay partidos pendientes ni en juego. Cuando finalices encuentros aparecerán en la pestaña Finalizados."
                : "Aún no hay partidos finalizados."}
            </p>
          ) : null}
          {partidosVisibles.map((p) => {
            const abierto = expandedId === p.id;
            const tieneEquipos = Boolean(p.equipo_local_id && p.equipo_visitante_id);
            const enJuego = estadoNorm(p.estado) === "jugandose";
            const finalizado = estadoNorm(p.estado) === "finalizado";
            const permiteEdiciones =
              tieneEquipos && (enJuego || (directoTab === "finalizados" && finalizado));

            return (
              <div
                key={p.id}
                className={`rounded-lg border p-3 shadow-sm ${
                  finalizado && directoTab === "finalizados"
                    ? "border-slate-300 bg-slate-50"
                    : enJuego
                      ? "border-emerald-300 bg-emerald-50/30"
                      : "border-slate-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setExpandedId(abierto ? null : p.id)}
                >
                  <p className="font-semibold">
                    {n(p.equipo_local_id)} <span className="text-xl text-emerald-700">{p.goles_local ?? 0}</span>
                    {" - "}
                    <span className="text-xl text-emerald-700">{p.goles_visitante ?? 0}</span> {n(p.equipo_visitante_id)}
                  </p>
                  <p className="text-sm text-slate-600">
                    {p.fase ?? "—"} · {p.fecha_hora ? new Date(p.fecha_hora).toLocaleString("es-ES") : "Sin fecha"} ·{" "}
                    <span
                      className={
                        enJuego ? "font-semibold text-emerald-700" : finalizado ? "font-semibold text-slate-700" : "text-slate-600"
                      }
                    >
                      {p.estado ?? "pendiente"}
                    </span>
                    {!abierto ? <span className="ml-2 text-violet-600">Mostrar incidentes ▾</span> : null}
                  </p>
                </button>

                <div className="mt-2 flex flex-wrap gap-2">
                  {directoTab === "activos" ? (
                    <>
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => void setEstado(p.id, "pendiente")}>
                        Pendiente
                      </button>
                      <button className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700" onClick={() => void handleComenzar(p.id)}>
                        Comenzar
                      </button>
                      <button className="rounded border border-violet-300 px-2 py-1 text-xs text-violet-700" onClick={() => void setEstado(p.id, "finalizado")}>
                        Finalizar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="rounded border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                        onClick={() => void setEstado(p.id, "jugandose")}
                      >
                        Reabrir (jugándose)
                      </button>
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => void setEstado(p.id, "pendiente")}>
                        Marcar pendiente
                      </button>
                    </>
                  )}
                  {!abierto ? (
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(p.id);
                      }}
                    >
                      Solo ver incidencias
                    </button>
                  ) : null}
                </div>

                {!tieneEquipos && abierto ? (
                  <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-900">
                    Este partido aún no tiene equipos local y visitante. Cuando estén asignados aparecerán plantillas y cronología.
                  </p>
                ) : null}

                {abierto && tieneEquipos ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {expandedId === p.id && liveLoading ? (
                      <p className="text-sm text-slate-500">Cargando plantillas e incidencias…</p>
                    ) : null}

                    {expandedId === p.id && !liveLoading && livePartido?.id !== p.id ? (
                      <p className="text-sm font-medium text-amber-900">
                        No se ha podido cargar el detalle. Revisa el mensaje inferior o vuelve a abrir esta tarjeta.
                      </p>
                    ) : null}

                    {expandedId === p.id && !liveLoading && livePartido?.id === p.id ? (
                      <>
                        <div className="mb-6 rounded-xl bg-slate-900 px-4 py-4 text-white">
                          <p className="mb-3 text-center text-sm opacity-90">Marcador · toca el + para anotar gol</p>
                          <div className="flex flex-wrap items-center justify-center gap-3 text-xl font-bold sm:text-2xl">
                            <span className="max-w-[40%] truncate text-right text-base font-semibold opacity-95 sm:text-lg">
                              {n(livePartido.equipo_local_id)}
                            </span>
                            <span className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-2">
                              <span className="text-3xl sm:text-4xl">{livePartido.goles_local ?? 0}</span>
                              {permiteEdiciones && livePartido.equipo_local_id && livePartido.equipo_visitante_id ? (
                                <button
                                  type="button"
                                  title="Gol para el local"
                                  className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openGoalModal({
                                      partidoId: livePartido.id,
                                      beneficiario: "local",
                                      equipoLocalId: livePartido.equipo_local_id!,
                                      equipoVisitId: livePartido.equipo_visitante_id!,
                                    });
                                  }}
                                >
                                  +
                                </button>
                              ) : null}
                            </span>
                            <span className="opacity-75">—</span>
                            <span className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-2">
                              {permiteEdiciones && livePartido.equipo_local_id && livePartido.equipo_visitante_id ? (
                                <button
                                  type="button"
                                  title="Gol para el visitante"
                                  className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-400"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    openGoalModal({
                                      partidoId: livePartido.id,
                                      beneficiario: "visitante",
                                      equipoLocalId: livePartido.equipo_local_id!,
                                      equipoVisitId: livePartido.equipo_visitante_id!,
                                    });
                                  }}
                                >
                                  +
                                </button>
                              ) : null}
                              <span className="text-3xl sm:text-4xl">{livePartido.goles_visitante ?? 0}</span>
                            </span>
                            <span className="max-w-[40%] truncate text-base font-semibold opacity-95 sm:text-lg">{n(livePartido.equipo_visitante_id)}</span>
                          </div>

                          {liveExtras ? (
                            <p className="mt-3 text-center text-[11px] font-normal opacity-85">
                              L: Amarillas {liveExtras.amarillas_local ?? 0} · Rojas {liveExtras.rojas_local ?? 0}
                              {(liveExtras.rojas_agresion_local ?? 0) > 0 ? ` · Agr. ${liveExtras.rojas_agresion_local}` : ""}
                              {" — "}V: Amarillas {liveExtras.amarillas_visitante ?? 0} · Rojas {liveExtras.rojas_visitante ?? 0}
                              {(liveExtras.rojas_agresion_visitante ?? 0) > 0 ? ` · Agr. ${liveExtras.rojas_agresion_visitante}` : ""}
                            </p>
                          ) : null}
                          {!permiteEdiciones ? (
                            <p className="mt-2 text-center text-xs text-amber-200">
                              Para registrar incidencias el partido debe estar en estado <strong>jugandose</strong>.
                            </p>
                          ) : finalizado ? (
                            <p className="mt-2 text-center text-xs text-amber-100">
                              Partido finalizado: puedes corregir goles y tarjetas. Los cambios se reflejan en clasificación y cuadro.
                            </p>
                          ) : null}
                        </div>

                        <div className="mb-8">
                          <h3 className="mb-3 text-sm font-semibold text-slate-800">Cronología del partido</h3>
                          {timeline.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                              Todavía no hay goles ni tarjetas en este encuentro.
                            </p>
                          ) : (
                            <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-4">
                              {timeline.map((ev) =>
                                ev.k === "gol" ? (
                                  <div
                                    key={ev.id}
                                    className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm"
                                  >
                                    {ev.alignLeft ? (
                                      <div className="flex items-center gap-2 justify-self-start">
                                        {avatarFrom(ev.g.jugadores, nombreJugador(ev.g.jugadores))}
                                        <span className="text-left">
                                          <JugadorNombreAliasBlock j={ev.g.jugadores} />
                                          <span className="ml-1 inline-block align-middle text-base leading-none text-slate-800" aria-hidden>
                                            ⚽
                                          </span>
                                          {ev.g.propia_meta ? (
                                            <span className="ml-1 block text-[11px] font-medium text-amber-800">(propia puerta)</span>
                                          ) : null}
                                        </span>
                                      </div>
                                    ) : (
                                      <span />
                                    )}
                                    <span className="justify-self-center text-sm font-bold text-emerald-700">{ev.label}</span>
                                    {!ev.alignLeft ? (
                                      <div className="flex items-center gap-2 justify-self-end">
                                        <span className="text-right">
                                          <JugadorNombreAliasBlock j={ev.g.jugadores} />
                                          <span className="ml-1 inline-block align-middle text-base leading-none text-slate-800" aria-hidden>
                                            ⚽
                                          </span>
                                          {ev.g.propia_meta ? (
                                            <span className="ml-1 block text-[11px] font-medium text-amber-800">(propia puerta)</span>
                                          ) : null}
                                        </span>
                                        {avatarFrom(ev.g.jugadores, nombreJugador(ev.g.jugadores))}
                                      </div>
                                    ) : (
                                      <span />
                                    )}
                                    {permiteEdiciones ? (
                                      <div className="col-span-3 flex justify-end">
                                        <button
                                          type="button"
                                          className="text-xs font-medium text-red-600 underline"
                                          onClick={() =>
                                            void postDirecto({
                                              action: "remove_goal",
                                              gol_id: ev.g.id,
                                            })
                                          }
                                        >
                                          Quitar gol
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div
                                    key={ev.id}
                                    className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm"
                                  >
                                    {ev.alignLeft ? (
                                      <div className="flex items-center gap-2 justify-self-start">
                                        {avatarFrom(ev.t.jugadores, nombreJugador(ev.t.jugadores))}
                                        <span className="text-left">
                                          <JugadorNombreAliasBlock j={ev.t.jugadores} />
                                          <span className="ml-2 inline-flex align-middle gap-1">{cardGlyph(ev.t.tipo)}</span>
                                          <span className="ml-2 text-xs font-medium text-slate-700">{labelTarjeta(ev.t.tipo)}</span>
                                        </span>
                                      </div>
                                    ) : (
                                      <span />
                                    )}
                                    <span className="justify-self-center text-sm font-bold text-emerald-700">{ev.label}</span>
                                    {!ev.alignLeft ? (
                                      <div className="flex items-center gap-2 justify-self-end">
                                        <span className="text-right">
                                          <JugadorNombreAliasBlock j={ev.t.jugadores} />
                                          <span className="ml-2 inline-flex align-middle gap-1">{cardGlyph(ev.t.tipo)}</span>
                                          <span className="ml-2 text-xs font-medium text-slate-700">{labelTarjeta(ev.t.tipo)}</span>
                                        </span>
                                        {avatarFrom(ev.t.jugadores, nombreJugador(ev.t.jugadores))}
                                      </div>
                                    ) : (
                                      <span />
                                    )}
                                    {permiteEdiciones ? (
                                      <div className="col-span-3 flex justify-end">
                                        <button
                                          type="button"
                                          className="text-xs font-medium text-red-600 underline"
                                          onClick={() =>
                                            void postDirecto({
                                              action: "remove_tarjeta",
                                              tarjeta_id: ev.t.id,
                                            })
                                          }
                                        >
                                          Quitar tarjeta
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h3 className="mb-2 text-sm font-semibold text-slate-800">{n(livePartido.equipo_local_id)} (local)</h3>
                            <div className="grid max-h-80 gap-1 overflow-y-auto pr-1">
                              {jugadoresLocal.length === 0 ? (
                                <p className="text-sm text-slate-500">Sin jugadores en roster.</p>
                              ) : (
                                jugadoresLocal.map((j) => renderJugadorRow(livePartido.id, j, permiteEdiciones))
                              )}
                            </div>
                          </div>
                          <div>
                            <h3 className="mb-2 text-sm font-semibold text-slate-800">{n(livePartido.equipo_visitante_id)} (visitante)</h3>
                            <div className="grid max-h-80 gap-1 overflow-y-auto pr-1">
                              {jugadoresVisitante.length === 0 ? (
                                <p className="text-sm text-slate-500">Sin jugadores en roster.</p>
                              ) : (
                                jugadoresVisitante.map((j) => renderJugadorRow(livePartido.id, j, permiteEdiciones))
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {msg ? <p className="rounded-lg bg-slate-100 p-3 text-sm">{msg}</p> : null}

        {goalModal ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <h2 className="text-lg font-bold text-slate-900">
                Gol para{" "}
                <span className="text-violet-700">
                  {goalModal.beneficiario === "local" ? n(goalModal.equipoLocalId) : n(goalModal.equipoVisitId)}
                </span>
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Confirma el autor. En <strong>propia puerta</strong> debes elegir al jugador del <strong>rival</strong> que mete gol en contra.
              </p>

              <div className="mt-4 grid gap-2">
                <label className="text-xs font-semibold text-slate-700">Tipo de gol</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" checked={goalModo === "normal"} onChange={() => setGoalModo("normal")} />
                    Normal
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" checked={goalModo === "pp"} onChange={() => setGoalModo("pp")} />
                    Propia puerta (autor rival)
                  </label>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-semibold text-slate-700">Minuto del partido (opcional)</span>
                <input
                  type="number"
                  min={0}
                  placeholder="ej. 19"
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  value={goalMinuto}
                  onChange={(e) => setGoalMinuto(e.target.value)}
                />
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-semibold text-slate-700">{goalModo === "normal" ? "Autor del gol" : "Autor (rival en propia)"}</span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                  value={goalJugadorId}
                  onChange={(e) => setGoalJugadorId(e.target.value)}
                >
                  <option value="">Elige jugador…</option>
                  {goalPickerList.map((j) => (
                    <option key={j.id} value={j.id}>
                      {nombreJugador(j)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => setGoalModal(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingGoal || !goalJugadorId}
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void submitGoalModal()}
                >
                  {savingGoal ? "Guardando…" : "Guardar gol"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <a className="w-fit rounded-lg border border-violet-300 px-4 py-2 font-semibold text-violet-700" href="/resultados">
          Ir a resultados
        </a>
      </div>
    </main>
  );
}
