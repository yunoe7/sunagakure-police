'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Hook useCurrentUser
 * ════════════════════════════════════════════════════════════════
 *
 * Récupère les infos du user Discord actuellement connecté via NextAuth.
 *
 * ✨ NOUVEAU : refresh automatique des rôles Discord toutes les 60s
 *    (le serveur fait le travail, le client trigger le check via update()).
 *
 * Usage :
 *   const { username, displayName, avatar, isLoading, refreshRoles } = useCurrentUser();
 *
 *   // Bouton manuel
 *   <button onClick={refreshRoles}>🔄 Refresh mes rôles</button>
 *
 * Usage permissions :
 *   const { user, can } = useCurrentUser();
 *   if (can.adminBranche('police')) { ... }
 *   if (can.membreBranche('police')) { ... }
 * ════════════════════════════════════════════════════════════════
 */

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef } from 'react';
import type { IntranetUser } from '@/lib/roles';

// Intervalle de refresh côté client (en ms)
const CLIENT_REFRESH_INTERVAL = 60 * 1000;

export type Permissions = {
  adminBranche: (slug: string | string[]) => boolean;
  membreBranche: (slug: string | string[]) => boolean;
  adminGeneral: () => boolean;
  rangAuMoins: (niveauMin: number) => boolean;
};

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function useCurrentUser() {
  const { data: session, status, update } = useSession();
  const user = session?.user;

  const intranetUser =
    ((session as unknown as { intranet?: IntranetUser } | null)?.intranet) ?? null;

  const displayName =
    user?.discordGlobalName ||
    user?.discordUsername ||
    user?.name ||
    intranetUser?.username ||
    'Ninja';

  // ─── Refresh manuel (utilisable par un bouton) ─────────────────
  const refreshRoles = useCallback(async () => {
    try {
      await update(); // déclenche le callback jwt({ trigger: 'update' })
      console.log('[useCurrentUser] 🔄 Refresh manuel terminé');
    } catch (err) {
      console.error('[useCurrentUser] ❌ Erreur refresh :', err);
    }
  }, [update]);

  // ─── Refresh auto en arrière-plan toutes les 60s ───────────────
  const lastTriggerRef = useRef<number>(Date.now());

  useEffect(() => {
    if (status !== 'authenticated') return;

    // Trigger immédiat si on n'a pas refresh depuis longtemps (changement d'onglet, retour sur le site)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastTriggerRef.current;
        if (elapsed > CLIENT_REFRESH_INTERVAL) {
          lastTriggerRef.current = Date.now();
          update().catch((err) => console.error('[useCurrentUser] refresh visibility :', err));
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Refresh périodique toutes les 60s
    const interval = setInterval(() => {
      lastTriggerRef.current = Date.now();
      update().catch((err) => console.error('[useCurrentUser] refresh interval :', err));
    }, CLIENT_REFRESH_INTERVAL);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [status, update]);

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
    username: user?.discordUsername ?? intranetUser?.username,
    displayName,
    avatar: user?.discordAvatar || user?.image || intranetUser?.avatarUrl || null,
    id: user?.discordId ?? intranetUser?.discordId,
    email: user?.email,
    initials: getInitials(displayName),
    isLoading: status === 'loading',
    isAuthed: status === 'authenticated',

    user: intranetUser,
    can,
    isAuthenticated: status === 'authenticated' && intranetUser !== null,

    // ✨ Nouveau : bouton manuel de refresh
    refreshRoles,
  };
}
