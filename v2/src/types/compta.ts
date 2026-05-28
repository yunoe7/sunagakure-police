/**
 * Types pour les modules de comptabilité.
 *
 * Architecture : chaque section (avocat, médical, justice, missions, diplo, police)
 * a sa propre comptabilité avec les mêmes structures :
 *   - transactions[] : opérations financières en cours
 *   - archives[] : semaines clôturées
 *
 * Le Trésor Central reçoit un % automatique de chaque clôture.
 *
 * Stockage Firebase :
 *   sunagakure/comptaAvocat       → { transactions: [], archives: [] }
 *   sunagakure/comptaMedical      → { transactions: [], archives: [] }
 *   sunagakure/comptaJustice      → { transactions: [], archives: [] }
 *   sunagakure/comptaMissions     → { transactions: [], archives: [] }
 *   sunagakure/comptaDiplo        → { transactions: [], archives: [] }
 *   sunagakure/tresorCentral      → { prelevementRate: 15, mouvements: [] }
 */

export type TransactionType = 'entree' | 'sortie';

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  entree: '+ Entrée',
  sortie: '− Sortie',
};

export type TransactionCategory =
  // Entrées
  | 'paiement_client'    // honoraires, paiements joueurs
  | 'amende'             // amendes encaissées (police)
  | 'don'                // dons
  | 'mission_rec'        // récompenses missions
  | 'autre_entree'
  // Sorties
  | 'salaire'            // salaires versés
  | 'achat'              // matériel, fournitures
  | 'remboursement'
  | 'autre_sortie';

export const TRANSACTION_CATEGORY_LABEL: Record<TransactionCategory, string> = {
  paiement_client: 'Paiement client',
  amende: 'Amende',
  don: 'Don',
  mission_rec: 'Récompense mission',
  autre_entree: 'Autre entrée',
  salaire: 'Salaire',
  achat: 'Achat / Fournitures',
  remboursement: 'Remboursement',
  autre_sortie: 'Autre sortie',
};

export const ENTREE_CATEGORIES: TransactionCategory[] = [
  'paiement_client', 'amende', 'don', 'mission_rec', 'autre_entree',
];
export const SORTIE_CATEGORIES: TransactionCategory[] = [
  'salaire', 'achat', 'remboursement', 'autre_sortie',
];

export interface ComptaTransaction {
  id: number;
  type: TransactionType;
  category: TransactionCategory;
  montant: number;
  description?: string;
  date: number;
  agent?: string;
  ref?: string;          // référence externe (ex: numéro de facture, d'affaire)
}

export interface ComptaArchive {
  id: string;            // ex: "AR-1707000000000"
  label: string;         // ex: "Semaine du 01/01/2026 au 08/01/2026"
  clotureLe: number;
  cloturePar?: string;
  total: number;         // solde net (entrées - sorties)
  totalEntrees: number;
  totalSorties: number;
  count: number;         // nb transactions
  tresorRate: number;    // % prélevé
  tresorPrelevement: number;
  transactions: ComptaTransaction[];
}

export interface ComptaData {
  transactions: ComptaTransaction[];
  archives: ComptaArchive[];
}

// ─── TRÉSOR CENTRAL ───
export interface TresorMouvement {
  id: string;
  section: ComptaSection;
  sectionLabel: string;
  amount: number;
  date: number;
  archiveId: string;
  archiveLabel: string;
  rate: number;
  soldeOrigine: number;
}

export interface TresorCentral {
  prelevementRate: number;       // % global (15 par défaut)
  mouvements: TresorMouvement[];
  retraits?: TresorRetrait[];    // retraits manuels du trésor
}

export interface TresorRetrait {
  id: string;
  date: number;
  montant: number;
  motif: string;
  agent: string;
}

// ─── SECTIONS ───
export type ComptaSection = 'avocat' | 'medical' | 'justice' | 'missions' | 'diplo' | 'police' | 'koeki';

export const SECTION_LABEL: Record<ComptaSection, string> = {
  avocat: 'Cabinet d\'avocat',
  medical: 'Hôpital',
  justice: 'Tribunal',
  missions: 'Missions',
  diplo: 'Diplomatie',
  police: 'Police',
  koeki: 'Kōeki',
};

export const SECTION_FB_PATH: Record<ComptaSection, string> = {
  avocat: 'comptaAvocat',
  medical: 'comptaMedical',
  justice: 'comptaJustice',
  missions: 'comptaMissions',
  diplo: 'comptaDiplo',
  police: 'caisse_police',     // déjà existant pour la police
  koeki: 'comptaKoeki',
};

export const SECTION_ICON: Record<ComptaSection, string> = {
  avocat: '⚖️',
  medical: '🏥',
  justice: '🏛️',
  missions: '🎯',
  diplo: '🌍',
  police: '👮',
  koeki: '🏯',
};

// ─── HELPERS ───
export const TRESOR_DEFAULT_RATE = 15;

export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('fr-FR');
}

export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch { return String(d); }
}

export function fmtDateTimeFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(d); }
}

export function isEntree(cat: TransactionCategory): boolean {
  return ENTREE_CATEGORIES.includes(cat);
}

/**
 * Calcule le solde net et les totaux à partir d'une liste de transactions.
 */
export function computeTotals(transactions: ComptaTransaction[]) {
  let entrees = 0, sorties = 0;
  for (const t of transactions) {
    if (t.type === 'entree') entrees += t.montant;
    else sorties += t.montant;
  }
  return {
    entrees,
    sorties,
    solde: entrees - sorties,
    count: transactions.length,
  };
}
