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
