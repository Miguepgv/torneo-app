/** Utilidades para tratar 0-0 y partidos finalizados sin goles persistidos (null → 0). */

export type PartidoConResultado = {
  equipo_local_id?: string | null;
  equipo_visitante_id?: string | null;
  goles_local?: number | null;
  goles_visitante?: number | null;
  estado?: string | null;
  fase?: string | null;
};

export function partidoEsDeGrupo(p: { fase?: string | null }): boolean {
  return (p.fase ?? "").trim().startsWith("Grupo ");
}

function estadoPartido(p: PartidoConResultado) {
  return (p.estado ?? "pendiente").toLowerCase();
}

/** Clasificación en directo: solo partidos de fase de grupos (no cruces/cuadro). */
export function partidoCuentaEnClasificacion(p: PartidoConResultado): boolean {
  if (!partidoEsDeGrupo(p)) return false;
  if (!p.equipo_local_id || !p.equipo_visitante_id) return false;
  const e = estadoPartido(p);
  return e === "finalizado" || e === "jugandose";
}

/** Solo partidos cerrados (cuadro, cierre de grupo). */
export function partidoTieneResultado(p: PartidoConResultado): boolean {
  if (!p.equipo_local_id || !p.equipo_visitante_id) return false;
  return estadoPartido(p) === "finalizado";
}

export function golesPartidoLocal(p: PartidoConResultado): number {
  return p.goles_local ?? 0;
}

export function golesPartidoVisitante(p: PartidoConResultado): number {
  return p.goles_visitante ?? 0;
}
