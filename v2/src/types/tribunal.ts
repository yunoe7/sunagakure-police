/**
 * Types du module Tribunal (Audiences, Affaires, Jugements, Archives).
 *
 * Stockage Firebase :
 *   sunagakure/affaires
 *   sunagakure/audiences
 *   sunagakure/jugements
 */

export type AffaireStatut = 'instruction' | 'audience' | 'jugee' | 'archivee';
export type AudienceStatut = 'planifiee' | 'tenue' | 'reportee' | 'annulee';
export type JugementVerdict = 'coupable' | 'non_coupable' | 'non_lieu' | 'autre';

export interface Affaire {
  id: number;
  ref?: string;             // ex: "AFF-2026-0001"
  titre: string;
  defendeur?: string;
  accusateur?: string;
  juge?: string;
  avocat?: string;
  statut: AffaireStatut;
  desc?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface Audience {
  id: number;
  titre: string;
  date?: string;            // YYYY-MM-DD
  heure?: string;           // HH:MM
  lieu?: string;
  juge?: string;
  affaireId?: number;       // référence à une affaire
  duree?: string;
  notes?: string;
  statut: AudienceStatut;
  createdAt: number;
}

export interface Jugement {
  id: number;
  affaireId?: number;
  titre: string;
  verdict: JugementVerdict;
  peine?: string;
  juge?: string;
  date?: string;            // YYYY-MM-DD
  motifs?: string;
  createdAt: number;
}

// Labels
export const AFFAIRE_STATUT_LABEL: Record<AffaireStatut, string> = {
  instruction: 'En instruction',
  audience: "En audience",
  jugee: 'Jugée',
  archivee: 'Archivée',
};

export const AUDIENCE_STATUT_LABEL: Record<AudienceStatut, string> = {
  planifiee: 'Planifiée',
  tenue: 'Tenue',
  reportee: 'Reportée',
  annulee: 'Annulée',
};

export const VERDICT_LABEL: Record<JugementVerdict, string> = {
  coupable: '⚖️ Coupable',
  non_coupable: '✓ Non coupable',
  non_lieu: 'Non-lieu',
  autre: 'Autre',
};

export function nextAffaireRef(existing: Affaire[]): string {
  const year = new Date().getFullYear();
  const prefix = `AFF-${year}-`;
  const used = existing
    .map((a) => a.ref)
    .filter((r): r is string => !!r && r.startsWith(prefix))
    .map((r) => parseInt(r.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}
