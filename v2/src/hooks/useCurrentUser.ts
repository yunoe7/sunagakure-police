'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Hook useCurrentUser
 * ════════════════════════════════════════════════════════════════
 *
 * Récupère les infos du user Discord actuellement connecté via
 * NextAuth. Sert à remplacer le `CURRENT_USER = 'Ninja'` qu'on
 * avait hardcodé dans toutes les pages au début.
 *
 * Usage :
 *   const { username, displayName, avatar, isLoading } = useCurrentUser();
 *
 * - username     → pseudo Discord (yuno6901)
 * - displayName  → nom affiché Discord ou pseudo si pas défini
 * - avatar       → URL CDN Discord ou null
 * - id           → Discord ID
 * - email        → email Discord
 * - initials     → 1-2 lettres pour l'avatar par défaut (ex: "Y")
 * - isLoading    → true pendant le chargement initial
 * - isAuthed     → true si connecté
 * ════════════════════════════════════════════════════════════════
 */

import { useSession } from 'next-auth/react';

/**
 * Génère des initiales (1-2 lettres) à partir d'un nom.
 */
function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function useCurrentUser() {
  const { data: session, status } = useSession();
  const user = session?.user;

  // Le nom à utiliser pour signer les actions dans Firebase :
  // priorité au global_name (le pseudo affiché Discord),
  // sinon le username, sinon "Ninja" en dernier recours.
  const displayName =
    user?.discordGlobalName ||
    user?.discordUsername ||
    user?.name ||
    'Ninja';

  return {
    /** Pseudo Discord brut (ex: "yuno6901") */
    username: user?.discordUsername,
    /** Nom affiché Discord (peut être différent du username) */
    displayName,
    /** URL de l'avatar Discord, null si pas d'avatar */
    avatar: user?.discordAvatar || user?.image || null,
    /** Discord ID */
    id: user?.discordId,
    /** Email Discord */
    email: user?.email,
    /** Initiales pour fallback avatar */
    initials: getInitials(displayName),
    /** Session en cours de chargement */
    isLoading: status === 'loading',
    /** User authentifié */
    isAuthed: status === 'authenticated',
  };
}
