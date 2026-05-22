/**
 * Versión del texto legal de inscripción. Si cambias el contenido, sube la versión
 * (p. ej. 2026-02-v2) para distinguir qué texto aceptó cada jugador en BD.
 */
export const INSCRIPTION_LEGAL_VERSION = "2026-02-v1";

export function getInscriptionLegalTitle(): string {
  return "TERMINOS Y CONDICIONES, DESCARGO DE RESPONSABILIDAD Y USO DE IMAGEN";
}

/** Texto íntegro mostrado en el formulario y guardado en BD / PDF / correo al tutor. */
export function getInscriptionLegalFullText(): string {
  return [
    getInscriptionLegalTitle(),
    "",
    "Maraton Cofrade 2026",
    "",
    "Al marcar la casilla de aceptacion y firmar este documento de forma digital para formalizar mi inscripcion en el torneo, declaro bajo mi propia responsabilidad que:",
    "",
    "1) Estoy en condiciones fisicas y mentales aptas para la practica del futbol.",
    "",
    "2) Asumo los riesgos inherentes del deporte y exonero de responsabilidad a organizacion, arbitros, patrocinadores e instalaciones por lesiones, accidentes o danos.",
    "",
    "3) Acepto y respetare el reglamento del torneo y conducta deportiva.",
    "",
    "4) Autorizo el uso de imagen, nombre, alias y foto de perfil para app, redes y promocion del evento.",
    "",
    "5) Consiento el tratamiento de datos personales e imagenes de DNI para gestion, verificacion de identidad y funcionamiento de la app.",
    "",
    "Si soy menor de edad, el padre/madre/tutor legal autoriza expresamente mi participacion bajo su responsabilidad.",
  ].join("\n");
}
