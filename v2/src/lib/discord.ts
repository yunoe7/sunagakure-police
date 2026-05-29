/**
 * ═══════════════════════════════════════════════════════════════════
 *  Discord API — Récupération des rôles de l'utilisateur
 * ═══════════════════════════════════════════════════════════════════
 *  Utilise l'access_token OAuth pour appeler l'API Discord et
 *  récupérer les rôles que l'user a sur le serveur Sunagakure.
 * ═══════════════════════════════════════════════════════════════════
 */
import { GUILD_ID } from "./roles";

const DISCORD_API = "https://discord.com/api/v10";

/**
 * Récupère les infos du membre dans le guild Sunagakure.
 * Retourne null si l'user n'est PAS membre du serveur.
 *
 * Nécessite le scope `guilds.members.read` sur l'access_token.
 */
export async function fetchGuildMember(accessToken: string): Promise<{
  isMember: boolean;
  roles: string[];
} | null> {
  try {
    const res = await fetch(
      `${DISCORD_API}/users/@me/guilds/${GUILD_ID}/member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        // Pas de cache : on veut les rôles à jour à chaque login
        cache: "no-store",
      }
    );

    // 404 = pas membre du serveur
    if (res.status === 404) {
      return { isMember: false, roles: [] };
    }

    if (!res.ok) {
      console.error(
        `[Discord] fetchGuildMember failed: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const data = (await res.json()) as { roles?: string[] };

    return {
      isMember: true,
      roles: Array.isArray(data.roles) ? data.roles : [],
    };
  } catch (err) {
    console.error("[Discord] fetchGuildMember error:", err);
    return null;
  }
}
