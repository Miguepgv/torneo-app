/** True si el plazo de inscripción/cambios ya ha pasado. Sin fecha = abierto. */
export function inscripcionCerradaPorPlazo(limite: string | null | undefined, now = Date.now()): boolean {
  if (!limite) return false;
  const t = new Date(limite).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now;
}

export function reabrirInscripcionesHasta(dias: number, desde = new Date()): string {
  const d = new Date(desde);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}
