/**
 * Types du module Caisse (Police).
 *
 * Stockage Firebase : `sunagakure/caisse_police` (objet { transactions: [...] })
 *
 * Version v2 simplifiée : liste de transactions avec catégorie, montant
 * (positif = entrée, négatif = sortie), description, date.
 *
 * Si plus tard tu veux les archives auto-clôture et la compta multi-sections
 * de l'ancien intranet, on l'enrichira ici.
 */

export type TransactionType =
  | 'amende'         // entrée : amende reçue
  | 'salaire'        // sortie : paye d'un agent
  | 'achat'          // sortie : équipement, matériel
  | 'don'            // entrée : donation
  | 'mission'        // entrée : récompense de mission
  | 'autre_entree'   // entrée diverse
  | 'autre_sortie';  // sortie diverse

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  amende: 'Amende perçue',
  don: 'Donation reçue',
  mission: 'Récompense mission',
  autre_entree: 'Autre (entrée)',
  salaire: 'Salaire versé',
  achat: 'Achat / Équipement',
  autre_sortie: 'Autre (sortie)',
};

export const ENTREES: TransactionType[] = ['amende', 'don', 'mission', 'autre_entree'];
export const SORTIES: TransactionType[] = ['salaire', 'achat', 'autre_sortie'];

export interface Transaction {
  id: number;
  type: TransactionType;
  montant: number;          // toujours positif (le signe est déduit du type)
  description: string;
  date: number;             // timestamp
  agent?: string;           // qui a saisi la transaction
  sourceId?: number;        // ref optionnelle (ex: id d'un dossier dont l'amende a été payée)
}

/**
 * Indique si une transaction est une entrée (positive) ou une sortie (négative).
 */
export function isEntree(type: TransactionType): boolean {
  return ENTREES.includes(type);
}

/**
 * Retourne le montant signé d'une transaction.
 */
export function signedAmount(t: Transaction): number {
  return isEntree(t.type) ? t.montant : -t.montant;
}

export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  const abs = Math.abs(n);
  return abs.toLocaleString('fr-FR');
}

export function fmtDateFR(d: number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}
