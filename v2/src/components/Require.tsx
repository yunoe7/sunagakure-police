'use client';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Composants de permissions
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Ces composants masquent du contenu selon le statut de l'utilisateur.
 *  Idéal pour cacher les boutons d'édition aux non-autorisés.
 *
 *  Exemples d'usage :
 *
 *  // 1) Boutons réservés aux Gérants de la branche Police (ou Admin) :
 *  <RequireBranche branche="police">
 *    <button>Ajouter un dossier</button>
 *  </RequireBranche>
 *
 *  // 1bis) Branches multiples — accès si l'user gère AU MOINS UNE :
 *  <RequireBranche branche={['medecin', 'scientifique']}>
 *    <button>Modifier le rapport d'autopsie</button>
 *  </RequireBranche>
 *
 *  // 2) Avec un fallback (visible si non autorisé) :
 *  <RequireBranche branche="medecin" fallback={<p>Lecture seule</p>}>
 *    <button>Modifier</button>
 *  </RequireBranche>
 *
 *  // 3) Panel admin général (Admin / Staff / Conseil) :
 *  <RequireAdmin>
 *    <PanelAdmin />
 *  </RequireAdmin>
 *
 *  // 4) Réservé strictement aux Admin (whitelist + Kazekage RP) :
 *  <RequireAdminStrict>
 *    <BoutonsKazekage />
 *  </RequireAdminStrict>
 *
 *  // 5) Réservé à un rang minimum (ex: Jonin+) :
 *  <RequireRang niveau={7}>
 *    <button>Action Jonin+</button>
 *  </RequireRang>
 *
 *  // 6) Membre d'une branche (peu importe le rôle) :
 *  <RequireMembreBranche branche="police">
 *    <PageDossiers />
 *  </RequireMembreBranche>
 *
 *  // 6bis) Membre d'une des branches données :
 *  <RequireMembreBranche branche={['medecin', 'scientifique']}>
 *    <PageMorgue />
 *  </RequireMembreBranche>
 *
 *  // Niveaux disponibles :
 *  //  1 = Genin           7 = Jonin
 *  //  2 = Genin confirmé  8 = Sairin
 *  //  3 = Tokubetsu Chunin 9 = Commandant Jonin
 *  //  4 = Chunin          10 = Bras droit du Kazekage
 *  //  5 = Kakunin         11 = Kazekage
 *  //  6 = Tokubetsu Jonin
 *
 *  🥷 RÈGLE "ALL PERM" automatique pour :
 *  - Rang Jonin (niveau 7) et au-dessus
 *  - Membres du Conseil du Vent
 *  (Tous gérée par useCurrentUser via can.membreBranche / can.adminBranche)
 * ═══════════════════════════════════════════════════════════════════
 */

import type { ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

type RequireProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Affiche le contenu UNIQUEMENT pour les Gérants / Co-gérants de la (ou des) branche(s)
 * donnée(s), OU pour tout Admin (whitelist + Kazekage RP).
 * 🥷 Aussi pour les Jonin+ et Conseil du Vent (via can.adminBranche).
 */
export function RequireBranche({
  branche,
  children,
  fallback = null,
}: RequireProps & { branche: string | string[] }) {
  const { can, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!can.adminBranche(branche)) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Affiche le contenu pour les Admin technique, Staff, Conseil du Vent
 * ou Conseiller du Kazekage.
 *
 * Utile pour les panels d'administration générale.
 */
export function RequireAdmin({ children, fallback = null }: RequireProps) {
  const { can, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!can.adminGeneral()) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Affiche le contenu UNIQUEMENT pour les Admin techniques (whitelist + Kazekage RP).
 * Plus strict que RequireAdmin (exclut Staff/Conseil).
 *
 * Utile pour les actions critiques (gérer la whitelist, supprimer des comptes...).
 */
export function RequireAdminStrict({ children, fallback = null }: RequireProps) {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!user?.isAdmin) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Affiche le contenu UNIQUEMENT au-dessus d'un rang ninja minimum.
 *
 * @param niveau niveau minimum (1 = Genin, 11 = Kazekage)
 */
export function RequireRang({
  niveau,
  children,
  fallback = null,
}: RequireProps & { niveau: number }) {
  const { can, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!can.rangAuMoins(niveau)) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Affiche le contenu UNIQUEMENT pour les membres d'une (ou plusieurs) branche(s).
 * Différent de RequireBranche : ici PAS de check Gérant, juste l'appartenance.
 *
 * 🥷 Utilise can.membreBranche() qui inclut la règle Jonin+ et Conseil du Vent.
 *
 * @param branche slug de branche ou liste de slugs (au moins un suffit).
 *                Ex: "police", ["medecin", "scientifique"]
 */
export function RequireMembreBranche({
  branche,
  children,
  fallback = null,
}: RequireProps & { branche: string | string[] }) {
  const { can, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!can.membreBranche(branche)) return <>{fallback}</>;
  return <>{children}</>;
}
