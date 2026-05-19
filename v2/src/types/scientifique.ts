/**
 * Types du Service Scientifique.
 *
 * Stockage Firebase :
 *   sunagakure/hospital_scientifique   (Rapports d'études)
 *   sunagakure/hospital_morgue         (Registre des défunts)
 */

// ─── SALON SCIENTIFIQUE — Rapports d'études ───
export type SciStatut = 'encours' | 'publie' | 'archive';

export const SCI_STATUT_LABEL: Record<SciStatut, string> = {
  encours: '⏳ En cours',
  publie: '✅ Publié',
  archive: '📦 Archivé',
};

export type SciType = 'etude' | 'analyse' | 'experimentation' | 'recherche' | 'autre';

export const SCI_TYPE_LABEL: Record<SciType, string> = {
  etude: 'Étude clinique',
  analyse: 'Analyse',
  experimentation: 'Expérimentation',
  recherche: 'Recherche',
  autre: 'Autre',
};

export interface RapportSci {
  id: number;
  titre: string;
  scientifique?: string;
  type: SciType;
  statut: SciStatut;
  sujet?: string;
  methodologie?: string;
  resultats?: string;
  conclusion?: string;
  date?: string;
  datePublication?: string;
  collaborateurs?: string;
  notes?: string;
  createdAt: number;
}

// ─── MORGUE — Registre des défunts ───
export type MorgueStatut = 'autopsie' | 'clos' | 'restitue';

export const MORGUE_STATUT_LABEL: Record<MorgueStatut, string> = {
  autopsie: '🔬 En autopsie',
  clos: '📁 Clos',
  restitue: '⚱️ Restitué à la famille',
};

export type CauseDeces = 'mission' | 'maladie' | 'combat' | 'naturelle' | 'execution' | 'accident' | 'inconnue' | 'autre';

export const CAUSE_DECES_LABEL: Record<CauseDeces, string> = {
  mission: 'En mission',
  combat: 'Combat',
  maladie: 'Maladie',
  naturelle: 'Cause naturelle',
  execution: 'Exécution',
  accident: 'Accident',
  inconnue: 'Inconnue',
  autre: 'Autre',
};

export interface Defunt {
  id: number;
  nom: string;
  prenom?: string;
  age?: number;
  faction?: string;
  cause: CauseDeces;
  statut: MorgueStatut;
  dateDeces?: string;
  dateAutopsie?: string;
  legiste?: string;
  rapportAutopsie?: string;
  observations?: string;
  familleContactee?: boolean;
  dateRestitution?: string;
  notes?: string;
  photo?: string;
  createdAt: number;
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
