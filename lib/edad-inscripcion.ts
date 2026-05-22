/**
 * Edad en años cumplidos a partir de "YYYY-MM-DD" del input type=date.
 * No usa `new Date("YYYY-MM-DD")` (eso se interpreta en UTC y puede cambiar el día en local, desfasando la edad).
 */
export function calcEdadAniosCumplidos(fechaYmd: string): number | null {
  const m = fechaYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  const hoy = new Date();
  const cy = hoy.getFullYear();
  const cm = hoy.getMonth() + 1;
  const cd = hoy.getDate();

  let edad = cy - y;
  if (cm < mo || (cm === mo && cd < d)) edad--;
  return edad;
}

export function esMenorDeEdad(fechaYmd: string): boolean {
  const e = calcEdadAniosCumplidos(fechaYmd);
  if (e === null) return false;
  return e < 18;
}
