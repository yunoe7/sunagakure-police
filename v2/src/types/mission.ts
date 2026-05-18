/**
 * Types du module Missions.
 *
 * Stockage Firebase : `sunagakure/missions` (TABLEAU, format legacy)
 *
 * Une mission a 3 statuts principaux dans le flow :
 *   ouverte → en_cours → terminee (puis validée par un superviseur)
 * Plus 2 statuts terminaux :
 *   echouee, annulee
 */

export type MissionRang = 'D' | 'C' | 'B' | 'A' | 'S';

export type MissionStatut =
  | 'ouverte'
  | 'en_cours'
  | 'terminee'
  | 'echouee'
  | 'annulee';

export type MissionType =
  | 'Escorte'
  | 'Espionnage'
  | 'Assassinat'
  | 'Récupération'
  | 'Protection'
  | 'Investigation'
  | 'Capture'
  | 'Combat'
  | 'Autre';

export const MISSION_TYPES: MissionType[] = [
  'Escorte',
  'Espionnage',
  'Assassinat',
  'Récupération',
  'Protection',
  'Investigation',
  'Capture',
  'Combat',
  'Autre',
];

export const MISSION_RANGS: MissionRang[] = ['D', 'C', 'B', 'A', 'S'];

// Récompenses suggérées par rang (en ryos)
export const MS_REWARD_BY_RANK: Record<MissionRang, number> = {
  D: 500,
  C: 1500,
  B: 5000,
  A: 15000,
  S: 50000,
};

// Labels affichables des statuts
export const MISSION_STATUT_LABEL: Record<MissionStatut, string> = {
  ouverte: 'Disponible',
  en_cours: 'En cours',
  terminee: 'Terminée',
  echouee: 'Échouée',
  annulee: 'Annulée',
};

export interface MissionAssignment {
  nom: string;
  acceptedAt?: number;
}

export interface Mission {
  id: number;
  titre: string;
  desc?: string;
  rang: MissionRang;
  type?: MissionType | string;
  recompense?: number;
  statut: MissionStatut;
  lieu?: string;
  deadline?: string;       // YYYY-MM-DD
  creePar?: string;
  creeLe?: number;
  assignes?: MissionAssignment[];
  terminePar?: string;
  termineLe?: number;
  validePar?: string;
  valideLe?: number;
}

// Helper : format monétaire
export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('fr-FR');
}

// Helper : format date
export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}
