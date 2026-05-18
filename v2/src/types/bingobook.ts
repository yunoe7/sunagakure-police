/**
 * Types du module Bingo Book.
 * Structure identique à celle de l'ancien intranet pour compatibilité.
 *
 * Stockage Firebase : `sunagakure/bingobook` (objet à clés, pas tableau)
 * Le préfixe `sunagakure/` est ajouté automatiquement par db.ts.
 */

export type DangerLevel = 'eleve' | 'moyen' | 'faible';

export type NinjaStatus = 'actif' | 'capture' | 'tue' | 'evade';

export type NinjaGrade =
  | 'Genin'
  | 'Genin Confirmé'
  | 'Chunin'
  | 'Tokubetsu Chunin'
  | 'Kakunin'
  | 'Tokubetsu Jonin'
  | 'Jonin'
  | 'Sairin'
  | 'Commandant Jonin'
  | 'Kazekage'
  | 'Criminel recherché'
  | 'Civil'
  | 'Inconnu';

export const NINJA_GRADES: NinjaGrade[] = [
  'Genin',
  'Genin Confirmé',
  'Chunin',
  'Tokubetsu Chunin',
  'Kakunin',
  'Tokubetsu Jonin',
  'Jonin',
  'Sairin',
  'Commandant Jonin',
  'Kazekage',
  'Criminel recherché',
  'Civil',
  'Inconnu',
];

export interface NinjaFiche {
  id: number;             // timestamp (Date.now())
  nom: string;
  prenom?: string;
  grade?: NinjaGrade | string;
  danger: DangerLevel;
  reward?: number;        // Ryos
  village?: string;
  status?: NinjaStatus;
  portrait?: string;      // data URL base64
  vu?: string;            // "Vu pour la dernière fois"
  desc?: string;          // description / rapport
  createdAt?: number;
  updatedAt?: number;
}

// Labels affichables pour les valeurs codées
export const DANGER_LABEL: Record<DangerLevel, string> = {
  eleve: 'Danger élevé',
  moyen: 'Danger moyen',
  faible: 'Danger faible',
};

export const STATUS_LABEL: Record<NinjaStatus, string> = {
  actif: '🔴 Recherché — Actif',
  capture: '✅ Capturé',
  tue: '⚰️ Tué / Neutralisé',
  evade: '⚠️ Évadé',
};
