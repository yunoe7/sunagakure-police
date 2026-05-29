/**
 * ═══════════════════════════════════════════════════════════════════
 *  OVERRIDES DE RÔLES — stockés en base Firebase
 * ═══════════════════════════════════════════════════════════════════
 *  Permet d'attribuer des rôles intranet (branches, gérant/co-gérant,
 *  rang ninja, admin) à un membre directement depuis /admin/membres,
 *  SANS dépendre des rôles Discord (qui se propagent mal via OAuth).
 *
 *  ⚠️ MODÈLE "AJOUT" (base = ajout, ne retire jamais) :
 *     Les overrides COMPLÈTENT ce que donne Discord. Ils n'enlèvent
 *     jamais un accès venu de Discord. La fusion se fait dans
 *     useCurrentUser (union des branches, max du rang, OR de l'admin).
 *
 *  Stockage Firebase :
 *    sunagakure/overrides/{discordId} → RoleOverride
 *
 *  Le grade Kōeki reste géré séparément dans koeki/grades/{id}
 *  (voir types/koekiGrades.ts) — on n'y touche pas ici.
 *
 *  🔐 NOTE SÉCURITÉ : isAdmin éditable ici donne accès à Maintenance
 *     et Whitelist. La protection réelle dépend des règles Firebase
 *     sur le chemin overrides/. À sécuriser côté Firebase.
 * ═══════════════════════════════════════════════════════════════════
 */

/** Chemin Firebase (préfixé sunagakure/ par db.ts). */
export const OVERRIDES_PATH = 'overrides';

/**
 * Override de rôles pour un membre. Tous les champs sont optionnels :
 * un champ absent = "rien à ajouter sur cet axe".
 */
export interface RoleOverride {
  /** Slugs de branches ajoutées (membre). Ex: ['police','medecin']. */
  branches?: string[];
  /** Slugs de branches dont on fait un Gérant. */
  gerantDe?: string[];
  /** Slugs de branches dont on fait un Co-Gérant. */
  coGerantDe?: string[];
  /** Niveau de rang ninja imposé (1..11). On garde le max(Discord, base). */
  rangNiveau?: number | null;
  /** Donne l'admin technique (Maintenance/Whitelist). ⚠️ sensible. */
  isAdmin?: boolean;
  /** Métadonnées */
  setBy?: string;
  setAt?: number;
}

/** Liste des branches éditables (slug + label). Aligné sur BRANCHES_INFO de roles.ts. */
export const BRANCHE_OPTIONS: { slug: string; label: string }[] = [
  { slug: 'police', label: 'Police' },
  { slug: 'medecin', label: 'Médecin' },
  { slug: 'scientifique', label: 'Scientifique' },
  { slug: 'academie', label: 'Académie' },
  { slug: 'stratege', label: 'Stratège' },
  { slug: 'diplomate', label: 'Diplomate' },
  { slug: 'bureau-missions', label: 'Bureau des missions' },
  { slug: 'renseignement', label: 'Renseignement' },
  { slug: 'interrogatoire', label: 'Interrogatoire' },
  { slug: 'arts-guerre', label: 'Arts de la guerre' },
  { slug: 'journaliste', label: 'Journaliste' },
  { slug: 'orphelin', label: 'Orphelinat' },
];

/** Rangs ninja (niveau + nom), aligné sur RANG_HIERARCHIE de roles.ts. */
export const RANG_OPTIONS: { niveau: number; nom: string }[] = [
  { niveau: 1, nom: 'Genin' },
  { niveau: 2, nom: 'Genin confirmé' },
  { niveau: 3, nom: 'Tokubetsu Chunin' },
  { niveau: 4, nom: 'Chunin' },
  { niveau: 5, nom: 'Kakunin' },
  { niveau: 6, nom: 'Tokubetsu Jonin' },
  { niveau: 7, nom: 'Jonin' },
  { niveau: 8, nom: 'Sairin' },
  { niveau: 9, nom: 'Commandant Jonin' },
  { niveau: 10, nom: 'Bras droit du Kazekage' },
  { niveau: 11, nom: 'Kazekage' },
];

export function brancheLabel(slug: string): string {
  return BRANCHE_OPTIONS.find((b) => b.slug === slug)?.label ?? slug;
}

export function rangNomFromNiveau(niveau: number | null | undefined): string | null {
  if (typeof niveau !== 'number') return null;
  return RANG_OPTIONS.find((r) => r.niveau === niveau)?.nom ?? null;
}

/** Normalise un override brut venu de Firebase (valeurs sûres). */
export function normalizeOverride(raw: unknown): RoleOverride {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  return {
    branches: Array.isArray(r.branches) ? (r.branches as string[]) : [],
    gerantDe: Array.isArray(r.gerantDe) ? (r.gerantDe as string[]) : [],
    coGerantDe: Array.isArray(r.coGerantDe) ? (r.coGerantDe as string[]) : [],
    rangNiveau: typeof r.rangNiveau === 'number' ? r.rangNiveau : null,
    isAdmin: r.isAdmin === true,
    setBy: typeof r.setBy === 'string' ? r.setBy : undefined,
    setAt: typeof r.setAt === 'number' ? r.setAt : undefined,
  };
}
