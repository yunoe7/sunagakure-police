/**
 * Types pour les pages Archives, Code de procédure (Justice)
 * et Récompenses (Missions).
 *
 * Stockage Firebase :
 *   sunagakure/procedures      (articles du code de procédure)
 *   sunagakure/jurisprudence   (précédents juridiques)
 *
 * Les Archives utilisent les affaires/jugements existants du tribunal
 * filtrés sur statut "Closes" ou "Jugée".
 *
 * Les Récompenses utilisent les missions existantes filtrées sur
 * "Terminée".
 */

// ─── CODE DE PROCÉDURE ───
export interface ArticleProcedure {
  id: number;
  numero?: string;            // ex: "Art. 12"
  titre: string;
  contenu: string;
  categorie?: string;         // "Procès", "Garde à vue", "Recours"...
  createdAt: number;
  updatedAt?: number;
  auteur?: string;
}

// ─── JURISPRUDENCE ───
/**
 * Un précédent juridique : décision marquante référencée pour
 * éclairer les futures affaires similaires.
 */
export interface Precedent {
  id: number;
  reference?: string;         // ex: "JUR-2026-001"
  titre: string;
  contexte?: string;
  decision: string;
  porteeJuridique?: string;
  date?: string;
  juge?: string;
  affaireId?: number;         // lien vers une affaire archivée
  affaireRef?: string;
  createdAt: number;
}

// ─── HELPERS ───
export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch { return String(d); }
}

export function nextPrecedentRef(existing: Precedent[]): string {
  const year = new Date().getFullYear();
  const prefix = `JUR-${year}-`;
  const nums = existing
    .map((p) => p.reference)
    .filter((n): n is string => !!n && n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// ─── RÉCOMPENSES MISSIONS ───
/**
 * Stats sur les missions terminées. Pas de stockage propre :
 * c'est une vue agrégée de sunagakure/missions filtrée.
 */
export interface RecompenseStats {
  totalPercu: number;
  missionsCount: number;
  topRank: string;
  moyenne: number;
}

export const RANG_ORDER = ['S', 'A', 'B', 'C', 'D', 'E'];

/**
 * Compare 2 rangs et retourne le plus haut (S > A > B > C > D > E).
 */
export function highestRank(a: string | undefined, b: string | undefined): string {
  if (!a) return b || '—';
  if (!b) return a;
  const ia = RANG_ORDER.indexOf(a);
  const ib = RANG_ORDER.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia < ib ? a : b;
}

export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('fr-FR');
}
