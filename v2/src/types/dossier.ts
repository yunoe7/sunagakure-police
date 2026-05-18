/**
 * Types du module Dossiers criminels.
 *
 * Stockage Firebase : `sunagakure/dossiers` (TABLEAU, format legacy)
 *
 * Un dossier criminel = fiche officielle ouverte par la police
 * sur une personne (citoyen ou ninja).
 */

export type DossierDanger = 'faible' | 'moyen' | 'eleve' | 'critique';

export type DossierStatut =
  | 'ouvert'             // dossier en cours, pas d'action
  | 'recherche'          // personne recherchée
  | 'garde_vue'          // en garde à vue
  | 'transmis_justice'   // transmis au tribunal
  | 'classe'             // affaire classée
  | 'defunt';            // personne décédée

export const DANGER_LABEL: Record<DossierDanger, string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  eleve: 'Élevé',
  critique: 'Critique',
};

export const DOSSIER_STATUT_LABEL: Record<DossierStatut, string> = {
  ouvert: 'Ouvert',
  recherche: 'Recherché',
  garde_vue: 'En garde à vue',
  transmis_justice: 'Transmis à la Justice',
  classe: 'Classé',
  defunt: 'Défunt',
};

export interface Dossier {
  id: number;
  nom: string;
  danger: DossierDanger;
  statut: DossierStatut;
  notes?: string;
  photo?: string;          // dataURL
  defunt?: boolean;
  auteur?: string;         // agent qui a ouvert le dossier
  date?: number;           // timestamp d'ouverture
  tags?: string[];

  // Infractions liées (texte libre, à enrichir plus tard)
  infractions?: string;

  // Amendes
  amendePayee?: number;
  amendeImpayee?: number;
  amendeTotal?: number;
}

export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('fr-FR');
}

export function fmtDateFR(d: number | string | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}
