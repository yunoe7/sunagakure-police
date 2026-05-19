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
    const url = `${DISCORD_API}/users/@me/guilds/${GUILD_ID}/member`;
    console.log("[Discord DEBUG] Appel URL:", url);
    console.log("[Discord DEBUG] Token (premiers chars):", accessToken.slice(0, 10) + "...");
 
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
 
    console.log("[Discord DEBUG] Status HTTP:", res.status, res.statusText);
 
    if (res.status === 404) {
      console.log("[Discord DEBUG] 404 → pas membre du serveur");
      return { isMember: false, roles: [] };
    }
 
    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        `[Discord] fetchGuildMember failed: ${res.status} ${res.statusText}`,
        "BODY:", errorText
      );
      return null;
    }
 
    const data = (await res.json()) as { roles?: string[]; nick?: string; user?: { username?: string } };
 
    // ─── LOG DE DEBUG TRES VERBEUX ─────────────────────────────────
    console.log("[Discord DEBUG] Réponse complète:", JSON.stringify(data));
    console.log("[Discord DEBUG] data.roles =", data.roles);
    console.log("[Discord DEBUG] Type de data.roles =", typeof data.roles);
    console.log("[Discord DEBUG] Array.isArray(data.roles) =", Array.isArray(data.roles));
    console.log("[Discord DEBUG] Nombre de rôles =", Array.isArray(data.roles) ? data.roles.length : "N/A");
 
    return {
      isMember: true,
      roles: Array.isArray(data.roles) ? data.roles : [],
    };
  } catch (err) {
    console.error("[Discord] fetchGuildMember error:", err);
    return null;
  }
}
