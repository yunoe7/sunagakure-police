/**
 * ═══════════════════════════════════════════════════════════════════
 *  Whitelist Admin — accès admin technique garanti
 * ═══════════════════════════════════════════════════════════════════
 *  Ces Discord User IDs ont accès admin total à l'intranet,
 *  INDÉPENDAMMENT de leur rôle RP sur le serveur Discord.
 *
 *  ⚠️ Important : être whitelisté ici donne les permissions
 *  TECHNIQUES (gérer l'intranet, voir tout, modifier tout),
 *  mais ne change PAS le rôle RP affiché dans l'intranet.
 *
 *  Exemple : un Tokubetsu Jonin whitelisté reste affiché
 *  comme Tokubetsu Jonin, mais peut tout gérer en coulisses.
 *
 *  Pour ajouter quelqu'un : ajoute simplement son Discord User ID
 *  dans le tableau ci-dessous.
 *
 *  En Phase C, cette whitelist sera gérée via /admin/whitelist
 *  (page UI réservée aux admins).
 * ═══════════════════════════════════════════════════════════════════
 */

export const ADMIN_WHITELIST: string[] = [
  "1239889177055596607", // Toi (Tokubetsu Jonin RP, admin technique)
];

/**
 * Vérifie si un Discord User ID est dans la whitelist admin.
 */
export function isInWhitelist(discordId: string): boolean {
  return ADMIN_WHITELIST.includes(discordId);
}
