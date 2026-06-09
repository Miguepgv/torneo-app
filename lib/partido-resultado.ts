/** Utilidades para tratar 0-0 y partidos finalizados sin goles persistidos (null → 0). */

export type PartidoConResultado = {
  equipo_local_id?: string | null;
  equipo_visitante_id?: string | null;
  goles_local?: number | null;
  goles_visitante?: number | null;
  estado?: string | null;
};

export function partidoTieneResultado(p: PartidoConResultado): boolean {
  if (!p.equipo_local_id || !p.equipo_visitante_id) return false;
  if (p.goles_local != null && p.goles_visitante != null) return true;
  return (p.estado ?? "").toLowerCase() === "finalizado";
}

export function golesPartidoLocal(p: PartidoConResultado): number {
  return p.goles_local ?? 0;
}

export function golesPartidoVisitante(p: PartidoConResultado): number {
  return p.goles_visitante ?? 0;
}
