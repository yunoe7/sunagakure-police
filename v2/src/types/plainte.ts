/**
 * Types du module Plaintes.
 * Stockage Firebase : `sunagakure/plaintes` (TABLEAU, format legacy)
 *
 * Flow d'une plainte :
 *   ouverte → en_cours (agent assigné) → fermee (résolue)
 *           → transmise_tribunal (escalade vers la Justice)
 */

export type PlainteStatut =
  | 'ouverte'
  | 'en_cours'
  | 'fermee'
  | 'transmise_tribunal';

export type PlainteCible = 'Citoyen' | 'Agent' | 'Inconnu';

export type PlainteType =
  | 'Vol'
  | 'Agression'
  | 'Vandalisme'
  | 'Trahison'
  | 'Tapage'
  | 'Fraude'
  | 'Disparition'
  | 'Diffamation'
  | 'Harcèlement'
  | 'Autre';

export const PLAINTE_TYPES: PlainteType[] = [
  'Vol',
  'Agression',
  'Vandalisme',
  'Trahison',
  'Tapage',
  'Fraude',
  'Disparition',
  'Diffamation',
  'Harcèlement',
  'Autre',
];

export const PLAINTE_STATUT_LABEL: Record<PlainteStatut, string> = {
  ouverte: 'Ouverte',
  en_cours: 'En cours',
  fermee: 'Fermée',
  transmise_tribunal: 'Transmise au Tribunal',
};

export interface Plainte {
  id: number;
  ref?: string;             // ex: "PL-2024-0001"
  plaignant: string;
  accuse: string;
  type: PlainteType | string;
  desc: string;
  dateFaits?: string;       // YYYY-MM-DD
  cible?: PlainteCible;
  statut: PlainteStatut;
  auteur?: string;          // qui a déposé (souvent === plaignant ou modérateur)
  agent?: string;           // agent en charge de l'enquête
  agentCloture?: string;    // agent qui a clôturé
  date?: number;            // timestamp de dépôt
  photoAccuse?: string;     // dataURL
}

/**
 * Génère une référence type "PL-2026-0001" pour une nouvelle plainte.
 * S'appuie sur la liste existante pour trouver le prochain numéro.
 */
export function nextPlainteRef(existing: Plainte[]): string {
  const year = new Date().getFullYear();
  const prefix = `PL-${year}-`;
  const usedNumbers = existing
    .map((p) => p.ref)
    .filter((r): r is string => !!r && r.startsWith(prefix))
    .map((r) => parseInt(r.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
