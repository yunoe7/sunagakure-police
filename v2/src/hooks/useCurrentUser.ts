'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Hook useCurrentUser
 * ════════════════════════════════════════════════════════════════
 *
 * Récupère les infos du user Discord actuellement connecté via NextAuth.
 *
 * ✨ Refresh automatique des rôles Discord toutes les 5 minutes
 *    (compromise entre fraîcheur et rate limit Discord).
 *    Pour un effet INSTANTANÉ, utiliser le bouton "Refresh mes rôles"
 *    dans le menu avatar de la sidebar.
 *
 * 🆕 OVERRIDE KŌEKI EN BASE : le grade Kōeki peut être défini depuis
 *    l'intranet (page /admin/membres) et stocké dans Firebase
 *    (koeki/grades/{discordId}). S'il existe, il PRIME sur le rôle
 *    Discord — ce qui permet de gérer le Kōeki sans dépendre de la
 *    propagation parfois lente des rôles Discord via OAuth.
 *
 * 🥷 RÈGLE "ALL PERM" : Les utilisateurs suivants obtiennent
 *    automatiquement toutes les permissions de branche
 *    (Membre ET Gérant), PARTOUT, sans exception :
 *    - Rang Jonin (niveau 7) et au-dessus
 *    - Membres du Conseil du Vent
 *
 *    Cette règle s'applique aussi à Kōeki (can.koeki.*) : un Jonin+
 *    ou Conseil du Vent a tous les droits Kōeki comme pour les
 *    autres branches.
 *
 *    Les pages "admin technique" (Maintenance, Whitelist) restent
 *    réservées aux admins techniques (isAdmin) UNIQUEMENT.
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
 *   if (can.koeki.gererSocietes()) { ... }
 * ════════════════════════════════════════════════════════════════
 */

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef } from 'react';
import type { IntranetUser } from '@/lib/roles';
import {
  canVoirEconomie, canGererSocietes, canDeclarerCA, canModifierTaux,
  canRenflouerBDM, canVoirMarche, canGererMarche, canVoirComptaGlobale,
  canPointerCompta, canVoirSaCompta, canVoirParametres, isKoeki,
} from '@/lib/roles';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import {
  KOEKI_GRADES_PATH,
  gradeToKoekiInfo,
  type KoekiGradeOverride,
} from '@/types/koekiGrades';

// Intervalle de refresh côté client (5 minutes pour éviter le rate limit Discord)
const CLIENT_REFRESH_INTERVAL = 5 * 60 * 1000;

// 🥷 Niveau minimum pour avoir "all perm" automatiquement
//    7 = Jonin (et au-dessus : Sairin, Commandant Jonin, Bras droit, Kazekage)
const JONIN_NIVEAU = 7;

export type KoekiPermissions = {
  acces: () => boolean;
  voirEconomie: () => boolean;
  gererSocietes: () => boolean;
  declarerCA: () => boolean;
  modifierTaux: () => boolean;
  renflouerBDM: () => boolean;
  voirMarche: () => boolean;
  gererMarche: () => boolean;
  voirComptaGlobale: () => boolean;
  pointerCompta: () => boolean;
  voirSaCompta: () => boolean;
  voirParametres: () => boolean;
};

export type Permissions = {
  adminBranche: (slug: string | string[]) => boolean;
  membreBranche: (slug: string | string[]) => boolean;
  adminGeneral: () => boolean;
  rangAuMoins: (niveauMin: number) => boolean;
  koeki: KoekiPermissions;
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

  // ─── 🆕 Override grade Kōeki depuis Firebase ───────────────────
  // On lit koeki/grades/{discordId}. Si un grade y est défini, il
  // remplace le koeki venu du JWT (rôle Discord).
  const myDiscordId = user?.discordId ?? intranetUser?.discordId ?? null;
  const { data: gradeOverrideData } = useFirebaseValue<KoekiGradeOverride | null>(
    myDiscordId ? `${KOEKI_GRADES_PATH}/${myDiscordId}` : null
  );

  // ─── Refresh manuel (utilisable par un bouton) ─────────────────
  const refreshRoles = useCallback(async () => {
    try {
      await update();
      console.log('[useCurrentUser] 🔄 Refresh manuel terminé');
    } catch (err) {
      console.error('[useCurrentUser] ❌ Erreur refresh :', err);
    }
  }, [update]);

  // ─── Refresh auto en arrière-plan toutes les 5 minutes ─────────
  const lastTriggerRef = useRef<number>(Date.now());

  useEffect(() => {
    if (status !== 'authenticated') return;

    const interval = setInterval(() => {
      lastTriggerRef.current = Date.now();
      update().catch((err) => console.error('[useCurrentUser] refresh interval :', err));
    }, CLIENT_REFRESH_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [status, update]);

  // ─── Helpers de permissions ────────────────────────────────────

  // 🥷 "All perm" automatique si :
  //    - rang Jonin (7) ou plus, OU
  //    - membre du Conseil du Vent
  const hasAllPerm =
    intranetUser !== null &&
    (
      (intranetUser.rang ? intranetUser.rang.niveau >= JONIN_NIVEAU : false) ||
      intranetUser.isConseilDuVent
    );

  // Court-circuit pour Kōeki : isAdmin technique OU hasAllPerm (Jonin+/Conseil).
  // On le passe comme 2e argument des helpers purs de roles.ts.
  const koekiOverride = !!intranetUser && (intranetUser.isAdmin || hasAllPerm);

  // 🆕 Grade Kōeki effectif :
  //    - si un grade est défini en base (koeki/grades/{id}) → il PRIME
  //    - sinon → on garde le grade venu du rôle Discord (JWT)
  const baseGrade = gradeOverrideData?.grade ?? null;
  const koekiInfo = baseGrade
    ? gradeToKoekiInfo(baseGrade)
    : (intranetUser?.koeki ?? null);

  const can: Permissions = {
    adminBranche: (slug: string | string[]) => {
      if (!intranetUser) return false;
      if (intranetUser.isAdmin) return true;
      // 🥷 Jonin+ OU Conseil du Vent = Gérant de toutes les branches
      if (hasAllPerm) return true;
      const slugs = Array.isArray(slug) ? slug : [slug];
      return slugs.some(
        (s) =>
          intranetUser.gerantDe.includes(s) || intranetUser.coGerantDe.includes(s)
      );
    },

    membreBranche: (slug: string | string[]) => {
      if (!intranetUser) return false;
      if (intranetUser.isAdmin) return true;
      // 🥷 Jonin+ OU Conseil du Vent = Membre de toutes les branches
      if (hasAllPerm) return true;
      const slugs = Array.isArray(slug) ? slug : [slug];
      return intranetUser.branches.some((b) => slugs.includes(b.slug));
    },

    adminGeneral: () => {
      if (!intranetUser) return false;
      // ⚠️ adminGeneral NE PREND PAS hasAllPerm :
      //    Maintenance/Whitelist restent réservés aux admins techniques.
      //    (mais isConseilDuVent y est inclus historiquement, on garde)
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

    // ─── KŌEKI ───
    // Chaque helper passe koekiOverride (isAdmin OU hasAllPerm) comme 2e arg,
    // de sorte qu'un Jonin+/Conseil du Vent a tous les droits Kōeki.
    // koekiInfo intègre désormais l'override en base (priorité sur Discord).
    koeki: {
      acces: () => isKoeki(koekiInfo, koekiOverride),
      voirEconomie: () => canVoirEconomie(koekiInfo, koekiOverride),
      gererSocietes: () => canGererSocietes(koekiInfo, koekiOverride),
      declarerCA: () => canDeclarerCA(koekiInfo, koekiOverride),
      modifierTaux: () => canModifierTaux(koekiInfo, koekiOverride),
      renflouerBDM: () => canRenflouerBDM(koekiInfo, koekiOverride),
      voirMarche: () => canVoirMarche(koekiInfo, koekiOverride),
      gererMarche: () => canGererMarche(koekiInfo, koekiOverride),
      voirComptaGlobale: () => canVoirComptaGlobale(koekiInfo, koekiOverride),
      pointerCompta: () => canPointerCompta(koekiInfo, koekiOverride),
      voirSaCompta: () => canVoirSaCompta(koekiInfo, koekiOverride),
      voirParametres: () => canVoirParametres(koekiInfo, koekiOverride),
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

    refreshRoles,
  };
}
