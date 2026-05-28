import { sanitizeStorageSlug } from "@/lib/server/storage-path-sanitize";

export type JoinUploadSlotKey =
  | "dniDelante"
  | "dniDetras"
  | "dniTutorDelante"
  | "dniTutorDetras"
  | "fotoPerfil";

export type JoinUploadSlot = {
  key: JoinUploadSlotKey;
  bucket: string;
  path: string;
};

export function buildJoinStoragePaths(args: {
  equipoId: string;
  safeName: string;
  esMenor: boolean;
  incluirFotoPerfil: boolean;
}): { basePath: string; fotoPath: string | null; slots: JoinUploadSlot[] } {
  const basePath = `inscripciones/${args.equipoId}/${args.safeName}`;
  const fotoPath = args.incluirFotoPerfil
    ? `jugadores/${args.equipoId}/${args.safeName}-perfil`
    : null;

  const slots: JoinUploadSlot[] = [
    { key: "dniDelante", bucket: "dnis_privados", path: `${basePath}-dni-delante` },
    { key: "dniDetras", bucket: "dnis_privados", path: `${basePath}-dni-detras` },
  ];

  if (args.esMenor) {
    slots.push(
      { key: "dniTutorDelante", bucket: "dnis_privados", path: `${basePath}-tutor-delante` },
      { key: "dniTutorDetras", bucket: "dnis_privados", path: `${basePath}-tutor-detras` },
    );
  }

  if (fotoPath) {
    slots.push({ key: "fotoPerfil", bucket: "escudos", path: fotoPath });
  }

  return { basePath, fotoPath, slots };
}

export function makeJoinSafeName(seed?: string): string {
  const slug = sanitizeStorageSlug(seed?.trim() || "jugador");
  return `${Date.now()}-${slug}`;
}
