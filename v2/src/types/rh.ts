/**
 * Types du module Administration RH.
 *
 * Effectifs et Hiérarchie utilisent la collection `users` (existante,
 * déjà migrée dans /admin). Ce sont des vues alternatives.
 *
 * Équipes utilise sa propre collection : `sunagakure/equipes`.
 * Une équipe référence des recensés par leur id.
 */

import type { User } from './admin';

// ─── RÔLES (réutilisés depuis admin) ───
export const ROLE_HIERARCHY: User['role'][] = [
  'admin',
  'hautcommandement',
  'gerant',
  'cogerant',
  'sergent',
  'officier',
  'membre',
  'stagiaire',
  'visiteur',
];

export const ROLE_LABELS_FULL: Record<string, string> = {
  admin: 'Administrateur',
  hautcommandement: 'Haut Commandement',
  gerant: 'Gérant',
  cogerant: 'Co-Gérant',
  sergent: 'Sergent',
  officier: 'Officier',
  membre: 'Membre',
  stagiaire: 'Stagiaire',
  visiteur: 'Visiteur',
};

export const ROLE_EMOJI: Record<string, string> = {
  admin: '🔴',
  hautcommandement: '🎖️',
  gerant: '🏛️',
  cogerant: '🥈',
  sergent: '⚔️',
  officier: '🔵',
  membre: '👥',
  stagiaire: '🌱',
  visiteur: '👁',
};

/**
 * Indique si un rôle est considéré "officier ou supérieur" pour les stats.
 */
export function isOfficierOrAbove(role: User['role']): boolean {
  const officierIdx = ROLE_HIERARCHY.indexOf('officier');
  const myIdx = ROLE_HIERARCHY.indexOf(role);
  return myIdx >= 0 && myIdx <= officierIdx;
}

/**
 * Indique si un rôle est admin.
 */
export function isAdmin(role: User['role']): boolean {
  return role === 'admin' || role === 'hautcommandement';
}

// ─── ÉQUIPES ───
export interface Equipe {
  id: number;
  nom: string;
  emblem?: string;          // 🆕 clé d'icône Lucide ('shield', 'sword', etc.) OU emoji (legacy)
  emblemImg?: string;       // 🆕 NOUVEAU : data URL d'une image uploadée (prioritaire sur emblem)
  color?: string;           // 🆕 NOUVEAU : clé de couleur ('gold', 'red', 'blue', 'purple', 'green', 'orange', 'cyan', 'pink')
  chefId?: number;          // id d'un recensé
  membres?: number[];       // ids des recensés
  desc?: string;
  created?: number;
  createdBy?: string;
  modified?: number;
  modifiedBy?: string;
}
