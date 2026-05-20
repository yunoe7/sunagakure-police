/**
 * Types du module Casiers judiciaires.
 *
 * Stockage Firebase : `sunagakure/casiers` (TABLEAU, format legacy)
 *
 * Un casier = fiche permanente attachée à un Recensé qui consolide
 * tout son historique judiciaire (antécédents, décisions de justice,
 * notes officielles, restrictions). Différent d'un Dossier qui est
 * une enquête ponctuelle.
 *
 * RÈGLE MÉTIER : 1 seul casier par recensé.
 */

import type { DossierDanger, InfractionStatut } from './dossier';

// ═══════════════════════════════════════════════════════════════════
//  STATUTS DU CASIER
// ═══════════════════════════════════════════════════════════════════

export type CasierStatut =
  | 'vierge'              // aucune infraction, casier ouvert préventivement
  | 'antecedents'         // a des infractions passées
  | 'surveillance'        // sous surveillance active
  | 'interdit_village'    // interdit d'entrée au village
  | 'rehabilite';         // amnistié / peines purgées

export const CASIER_STATUT_LABEL: Record<CasierStatut, string> = {
  vierge: 'Vierge',
  antecedents: 'Antécédents',
  surveillance: 'Sous surveillance',
  interdit_village: 'Interdit de village',
  rehabilite: 'Réhabilité',
};

// ═══════════════════════════════════════════════════════════════════
//  ENTITÉS INTERNES
// ═══════════════════════════════════════════════════════════════════

/**
 * Une infraction du casier — soit issue d'un Dossier (avec dossierId),
 * soit ajoutée manuellement (ancien crime, infraction tribunal sans dossier).
 */
export interface CasierInfraction {
  id: number;
  nom: string;
  gravite?: DossierDanger;
  /** Date des faits */
  date?: number;
  amende?: number;
  amendePayee?: number;
  prison?: string;
  statut?: InfractionStatut;
  notes?: string;
  /** Catégorie Code Pénal */
  cat?: 'violet' | 'vert' | 'rouge' | 'noir';
  codePenalId?: number;
  /** 🆕 Source : depuis un dossier (consultatif) ou ajoutée manuellement */
  source?: 'dossier' | 'manuel' | 'tribunal';
  /** 🆕 Si source = 'dossier', l'id du dossier d'origine */
  dossierId?: number;
}

/**
 * Une décision de justice rendue contre la personne.
 */
export interface CasierDecision {
  id: number;
  /** Date de la décision (jugement) */
  date: number;
  /** Tribunal qui a rendu la décision */
  tribunal?: string;
  /** Type de décision (condamnation, relaxe, amnistie...) */
  type: 'condamnation' | 'relaxe' | 'amnistie' | 'sursis' | 'liberation' | 'autre';
  /** Peine prononcée (texte libre : "30 jours de prison", "500k₽ d'amende"...) */
  peine: string;
  /** Motif / contexte */
  motif?: string;
  /** Magistrat / juge qui a rendu la décision */
  juge?: string;
  /** Si liée à une infraction du casier */
  infractionId?: number;
}

export const CASIER_DECISION_TYPE_LABEL: Record<CasierDecision['type'], string> = {
  condamnation: 'Condamnation',
  relaxe: 'Relaxe',
  amnistie: 'Amnistie',
  sursis: 'Sursis',
  liberation: 'Libération',
  autre: 'Autre',
};

/**
 * Une note officielle datée — main courante du casier.
 */
export interface CasierNote {
  id: number;
  date: number;
  auteur: string;
  contenu: string;
}

/**
 * Une restriction active (interdiction, surveillance, etc.).
 */
export interface CasierRestriction {
  id: number;
  type: 'interdit_village' | 'interdit_armes' | 'surveillance' | 'couvre_feu' | 'eloignement' | 'autre';
  /** Détails (lieu, personnes concernées, etc.) */
  details: string;
  /** Date de début */
  dateDebut: number;
  /** Date de fin (timestamp), si limitée dans le temps */
  dateFin?: number;
  /** Statut : active ou levée */
  active: boolean;
}

export const RESTRICTION_TYPE_LABEL: Record<CasierRestriction['type'], string> = {
  interdit_village: 'Interdit de village',
  interdit_armes: 'Interdit de port d\'armes',
  surveillance: 'Sous surveillance',
  couvre_feu: 'Couvre-feu',
  eloignement: 'Mesure d\'éloignement',
  autre: 'Autre',
};

// ═══════════════════════════════════════════════════════════════════
//  CASIER
// ═══════════════════════════════════════════════════════════════════

export interface Casier {
  id: number;
  /** Numéro de casier officiel ex "CAS-2026-001" */
  numeroCasier: string;
  /** Lien OBLIGATOIRE vers une fiche du Recensement */
  recenseId: number;
  /** Cache du nom complet pour affichage rapide (synchronisé depuis Recense) */
  nomComplet: string;

  statut: CasierStatut;

  /** Antécédents consolidés (auto depuis dossiers + manuel) */
  infractions?: CasierInfraction[];
  /** Décisions de justice rendues */
  decisions?: CasierDecision[];
  /** Notes officielles datées */
  notes?: CasierNote[];
  /** Restrictions actives ou passées */
  restrictions?: CasierRestriction[];

  /** Résumé / Observations générales (texte libre) */
  observations?: string;

  // Méta
  ouvertPar: string;
  ouvertLe: number;
  modifiePar?: string;
  modifieLe?: number;
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

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

export function fmtDateTimeFR(d: number | string | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Génère un numéro de casier officiel.
 * Format : CAS-2026-001
 */
export function generateCasierNumber(year: number, sequence: number): string {
  return `CAS-${year}-${String(sequence).padStart(3, '0')}`;
}

/**
 * Trouve le prochain numéro séquentiel de l'année en cours.
 */
export function getNextCasierNumber(casiers: Casier[]): string {
  const year = new Date().getFullYear();
  const prefix = `CAS-${year}-`;
  const existing = casiers
    .filter((c) => c.numeroCasier?.startsWith(prefix))
    .map((c) => parseInt(c.numeroCasier.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return generateCasierNumber(year, next);
}

/**
 * Calcule les totaux d'amendes d'un casier.
 */
export function computeCasierTotals(c: Casier): {
  total: number;
  payee: number;
  impayee: number;
  nbInfractions: number;
} {
  const infractions = c.infractions || [];
  let total = 0;
  let payee = 0;
  for (const i of infractions) {
    if (i.statut === 'amnistiee') continue;
    total += i.amende || 0;
    payee += i.amendePayee || 0;
  }
  return {
    total,
    payee,
    impayee: Math.max(0, total - payee),
    nbInfractions: infractions.length,
  };
}

/**
 * Détermine si un casier est "vierge" (aucune infraction non-amnistiée).
 */
export function isCasierVierge(c: Casier): boolean {
  const infractions = c.infractions || [];
  return infractions.every((i) => i.statut === 'amnistiee');
}

/**
 * Couleur d'affichage selon le statut du casier.
 */
export function getCasierVariant(c: Casier): 'vierge' | 'normal' | 'alerte' | 'danger' {
  if (c.statut === 'vierge' || isCasierVierge(c)) return 'vierge';
  if (c.statut === 'interdit_village') return 'danger';
  if (c.statut === 'surveillance') return 'alerte';
  if (c.statut === 'rehabilite') return 'vierge';
  return 'normal';
}
