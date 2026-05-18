/**
 * Types du module Admin.
 *
 * Stockage Firebase (sous le préfixe sunagakure/) :
 *   - users         : tableau d'utilisateurs (auth + RH)
 *   - loginHistory  : tableau des connexions enregistrées
 *   - timeline      : journal d'audit du village
 *   - features      : objet feature flags { feature_name: bool }
 */

export type UserRole = 'visiteur' | 'membre' | 'modo' | 'admin' | 'gerant';
export type UserStatut = 'Actif' | 'Inactif' | 'Suspendu' | 'Banni';

export const USER_ROLES: UserRole[] = ['visiteur', 'membre', 'modo', 'admin', 'gerant'];
export const USER_STATUTS: UserStatut[] = ['Actif', 'Inactif', 'Suspendu', 'Banni'];

export const ROLE_LABEL: Record<UserRole, string> = {
  visiteur: 'Visiteur',
  membre: 'Membre',
  modo: 'Modérateur',
  admin: 'Administrateur',
  gerant: 'Gérant',
};

export const ROLE_COLOR: Record<UserRole, string> = {
  visiteur: 'gray',
  membre: 'blue',
  modo: 'purple',
  admin: 'orange',
  gerant: 'gold',
};

export interface User {
  id: number;
  login?: string;
  pass?: string;          // hashé — on ne le touche JAMAIS dans la v2
  nom: string;
  grade?: string;
  role?: UserRole | string;
  section?: string;
  statut?: UserStatut | string;
  photo?: string;
  created?: number;
}

export interface LoginEntry {
  userId?: number;
  nom?: string;
  grade?: string;
  role?: string;
  date: number;
  os?: string;
  device?: string;
  browser?: string;
  browserVersion?: string;
  screen?: string;
  source?: string;
  ip?: string;
  geo?: {
    country?: string;
    countryCode?: string;
    city?: string;
    region?: string;
    isp?: string;
  };
  type?: 'connexion' | 'echec' | string;
}

export interface TimelineEntry {
  text: string;
  date: number;
  auteur?: string;
  urgence?: boolean;
}

export type FeaturesMap = Record<string, boolean>;

// Catalogue connu des feature flags utilisés par l'intranet
export const KNOWN_FEATURES: Array<{ key: string; label: string; desc: string }> = [
  {
    key: 'tribunal_active',
    label: 'Tribunal',
    desc: 'Active le module Justice (Affaires, Audiences, Jugements)',
  },
  {
    key: 'avocats_active',
    label: 'Avocats',
    desc: 'Active le module Avocats (Clients, Affaires, Plaidoiries)',
  },
];

export function fmtDateTime(ts: number | undefined): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function fmtRelative(ts: number | undefined): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'à l\'instant';
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `il y a ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `il y a ${day}j`;
  return fmtDateTime(ts);
}
