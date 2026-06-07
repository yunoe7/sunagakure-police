/**
 * ════════════════════════════════════════════════════════════════
 *  Bannissements du site (par ID Discord)
 * ════════════════════════════════════════════════════════════════
 *  bans/{discordId} → un utilisateur banni ne peut plus rien faire
 *  sur l'intranet, même si Discord lui donne des rôles.
 *  Vérifié dans useCurrentUser au chargement.
 * ════════════════════════════════════════════════════════════════
 */

export const BANS_PATH = 'bans';

export type Ban = {
  banned: boolean;
  reason: string | null;
  bannedBy: string;
  bannedById: string | null;
  bannedAt: number;
};

export function isBanned(ban: Ban | null | undefined): boolean {
  return ban?.banned === true;
}
