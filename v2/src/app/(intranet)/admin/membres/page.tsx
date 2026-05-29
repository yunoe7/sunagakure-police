'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Hook useCurrentUser
 * ════════════════════════════════════════════════════════════════
 *
 * Récupère les infos du user Discord actuellement connecté via NextAuth.
 *
 * ✨ Refresh automatique des rôles Discord toutes les 5 minutes.
 *    Bouton "Refresh mes rôles" pour un effet instantané.
 *
 * 🆕 OVERRIDES EN BASE (modèle "ajout") : on peut attribuer des rôles
 *    depuis /admin/membres, stockés dans Firebase. Ils COMPLÈTENT
 *    Discord (ne retirent jamais) :
 *      - overrides/{id}     → branches, gérant/co-gérant, rang, admin
 *      - koeki/grades/{id}  → grade Kōeki (prime sur le rôle Discord)
 *    Permet de gérer les accès sans dépendre de la propagation parfois
 *    lente des rôles Discord via OAuth.
 *
 * 🥷 RÈGLE "ALL PERM" : Jonin (niveau 7+) ou Conseil du Vent =
 *    toutes les permissions de branche (membre ET gérant), Kōeki inclus.
 *    Maintenance/Whitelist restent réservés aux admins techniques.
 *
 * Usage permissions :
 *   const { user, can } = useCurrentUser();
 *   if (can.adminBranche('police')) { ... }
 *   if (can.membreBranche('police')) { ... }
 *   if (can.koeki.gererSocietes()) { ... }
 * ════════════════════════════════════════════════════════════════
 */

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { IntranetUser, Rang } from '@/lib/roles';
import {
  RANG_HIERARCHIE,
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
import {
  OVERRIDES_PATH,
  normalizeOverride,
  type RoleOverride,
} from '@/types/roleOverrides';

const CLIENT_REFRESH_INTERVAL = 5 * 60 * 1000;
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

/** Construit un Rang à partir d'un niveau (pour l'override de rang). */
function rangFromNiveau(niveau: number): Rang | null {
  const found = RANG_HIERARCHIE.find((r) => r.niveau === niveau);
  return found ? { id: found.id, nom: found.nom, niveau: found.niveau } : null;
}

/**
 * Fusionne l'utilisateur Discord avec les overrides en base (modèle "ajout").
 * - branches / gerantDe / coGerantDe : union (sans doublon)
 * - rang : on garde le plus élevé (max niveau)
 * - isAdmin : Discord OR base
 * Ne retire jamais rien de ce que Discord a donné.
 */
function mergeOverride(base: IntranetUser, ov: RoleOverride): IntranetUser {
  const union = (a: string[], b: string[] | undefined) =>
    Array.from(new Set([...(a ?? []), ...(b ?? [])]));

  // Rang : on prend le max entre Discord et l'override
  let rang = base.rang;
  if (typeof ov.rangNiveau === 'number') {
    const currentNiveau = base.rang?.niveau ?? 0;
    if (ov.rangNiveau > currentNiveau) {
      rang = rangFromNiveau(ov.rangNiveau) ?? base.rang;
    }
  }

  return {
    ...base,
    branches: (() => {
      // union des slugs, en reconstruisant des objets Branche cohérents
      const slugs = union(base.branches.map((b) => b.slug), ov.branches);
      // on garde les objets Branche existants, et pour les slugs ajoutés
      // on crée un objet minimal (id vide, nom = slug capitalisé)
      return slugs.map((slug) => {
        const existing = base.branches.find((b) => b.slug === slug);
        if (existing) return existing;
        return { id: '', nom: slug.charAt(0).toUpperCase() + slug.slice(1), slug };
      });
    })(),
    gerantDe: union(base.gerantDe, ov.gerantDe),
    coGerantDe: union(base.coGerantDe, ov.coGerantDe),
    rang,
    isAdmin: base.isAdmin || ov.isAdmin === true,
  };
}

export function useCurrentUser() {
  const { data: session, status, update } = useSession();
  const user = session?.user;

  const intranetUserRaw =
    ((session as unknown as { intranet?: IntranetUser } | null)?.intranet) ?? null;

  const displayName =
    user?.discordGlobalName ||
    user?.discordUsername ||
    user?.name ||
    intranetUserRaw?.username ||
    'Ninja';

  const myDiscordId = user?.discordId ?? intranetUserRaw?.discordId ?? null;

  // ─── 🆕 Overrides depuis Firebase ──────────────────────────────
  const { data: overrideData } = useFirebaseValue<RoleOverride | null>(
    myDiscordId ? `${OVERRIDES_PATH}/${myDiscordId}` : null
  );
  const { data: gradeOverrideData } = useFirebaseValue<KoekiGradeOverride | null>(
    myDiscordId ? `${KOEKI_GRADES_PATH}/${myDiscordId}` : null
  );

  // intranetUser fusionné avec les overrides de branches/rang/admin
  const intranetUser = useMemo<IntranetUser | null>(() => {
    if (!intranetUserRaw) return null;
    if (!overrideData) return intranetUserRaw;
    return mergeOverride(intranetUserRaw, normalizeOverride(overrideData));
  }, [intranetUserRaw, overrideData]);

  // ─── Refresh manuel ────────────────────────────────────────────
  const refreshRoles = useCallback(async () => {
    try {
      await update();
      console.log('[useCurrentUser] 🔄 Refresh manuel terminé');
    } catch (err) {
      console.error('[useCurrentUser] ❌ Erreur refresh :', err);
    }
  }, [update]);

  // ─── Refresh auto toutes les 5 minutes ─────────────────────────
  const lastTriggerRef = useRef<number>(Date.now());
  useEffect(() => {
    if (status !== 'authenticated') return;
    const interval = setInterval(() => {
      lastTriggerRef.current = Date.now();
      update().catch((err) => console.error('[useCurrentUser] refresh interval :', err));
    }, CLIENT_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [status, update]);

  // ─── Helpers de permissions ────────────────────────────────────
  const hasAllPerm =
    intranetUser !== null &&
    (
      (intranetUser.rang ? intranetUser.rang.niveau >= JONIN_NIVEAU : false) ||
      intranetUser.isConseilDuVent
    );

  const koekiOverride = !!intranetUser && (intranetUser.isAdmin || hasAllPerm);

  // Grade Kōeki effectif : base prime sur Discord
  const baseGrade = gradeOverrideData?.grade ?? null;
  const koekiInfo = baseGrade
    ? gradeToKoekiInfo(baseGrade)
    : (intranetUser?.koeki ?? null);

  const can: Permissions = {
    adminBranche: (slug: string | string[]) => {
      if (!intranetUser) return false;
      if (intranetUser.isAdmin) return true;
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
      if (hasAllPerm) return true;
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
