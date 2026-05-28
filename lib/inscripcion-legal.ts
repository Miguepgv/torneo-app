/**
 * Textos legales: mayor inscribe en su nombre; menor, el tutor acepta en el suyo.
 * Versiones separadas para auditoria y para forzar recarga si cambia el texto.
 */
export const INSCRIPTION_LEGAL_VERSION_ADULT = "2026-05-adult-v1";
export const INSCRIPTION_LEGAL_VERSION_MINOR = "2026-05-minor-v1";

export function getInscriptionLegalTitleAdult(): string {
  return "TERMINOS Y CONDICIONES, DESCARGO DE RESPONSABILIDAD Y USO DE IMAGEN";
}

export function getInscriptionLegalTitleMinor(): string {
  return "TERMINOS Y CONDICIONES Y DESCARGO DE RESPONSABILIDAD (MENORES)";
}

export function getInscriptionLegalFullTextAdult(): string {
  return [
    getInscriptionLegalTitleAdult(),
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
  ].join("\n");
}

export function getInscriptionLegalFullTextMinor(): string {
  return [
    getInscriptionLegalTitleMinor(),
    "",
    "Maraton Cofrade 2026",
    "",
    "Al marcar la casilla de aceptacion y firmar este documento de forma digital, yo, en calidad de padre/madre/tutor legal, autorizo la participacion del menor a mi cargo en el torneo y declaro bajo mi propia responsabilidad que:",
    "",
    "El menor esta en condiciones fisicas y mentales aptas para la practica del futbol.",
    "",
    "Asumo los riesgos inherentes del deporte y exonero de responsabilidad a la organizacion, arbitros, patrocinadores e instalaciones por lesiones, accidentes o danos sufridos por el menor.",
    "",
    "Acepto que el menor respetara el reglamento del torneo y mantendra una conducta deportiva.",
    "",
    "Autorizo el uso de la imagen, nombre, alias y foto de perfil del menor para la app, redes sociales y promocion del evento.",
    "",
    "Consiento el tratamiento de mis datos personales y los del menor (incluidas las imagenes del DNI) para la gestion, verificacion de identidad y funcionamiento de la app.",
  ].join("\n");
}

/** @deprecated Usar getInscriptionLegalBundle desde lib/inscription-legal-bundle.ts */
export function getInscriptionLegalFullText(): string {
  return getInscriptionLegalFullTextAdult();
}

/** @deprecated Usar getInscriptionLegalBundle desde lib/inscription-legal-bundle.ts */
export function getInscriptionLegalTitle(): string {
  return getInscriptionLegalTitleAdult();
}

/** @deprecated Usar INSCRIPTION_LEGAL_VERSION_ADULT / MINOR */
export const INSCRIPTION_LEGAL_VERSION = INSCRIPTION_LEGAL_VERSION_ADULT;
