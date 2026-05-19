/**
 * Types des modules Impôts et Adoptions.
 *
 * Stockage Firebase :
 *   sunagakure/impots/grades       (barème par rang)
 *   sunagakure/impots/ninjas       (registre des contribuables)
 *   sunagakure/impots/paiements    (historique paiements)
 *   sunagakure/adoptions           (registre des adoptions)
 */

// ═══════════════════════════════════════════════════════════════════════
//  IMPÔTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Un grade dans le barème fiscal.
 * Lié à un rang officiel (Genin, Chunin, etc.) avec un montant d'impôt.
 */
export interface GradeBareme {
  rang: string;      // Ex: "Genin", "Chunin"...
  montant: number;   // Montant en ryos
}

/**
 * Un ninja dans le registre fiscal.
 * Lié à un recensé via prenom + nom (pas d'id strict pour rétrocompat).
 */
export interface NinjaImpot {
  id: number;
  prenom: string;
  nom: string;
  rang?: string;
  faction?: string;
  exempte?: boolean;     // exempté d'impôt (apprenti, défunt, etc.)
  notes?: string;
}

/**
 * Un paiement d'impôt enregistré.
 */
export interface PaiementImpot {
  id: number;
  ninjaId: number;
  prenom: string;
  nom: string;
  montant: number;
  date: number;          // timestamp
  semaine?: string;      // ex: "2026-W12"
  agent?: string;        // qui a encaissé
  notes?: string;
}

// Barème par défaut si rien en base
export const DEFAULT_BAREME: GradeBareme[] = [
  { rang: 'Genin', montant: 500 },
  { rang: 'Genin Confirmé', montant: 700 },
  { rang: 'Chunin', montant: 1000 },
  { rang: 'Tokubetsu Chunin', montant: 1200 },
  { rang: 'Kakunin', montant: 1500 },
  { rang: 'Tokubetsu Jonin', montant: 1800 },
  { rang: 'Jonin', montant: 2200 },
  { rang: 'Sairin', montant: 2600 },
  { rang: 'Commandant Jonin', montant: 3000 },
  { rang: 'Kazekage', montant: 0 },
  { rang: 'Civil', montant: 300 },
];

/**
 * Retourne la semaine ISO courante (ex: "2026-W12")
 */
export function currentWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Ajustement pour ISO week
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  ADOPTIONS
// ═══════════════════════════════════════════════════════════════════════

export interface Adoption {
  id: number;
  numero?: string;        // ex: "AD-2026-001"
  adoptant: string;       // nom de la personne qui adopte
  adopte: string;         // nom de l'enfant/personne adoptée
  clan?: string;
  date?: string;          // YYYY-MM-DD officielle de l'adoption
  temoins?: string;
  raison?: string;
  notes?: string;
  photo?: string;
  auteur?: string;
  createdAt: number;
  editedAt?: number;
}

export function nextAdoptionNumero(existing: Adoption[]): string {
  const year = new Date().getFullYear();
  const prefix = `AD-${year}-`;
  const nums = existing
    .map((a) => a.numero)
    .filter((n): n is string => !!n && n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('fr-FR');
}

export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return String(d);
  }
}
