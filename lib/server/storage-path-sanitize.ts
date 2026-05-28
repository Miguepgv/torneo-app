/**
 * Rutas de Supabase Storage: solo ASCII [a-z0-9/_-.]
 * (nombres con Jose, Maria, etc. sin acentos en la ruta)
 */
export function sanitizeStorageSlug(input: string): string {
  const ascii = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return ascii || "jugador";
}

export function isSafeStorageObjectPath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.includes("..")) return false;
  return /^[a-z0-9][a-z0-9/_.-]*$/i.test(path);
}
