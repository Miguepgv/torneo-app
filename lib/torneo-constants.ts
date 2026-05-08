export const TORNEO_COMPETICIONES = {
  CHAMPIONS: "Champions Cofrade",
  EUROPA: "Europa Cofrade",
  CONFERENCE: "Conference Cofrade",
} as const;

/** Título fijo para partidos KO creados sin competición definida */
export const TORNEO_COMPETICION_KO_GENERICA = TORNEO_COMPETICIONES.CHAMPIONS;

/**
 * Etiquetas legibles por defecto para datos antiguos ("Champions League", etc.).
 */
export function tituloCompeticionMostrar(guardado: string | null | undefined): string {
  const n = (guardado ?? "").trim().toLowerCase();
  if (!n) return TORNEO_COMPETICIONES.CHAMPIONS;
  if (n.includes("champion")) return TORNEO_COMPETICIONES.CHAMPIONS;
  if (n.includes("europa")) return TORNEO_COMPETICIONES.EUROPA;
  if (n.includes("conference")) return TORNEO_COMPETICIONES.CONFERENCE;
  return guardado!.trim();
}
