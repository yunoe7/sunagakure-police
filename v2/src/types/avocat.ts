/**
 * Types du module Avocat / Cabinet d'avocats.
 *
 * Stockage Firebase :
 *   sunagakure/avocat_clients      (Clients représentés)
 *   sunagakure/avocat_affaires     (Affaires/dossiers traités)
 *   sunagakure/avocat_plaidoiries  (Plaidoiries et notes d'argumentation)
 */

// ─── CLIENTS ───
export interface ClientAvocat {
  id: number;
  nom: string;
  prenom?: string;
  contact?: string;          // tél, message Discord, etc.
  faction?: string;
  notes?: string;
  photo?: string;
  createdAt: number;
}

// ─── AFFAIRES ───
export type AffaireType = 'penal' | 'civil' | 'famille' | 'commercial' | 'autre';
export const AFFAIRE_TYPE_LABEL: Record<AffaireType, string> = {
  penal: 'Pénal',
  civil: 'Civil',
  famille: 'Famille',
  commercial: 'Commercial',
  autre: 'Autre',
};

export type AffaireStatut = 'preparation' | 'en_cours' | 'jugement_attendu' | 'gagnee' | 'perdue' | 'classee';
export const AFFAIRE_STATUT_LABEL: Record<AffaireStatut, string> = {
  preparation: 'En préparation',
  en_cours: 'En cours',
  jugement_attendu: 'Jugement attendu',
  gagnee: '✓ Gagnée',
  perdue: '✗ Perdue',
  classee: 'Classée',
};

export interface Affaire {
  id: number;
  ref?: string;              // ex: "AFF-AVO-2026-001"
  titre: string;
  clientId?: number;
  clientNom?: string;        // dénormalisé pour affichage rapide
  type: AffaireType;
  statut: AffaireStatut;
  description?: string;
  partieAdverse?: string;
  dateOuverture?: string;    // YYYY-MM-DD
  dateAudience?: string;     // prochain rendez-vous
  honoraires?: number;
  notes?: string;
  createdAt: number;
}

// ─── PLAIDOIRIES ───
export interface Plaidoirie {
  id: number;
  titre: string;
  affaireId?: number;
  affaireRef?: string;       // dénormalisé pour recherche
  contenu: string;
  arguments?: string;        // arguments clés (un par ligne)
  preuves?: string;          // liste des pièces (libre)
  dateAudience?: string;
  createdAt: number;
  updatedAt?: number;
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

export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('fr-FR');
}

export function nextAffaireRef(existing: Affaire[]): string {
  const year = new Date().getFullYear();
  const prefix = `AFF-AVO-${year}-`;
  const nums = existing
    .map((a) => a.ref)
    .filter((n): n is string => !!n && n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}
