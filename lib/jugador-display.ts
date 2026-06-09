export type JugadorNombre = {
  nombre: string;
  apellidos: string;
  alias?: string | null;
};

/** PostgREST a veces devuelve el join como array; normaliza a un solo jugador. */
export function unwrapJugadorJoin(
  j: JugadorNombre | JugadorNombre[] | null | undefined,
): JugadorNombre | null {
  if (!j) return null;
  if (Array.isArray(j)) return j[0] ?? null;
  return j;
}

export function nombreCompletoJugador(j: JugadorNombre): string {
  return `${j.nombre} ${j.apellidos}`.trim();
}

/** Nombre y alias juntos (la gente se reconoce más por el alias). */
export function jugadorNombreYAlias(
  j: JugadorNombre | JugadorNombre[] | null | undefined,
): string {
  const row = unwrapJugadorJoin(j);
  if (!row) return "Sin nombre";
  const full = nombreCompletoJugador(row);
  const alias = row.alias?.trim();
  if (alias) return `${full} · ${alias}`;
  return full;
}

export function partesJugadorDisplay(
  j: JugadorNombre | JugadorNombre[] | null | undefined,
): { nombreCompleto: string; alias: string | null } {
  const row = unwrapJugadorJoin(j);
  if (!row) return { nombreCompleto: "Sin nombre", alias: null };
  return {
    nombreCompleto: nombreCompletoJugador(row),
    alias: row.alias?.trim() || null,
  };
}
