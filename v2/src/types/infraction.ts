/**
 * Types du module Code Pénal.
 * Stockage Firebase : `sunagakure/infractions` (tableau, ancien format compatible)
 */

export type InfractionCat = 'violet' | 'vert' | 'rouge' | 'noir';

export const INFRACTION_CAT_LABEL: Record<InfractionCat, string> = {
  violet: 'Délit mineur',
  vert: 'Délit majeur',
  rouge: 'Crime',
  noir: 'Peine capitale',
};

export const INFRACTION_CAT_ORDER: InfractionCat[] = ['violet', 'vert', 'rouge', 'noir'];

export interface Infraction {
  id: number;
  nom: string;
  cat: InfractionCat | string;
  amende?: string;   // ex: "500 ryos"
  prison?: string;   // "Oui" / "Non" (legacy : string)
  duree?: string;    // ex: "3 jours"
  notes?: string;
}
