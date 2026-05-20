/**
 * Types du module Dossiers criminels.
 *
 * Stockage Firebase : `sunagakure/dossiers` (TABLEAU, format legacy)
 *
 * Un dossier criminel = fiche officielle ouverte par la police
 * sur une personne (citoyen ou ninja).
 *
 * ✨ NOUVEAU : Le champ `infractions` est désormais une LISTE
 * structurée d'objets (DossierInfraction). Le champ string legacy
 * est conservé pour la migration automatique.
 */

export type DossierDanger = 'faible' | 'moyen' | 'eleve' | 'critique';

export type DossierStatut =
  | 'ouvert'             // dossier en cours, pas d'action
  | 'recherche'          // personne recherchée
  | 'garde_vue'          // en garde à vue
  | 'transmis_justice'   // transmis au tribunal
  | 'classe'             // affaire classée
  | 'defunt';            // personne décédée

export const DANGER_LABEL: Record<DossierDanger, string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  eleve: 'Élevé',
  critique: 'Critique',
};

export const DOSSIER_STATUT_LABEL: Record<DossierStatut, string> = {
  ouvert: 'Ouvert',
  recherche: 'Recherché',
  garde_vue: 'En garde à vue',
  transmis_justice: 'Transmis à la Justice',
  classe: 'Classé',
  defunt: 'Défunt',
};

// ─── NOUVEAU : statuts d'une infraction individuelle ───────────
export type InfractionStatut = 'impunie' | 'partielle' | 'payee' | 'amnistiee' | 'purgee';

export const INFRACTION_STATUT_LABEL: Record<InfractionStatut, string> = {
  impunie: 'Impunie',
  partielle: 'Partiellement réglée',
  payee: 'Payée',
  amnistiee: 'Amnistiée',
  purgee: 'Purgée',
};

// ─── NOUVEAU : une infraction dans le casier du dossier ────────
export interface DossierInfraction {
  id: number;
  /** Référence optionnelle au Code Pénal (sunagakure/infractions) */
  codePenalId?: number;
  /** Catégorie du Code Pénal (violet/vert/rouge/noir) */
  cat?: 'violet' | 'vert' | 'rouge' | 'noir';
  /** Description de l'infraction */
  nom: string;
  /** Gravité spécifique (peut surcharger celle du dossier global) */
  gravite?: DossierDanger;
  /** Date de l'infraction (timestamp ms) */
  date?: number;
  /** Amende prononcée pour CETTE infraction (₽) */
  amende?: number;
  /** Partie déjà payée de cette amende */
  amendePayee?: number;
  /** Peine de prison (ex: "3 jours") */
  prison?: string;
  /** Statut de l'infraction */
  statut?: InfractionStatut;
  /** Notes additionnelles */
  notes?: string;
}

// ─── DOSSIER : type enrichi ───
export interface Dossier {
  id: number;
  /** ✨ NOUVEAU : numéro de dossier officiel ex "DOS-2026-001" */
  numeroDossier?: string;
  nom: string;
  danger: DossierDanger;
  statut: DossierStatut;
  notes?: string;
  photo?: string;          // dataURL
  defunt?: boolean;
  auteur?: string;         // agent qui a ouvert le dossier
  date?: number;           // timestamp d'ouverture
  tags?: string[];

  /** ✨ NOUVEAU : liste structurée d'infractions */
  infractionsList?: DossierInfraction[];

  /** 🔁 LEGACY : ancienne string libre (sera migrée à la première édition) */
  infractions?: string;

  // Amendes globales (auto-calculées depuis infractionsList si présent)
  amendePayee?: number;
  amendeImpayee?: number;
  amendeTotal?: number;
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

/**
 * 🆕 Génère un numéro de dossier officiel à partir de l'année et d'un séquentiel.
 * Format : DOS-2026-001
 */
export function generateDossierNumber(year: number, sequence: number): string {
  return `DOS-${year}-${String(sequence).padStart(3, '0')}`;
}

/**
 * 🆕 Trouve le prochain numéro séquentiel de l'année en cours.
 */
export function getNextDossierNumber(dossiers: Dossier[]): string {
  const year = new Date().getFullYear();
  const prefix = `DOS-${year}-`;
  const existingNumbers = dossiers
    .filter((d) => d.numeroDossier?.startsWith(prefix))
    .map((d) => parseInt(d.numeroDossier!.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  return generateDossierNumber(year, next);
}

/**
 * 🆕 Mappe la catégorie du Code Pénal vers une gravité de dossier.
 */
export function catToGravite(cat?: string): DossierDanger {
  switch (cat) {
    case 'violet': return 'faible';
    case 'vert':   return 'moyen';
    case 'rouge':  return 'eleve';
    case 'noir':   return 'critique';
    default:       return 'moyen';
  }
}

/**
 * 🆕 Migration auto : convertit une vieille string "infractions" en liste.
 * Utilisé à la première édition d'un dossier legacy.
 */
export function migrateInfractionsString(
  oldString: string | undefined,
  dossierGravite: DossierDanger,
  amendeTotal: number | undefined,
): DossierInfraction[] {
  if (!oldString || !oldString.trim()) return [];
  return [
    {
      id: Date.now(),
      nom: oldString.trim(),
      gravite: dossierGravite,
      amende: amendeTotal || 0,
      statut: 'impunie',
    },
  ];
}

/**
 * 🆕 Calcule les totaux d'amendes à partir de la liste d'infractions.
 */
export function computeAmendeTotals(infractions: DossierInfraction[]): {
  total: number;
  payee: number;
  impayee: number;
} {
  let total = 0;
  let payee = 0;
  for (const i of infractions) {
    if (i.statut === 'amnistiee') continue;
    const amende = i.amende || 0;
    const amendePayee = i.amendePayee || 0;
    total += amende;
    payee += amendePayee;
  }
  return {
    total,
    payee,
    impayee: Math.max(0, total - payee),
  };
}
export interface Dossier {
  id: number;
  numeroDossier?: string;
  nom: string;
  /** 🆕 NOUVEAU : lien vers la fiche recensé (sunagakure/recenses) */
  recenseId?: number;
  danger: DossierDanger;
  // ... le reste inchangé
}
