/**
 * Types complémentaires du module Police.
 *
 * Stockage Firebase :
 *   sunagakure/candidatures   (Recrutement)
 *   sunagakure/operations     (Opérations actives)
 *   sunagakure/sanctions      (Sanctions et promotions)
 */

// ─── RECRUTEMENT ───
export type CandidatureStatut = 'en_attente' | 'acceptee' | 'refusee';

export const CANDIDATURE_STATUT_LABEL: Record<CandidatureStatut, string> = {
  en_attente: '⏳ En attente',
  acceptee: '✅ Acceptée',
  refusee: '❌ Refusée',
};

export interface Candidature {
  id: number;
  nom: string;
  age?: string | number;
  discord?: string;
  motif?: string;
  exp?: string;
  section?: string;
  genre?: string;
  gradeShinobi?: string;
  sectionActuelle?: string;
  casier?: string;
  statut: CandidatureStatut;
  date?: string | number;
}

// ─── OPÉRATIONS ───
export type OperationStatut = 'Active' | 'Préparation' | 'Terminée' | 'Annulée';

export const OPERATION_STATUT_LABEL: Record<OperationStatut, string> = {
  Active: '🚨 Active',
  Préparation: '⏳ Préparation',
  Terminée: '✅ Terminée',
  Annulée: '❌ Annulée',
};

export type OperationType = 'patrouille' | 'arrestation' | 'enquete' | 'protection' | 'infiltration' | 'autre';

export const OPERATION_TYPE_LABEL: Record<OperationType, string> = {
  patrouille: 'Patrouille',
  arrestation: 'Arrestation',
  enquete: 'Enquête',
  protection: 'Protection',
  infiltration: 'Infiltration',
  autre: 'Autre',
};

export interface Operation {
  id: number;
  nom: string;
  type: OperationType;
  statut: OperationStatut;
  resp?: string;
  dateOp?: string;
  desc?: string;
  date?: string | number;     // date de création
  mapX?: number;              // position sur la carte tactique (0-100, %)
  mapY?: number;              // position sur la carte tactique (0-100, %)
}

// ─── SANCTIONS ───
export type SanctionType = 'Promotion' | 'Rétrogradation' | 'Avertissement' | 'Exclusion' | 'Récompense' | 'Suspension';

export const SANCTION_TYPE_LABEL: Record<SanctionType, string> = {
  Promotion: '⬆ Promotion',
  Rétrogradation: '⬇ Rétrogradation',
  Avertissement: '⚠ Avertissement',
  Exclusion: '🚫 Exclusion',
  Récompense: '🏆 Récompense',
  Suspension: '⏸ Suspension',
};

export interface Sanction {
  id: number;
  type: SanctionType;
  cible: string;
  motif?: string;
  auteur?: string;
  date?: string | number;
}

// ─── HELPERS ───
export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return String(d);
  }
}

export function isSanctionPositive(type: SanctionType): boolean {
  return type === 'Promotion' || type === 'Récompense';
}

export function isSanctionNegative(type: SanctionType): boolean {
  return type === 'Rétrogradation' || type === 'Avertissement' || type === 'Exclusion' || type === 'Suspension';
}
