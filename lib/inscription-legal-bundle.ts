import {
  INSCRIPTION_LEGAL_VERSION_ADULT,
  INSCRIPTION_LEGAL_VERSION_MINOR,
  getInscriptionLegalFullTextAdult,
  getInscriptionLegalFullTextMinor,
  getInscriptionLegalTitleAdult,
  getInscriptionLegalTitleMinor,
} from "@/lib/inscripcion-legal";

export type InscriptionLegalBundle = {
  version: string;
  title: string;
  fullText: string;
};

export function getInscriptionLegalBundle(esMenor: boolean): InscriptionLegalBundle {
  if (esMenor) {
    return {
      version: INSCRIPTION_LEGAL_VERSION_MINOR,
      title: getInscriptionLegalTitleMinor(),
      fullText: getInscriptionLegalFullTextMinor(),
    };
  }
  return {
    version: INSCRIPTION_LEGAL_VERSION_ADULT,
    title: getInscriptionLegalTitleAdult(),
    fullText: getInscriptionLegalFullTextAdult(),
  };
}
