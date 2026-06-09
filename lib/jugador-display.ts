export type JugadorNombre = {
  nombre: string;
  apellidos: string;
  alias?: string | null;
};

export function nombreCompletoJugador(j: JugadorNombre): string {
  return `${j.nombre} ${j.apellidos}`.trim();
}

/** Nombre y alias juntos (la gente se reconoce más por el alias). */
export function jugadorNombreYAlias(j: JugadorNombre | null | undefined): string {
  if (!j) return "Sin nombre";
  const full = nombreCompletoJugador(j);
  const alias = j.alias?.trim();
  if (alias) return `${full} · ${alias}`;
  return full;
}
