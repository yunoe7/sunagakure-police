'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Hook useCurrentUser
 * ════════════════════════════════════════════════════════════════
 *
 * Récupère les infos du user Discord actuellement connecté via NextAuth.
 *
 * Usage :
 *   const { username, displayName, avatar, isLoading } = useCurrentUser();
 *
 * Usage permissions :
 *   const { user, can } = useCurrentUser();
 *
 *   // Gérant / Co-gérant / Admin uniquement
 *   if (can.adminBranche('police')) { ... }
 *   if (can.adminBranche(['medecin', 'scientifique'])) { ... } // au moins une
 *
 *   // Tous les membres de la branche (même sans grade) + Admin
 *   if (can.membreBranche('police')) { ... }
 *   if (can.membreBranche(['medecin', 'scientifique'])) { ... }
 *
 *   if (user?.isAdmin) { ... }
 *
 * ⚠️ Lit `session.intranet` (pas `session.intranetUser` — ancien bug).
 * ════════════════════════════════════════════════════════════════
 */

import { useSession } from 'next-auth/react';
import type { IntranetUser } from '@/lib/roles';

export type Permissions = {
  /**
   * Peut GÉRER la (ou les) branche(s) donnée(s) — Gérant OU Co-gérant OU Admin.
   * À utiliser pour les actions sensibles (sanctions, décisions de chef…).
   * Si on passe une liste, c'est OK s'il a au moins UNE des branches.
   */
  adminBranche: (slug: string | string[]) => boolean;

  /**
   * Est MEMBRE de la (ou des) branche(s) donnée(s) — tous niveaux + Admin.
   * À utiliser pour les actions opérationnelles (créer un dossier, ajouter
   * une fiche, faire une consultation…).
   * Si on passe une liste, c'est OK s'il a au moins UNE des branches.
   */
  membreBranche: (slug: string | string[]) => boolean;

  /** Peut voir le panel admin général (Admin / Staff / Conseil) */
  adminGeneral: () => boolean;

  /** A au moins le rang ninja demandé (par niveau, 1 = Genin, 11 = Kazekage) */
  rangAuMoins: (niveauMin: number) => boolean;
};

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

  // FIX : auth.ts écrit `session.intranet` (pas `intranetUser`).
  const intranetUser =
    ((session as unknown as { intranet?: IntranetUser } | null)?.intranet) ?? null;

  const displayName =
    user?.discordGlobalName ||
    user?.discordUsername ||
    user?.name ||
    intranetUser?.username ||
    'Ninja';

  // ─── Helpers de permissions ────────────────────────────────────
  const can: Permissions = {
    adminBranche: (slug: string | string[]) => {
      if (!intranetUser) return false;
      if (intranetUser.isAdmin) return true;
      const slugs = Array.isArray(slug) ? slug : [slug];
      return slugs.some(
        (s) =>
          intranetUser.gerantDe.includes(s) || intranetUser.coGerantDe.includes(s)
      );
    },

    membreBranche: (slug: string | string[]) => {
      if (!intranetUser) return false;
      if (intranetUser.isAdmin) return true;
      const slugs = Array.isArray(slug) ? slug : [slug];
      return intranetUser.branches.some((b) => slugs.includes(b.slug));
    },

    adminGeneral: () => {
      if (!intranetUser) return false;
      return (
        intranetUser.isAdmin ||
        intranetUser.isStaff ||
        intranetUser.isConseilDuVent ||
        intranetUser.isConseillerKazekage
      );
    },

    rangAuMoins: (niveauMin: number) => {
      if (!intranetUser || !intranetUser.rang) return false;
      return intranetUser.rang.niveau >= niveauMin;
    },
  };

  return {
    // ─── Champs existants ──────────────────────────────────────────
    username: user?.discordUsername ?? intranetUser?.username,
    displayName,
    avatar: user?.discordAvatar || user?.image || intranetUser?.avatarUrl || null,
    id: user?.discordId ?? intranetUser?.discordId,
    email: user?.email,
    initials: getInitials(displayName),
    isLoading: status === 'loading',
    isAuthed: status === 'authenticated',

    // ─── Nouveaux champs ───────────────────────────────────────────
    user: intranetUser,
    can,
    isAuthenticated: status === 'authenticated' && intranetUser !== null,
  };
}
