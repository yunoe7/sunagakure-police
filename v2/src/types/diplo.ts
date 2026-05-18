/**
 * Types du module Diplomatie.
 *
 * Stockage Firebase :
 *   sunagakure/diplo_villages         (Villages connus)
 *   sunagakure/diplo_traites          (Traités diplomatiques)
 *   sunagakure/laissezPasse           (Laissez-passer)
 *   sunagakure/diplo_communications   (Communications inter-villages)
 */

// ─── VILLAGES ───
export type VillageStatut = 'allie' | 'neutre' | 'tendu' | 'ennemi';
export const VILLAGE_STATUT_LABEL: Record<VillageStatut, string> = {
  allie: 'Allié',
  neutre: 'Neutre',
  tendu: 'Tendu',
  ennemi: 'Ennemi',
};

export interface Village {
  id: number;
  nom: string;
  pays?: string;
  statut: VillageStatut;
  alliance?: string;
  kage?: string;
  population?: number;
  notes?: string;
  createdAt: number;
}

// ─── TRAITÉS ───
export type TraiteType = 'paix' | 'commerce' | 'alliance' | 'non_agression' | 'autre';
export const TRAITE_TYPE_LABEL: Record<TraiteType, string> = {
  paix: 'Paix',
  commerce: 'Commerce',
  alliance: 'Alliance militaire',
  non_agression: 'Non-agression',
  autre: 'Autre',
};

export type TraiteStatut = 'brouillon' | 'actif' | 'expire' | 'rompu';
export const TRAITE_STATUT_LABEL: Record<TraiteStatut, string> = {
  brouillon: 'Brouillon',
  actif: 'Actif',
  expire: 'Expiré',
  rompu: 'Rompu',
};

export interface Traite {
  id: number;
  titre: string;
  type: TraiteType;
  parties?: string;       // liste libre des villages signataires
  date?: string;          // YYYY-MM-DD signature
  dateExpiration?: string;
  statut: TraiteStatut;
  contenu?: string;       // texte du traité
  notes?: string;
  createdAt: number;
}

// ─── LAISSEZ-PASSER ───
export type LpStatut = 'valide' | 'expire' | 'revoque' | 'utilise';
export const LP_STATUT_LABEL: Record<LpStatut, string> = {
  valide: 'Valide',
  expire: 'Expiré',
  revoque: 'Révoqué',
  utilise: 'Utilisé',
};

export interface LaissezPasse {
  id: number;
  numero?: string;        // ex: "LP-2026-001"
  porteur: string;
  dateEmission?: string;
  dateExpiration?: string;
  permanent?: boolean;
  villages?: string;      // liste libre des villages autorisés
  motif?: string;
  notes?: string;
  statut: LpStatut;
  emetteur?: string;
  createdAt: number;
}

// ─── COMMUNICATIONS ───
export type CommType = 'message' | 'rapport' | 'note' | 'urgence';
export const COMM_TYPE_LABEL: Record<CommType, string> = {
  message: 'Message',
  rapport: 'Rapport',
  note: 'Note diplomatique',
  urgence: '⚠ Urgence',
};

export interface Communication {
  id: number;
  expediteur: string;
  destinataire: string;
  sujet: string;
  message: string;
  type: CommType;
  urgent?: boolean;
  date?: string;
  createdAt: number;
}

// ─── HELPERS ───
export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

export function nextLpNumero(existing: LaissezPasse[]): string {
  const year = new Date().getFullYear();
  const prefix = `LP-${year}-`;
  const nums = existing
    .map((l) => l.numero)
    .filter((n): n is string => !!n && n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}
