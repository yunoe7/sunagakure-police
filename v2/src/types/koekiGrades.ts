/**
 * ═══════════════════════════════════════════════════════════════════
 *  KŌEKI — Override de grade stocké en base Firebase
 * ═══════════════════════════════════════════════════════════════════
 *  Permet d'attribuer un grade Kōeki à un membre directement depuis
 *  l'intranet (page /admin/membres), SANS dépendre des rôles Discord.
 *
 *  Pourquoi : l'endpoint OAuth Discord ne remonte pas de façon fiable
 *  les rôles créés/attribués récemment. On stocke donc le grade Kōeki
 *  en base, et useCurrentUser l'utilise en priorité sur le rôle Discord.
 *
 *  Stockage Firebase :
 *    sunagakure/koeki/grades/{discordId} → KoekiGradeOverride
 *
 *  ⭐ Architecture extensible : si un jour on veut overrider d'autres
 *     axes (branches, rang…), on créera des chemins similaires
 *     (ex: sunagakure/overrides/{discordId}) sur le même modèle, sans
 *     toucher à ce fichier.
 * ═══════════════════════════════════════════════════════════════════
 */

import type { KoekiGrade, KoekiInfo, KoekiPole } from '@/lib/roles';

/** Chemin Firebase (préfixé sunagakure/ par db.ts). */
export const KOEKI_GRADES_PATH = 'koeki/grades';

/** Enregistrement stocké en base pour un membre. */
export interface KoekiGradeOverride {
  /** Le grade Kōeki attribué, ou null pour "aucun" (retire l'override). */
  grade: KoekiGrade | null;
  /** Qui a défini ce grade (pseudo). */
  setBy?: string;
  /** Quand (timestamp ms). */
  setAt?: number;
}

/** Liste ordonnée des grades sélectionnables (du + haut au + bas). */
export const KOEKI_GRADE_OPTIONS: { value: KoekiGrade; label: string }[] = [
  { value: 'gerant', label: 'Gérant Kōeki' },
  { value: 'co-gerant', label: 'Co-Gérant Kōeki' },
  { value: 'superviseur-eco', label: 'Superviseur économie' },
  { value: 'superviseur-event', label: 'Superviseur évènementiel' },
  { value: 'chef-eco', label: "Chef d'équipe économie" },
  { value: 'chef-event', label: "Chef d'équipe évènementiel" },
  { value: 'membre-eco', label: 'Membre économie' },
  { value: 'membre-event', label: 'Membre évènementiel' },
];

/** Pôle de chaque grade (doit rester aligné avec lib/roles.ts). */
const GRADE_POLE: Record<KoekiGrade, KoekiPole> = {
  'gerant': 'both',
  'co-gerant': 'both',
  'superviseur-eco': 'economie',
  'superviseur-event': 'evenementiel',
  'chef-eco': 'economie',
  'chef-event': 'evenementiel',
  'membre-eco': 'economie',
  'membre-event': 'evenementiel',
};

/** Libellé court d'un grade (pour affichage). */
export function gradeLabel(grade: KoekiGrade | null | undefined): string {
  if (!grade) return 'Aucun';
  return KOEKI_GRADE_OPTIONS.find((o) => o.value === grade)?.label ?? grade;
}

/**
 * Convertit un grade (venant de la base) en KoekiInfo,
 * le même format que getKoekiGrade() de lib/roles.ts.
 * Renvoie null si pas de grade.
 */
export function gradeToKoekiInfo(grade: KoekiGrade | null | undefined): KoekiInfo {
  if (!grade) return null;
  return { grade, pole: GRADE_POLE[grade] };
}
