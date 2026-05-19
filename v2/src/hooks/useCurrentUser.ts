'use client';
 
/**
 * ════════════════════════════════════════════════════════════════
 *  Hook useCurrentUser
 * ════════════════════════════════════════════════════════════════
 *
 * Récupère les infos du user Discord actuellement connecté via
 * NextAuth.
 *
 * Usage (existant, ne change pas) :
 *   const { username, displayName, avatar, isLoading } = useCurrentUser();
 *
 * Usage Phase B :
 *   const { user, can } = useCurrentUser();
 *   if (can.adminBranche('police')) { ... }
 *   if (user?.isAdmin) { ... }
 *   if (user?.rang?.nom === 'Tokubetsu Jonin') { ... }
 *
 * ⚠️ BUG FIX (mai 2026) :
 *   Avant, ce hook lisait `session.intranetUser`, mais auth.ts écrit
 *   `session.intranet` (sans "User"). Du coup `intranetUser` était
 *   toujours null → personne n'avait jamais de rang, branche, ou admin.
 *   Corrigé pour lire `session.intranet`.
 * ════════════════════════════════════════════════════════════════
 */
 
import { useSession } from 'next-auth/react';
import type { IntranetUser } from '@/lib/roles';
 
export type Permissions = {
  /** Peut gérer la branche donnée (Gérant OU Co-gérant OU Admin) */
  adminBranche: (slug: string) => boolean;
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
 
  // ─── FIX : auth.ts écrit `session.intranet` (pas `intranetUser`) ───
  // On lit le bon champ. Cast nécessaire car NextAuth ne connaît pas
  // ce champ étendu dans ses types par défaut.
  const intranetUser =
    ((session as unknown as { intranet?: IntranetUser } | null)?.intranet) ?? null;
 
  // Le nom à utiliser pour signer les actions dans Firebase :
  // priorité au global_name (le pseudo affiché Discord),
  // sinon le username, sinon "Ninja" en dernier recours.
  const displayName =
    user?.discordGlobalName ||
    user?.discordUsername ||
    user?.name ||
    intranetUser?.username ||
    'Ninja';
 
  // ─── Helpers de permissions (Phase B) ──────────────────────────
  const can: Permissions = {
    adminBranche: (slug: string) => {
      if (!intranetUser) return false;
      if (intranetUser.isAdmin) return true;
      return (
        intranetUser.gerantDe.includes(slug) ||
        intranetUser.coGerantDe.includes(slug)
      );
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
    // ─── Champs existants (préservés) ────────────────────────────
    /** Pseudo Discord brut (ex: "yuno6901") */
    username: user?.discordUsername ?? intranetUser?.username,
    /** Nom affiché Discord (peut être différent du username) */
    displayName,
    /** URL de l'avatar Discord, null si pas d'avatar */
    avatar: user?.discordAvatar || user?.image || intranetUser?.avatarUrl || null,
    /** Discord ID */
    id: user?.discordId ?? intranetUser?.discordId,
    /** Email Discord */
    email: user?.email,
    /** Initiales pour fallback avatar */
    initials: getInitials(displayName),
    /** Session en cours de chargement */
    isLoading: status === 'loading',
    /** User authentifié */
    isAuthed: status === 'authenticated',
 
    // ─── Nouveaux champs Phase B ─────────────────────────────────
    /** IntranetUser complet (null si pas connecté ou pas encore chargé) */
    user: intranetUser,
    /** Helpers de permissions */
    can,
    /** Alias de isAuthed pour cohérence */
    isAuthenticated: status === 'authenticated' && intranetUser !== null,
  };
}
