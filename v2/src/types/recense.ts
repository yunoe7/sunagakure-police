/**
 * Types du module Recensement.
 *
 * Stockage Firebase : `sunagakure/recenses` (TABLEAU, format legacy)
 *
 * Registre officiel des habitants/ninjas connus de Sunagakure.
 * Inclut civils, ninjas actifs, déserteurs, et défunts.
 */

export const NATURES_CHAKRA = [
  'Ninjutsu',
  'Genjutsu',
  'Taijutsu Man',
  'Fuinjutsu',
  'Kenjutsu',
  'Médecine ninja',
  'Doton',
  'Suiton',
  'Katon',
  'Raiton',
  'Fûton',
  'Hyoton',
  'Jinchuriki',
  'Kekkei Genkai',
  'Autre',
] as const;

export const RANGS = [
  'Genin',
  'Genin Confirmé',
  'Chunin',
  'Tokubetsu Chunin',
  'Kakunin',
  'Tokubetsu Jonin',
  'Jonin',
  'Sairin',
  'Commandant Jonin',
  'Kazekage',
  'Criminel recherché',
  'Civil',
  'Inconnu',
] as const;

export const SEXES = ['Masculin', 'Féminin', 'Autre'] as const;

export type DefuntStatut = '' | 'disparition' | 'defunt-suna' | 'execution';

export const DEFUNT_STATUT_LABEL: Record<string, string> = {
  '': '🟢 Vivant',
  disparition: '🟡 Disparu',
  'defunt-suna': '⚱️ Défunt de Suna',
  execution: '⚔️ Défunt par exécution',
};

export interface Recense {
  id: number;
  prenom: string;
  nom: string;
  age?: string | number;
  sexe?: string;
  faction?: string;
  rang?: string;
  competences?: string;
  natures?: string[];
  notes?: string;
  photo?: string;
  auteur?: string;
  date?: string | number;
  titre?: string;
  metier?: string;
  clan?: string;
  defuntStatut?: DefuntStatut;
}

export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return String(d);
  }
}

/**
 * Indique si le recensé est considéré comme "défunt" (mort ou disparu)
 * pour l'affichage visuel.
 */
export function isDefunt(r: Recense): boolean {
  return !!r.defuntStatut && r.defuntStatut !== '';
}

/**
 * Indique si le recensé est considéré comme "criminel" pour les stats.
 */
export function isCriminel(r: Recense): boolean {
  return r.rang === 'Criminel recherché' || (r.faction || '').toLowerCase().includes('déserteur');
}
