/**
 * Types du module Annonces.
 *
 * IMPORTANT : la structure suit EXACTEMENT celle de l'ancien intranet
 * (champs : id, titre, cat, contenu, photo, auteur, pin, date) pour rester
 * compatible avec la base Firebase pendant la migration.
 *
 * Dans Firebase, `annonces` est un TABLEAU (array), pas un objet à clés.
 */

export type AnnonceCategorie =
  | 'Information'
  | 'Opérationnel'
  | 'Recrutement'
  | 'Alerte'
  | 'Disciplinaire';

export const ANNONCE_CATEGORIES: AnnonceCategorie[] = [
  'Information',
  'Opérationnel',
  'Recrutement',
  'Alerte',
  'Disciplinaire',
];

export interface Annonce {
  id: number;            // timestamp (Date.now())
  titre: string;
  cat: AnnonceCategorie | string;
  contenu: string;
  photo?: string;        // data URL base64 (legacy, on évite d'en ajouter de nouvelles)
  auteur: string;
  pin: boolean;          // épinglée en tête de liste
  date: number;          // timestamp ms
}

/**
 * Convertit une catégorie d'annonce en classe CSS (info/opera/alert/disci/other).
 * Garde le mapping de l'ancien intranet pour conserver les couleurs.
 */
export function annCatKey(cat: string | undefined): string {
  if (!cat) return 'other';
  const map: Record<string, string> = {
    Information: 'info',
    Opérationnel: 'opera',
    Alerte: 'alert',
    Disciplinaire: 'disci',
  };
  return map[cat] || 'other';
}
