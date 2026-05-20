/**
 * ═══════════════════════════════════════════════════════════════════
 *  NextAuth — Configuration Discord OAuth pour Sunagakure
 * ═══════════════════════════════════════════════════════════════════
 *  - Scopes étendus : identify + email + guilds + guilds.members.read
 *  - Callback signIn : vérifie membre serveur OU whitelist + LOG FIREBASE
 *  - Callback jwt    : enrichit le token + REFRESH AUTO toutes les 5 min
 *                      + SYNC FIREBASE si les rôles ont changé
 *  - Callback session: expose ces données au client
 *
 *  ✨ Refresh automatique des rôles Discord toutes les 5 minutes
 *  ✨ Sync Firebase si rôles changés (page /admin/membres à jour)
 *
 *  🛡️ GARDE-FOUS ANTI-ÉCRASEMENT :
 *  - Si l'appel Discord retourne null → garde l'ancien intranet
 *  - Si Discord renvoie 0 rôle alors qu'on en avait → garde l'ancien
 *  - Si une erreur survient pendant le refresh → garde l'ancien
 *  - Si Discord rate limit (429) → garde l'ancien (testé en prod)
 * ═══════════════════════════════════════════════════════════════════
 */

import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { fetchGuildMember } from "@/lib/discord";
import { isInWhitelist } from "@/lib/whitelist";
import { buildIntranetUser, type IntranetUser } from "@/lib/roles";

// Intervalle de refresh côté serveur (5 minutes pour éviter le rate limit Discord)
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// ─── Helper : écrire un membre dans Firebase ──────────────────────
async function logUserToFirebase(params: {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  email?: string;
  intranet: IntranetUser;
}) {
  const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    console.warn("[Auth] NEXT_PUBLIC_FIREBASE_DATABASE_URL manquant → skip log Firebase");
    return;
  }

  const url = `${dbUrl}/members/${params.discordId}.json`;
  const now = Date.now();

  try {
    const getRes = await fetch(url, { cache: "no-store" });
    const existing = getRes.ok ? await getRes.json() : null;

    const payload = {
      discordId: params.discordId,
      username: params.username,
      avatarUrl: params.avatarUrl,
      email: params.email ?? null,
      rangNom: params.intranet.rang?.nom ?? null,
      rangNiveau: params.intranet.rang?.niveau ?? null,
      branches: params.intranet.branches.map((b) => b.slug),
      clan: params.intranet.clan,
      isAdmin: params.intranet.isAdmin,
      isKazekage: params.intranet.isKazekage,
      isStaff: params.intranet.isStaff,
      firstLogin: existing?.firstLogin ?? now,
      lastLogin: now,
    };

    const putRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!putRes.ok) {
      console.error("[Auth] ❌ Échec écriture Firebase members/", params.discordId, await putRes.text());
    } else {
      console.log("[Auth] ✅ Firebase sync OK pour", params.username);
    }
  } catch (err) {
    console.error("[Auth] ❌ Erreur logUserToFirebase :", err);
  }
}

// ─── Helper : compare deux IntranetUser pour savoir si Firebase doit être mis à jour
function hasIntranetChanged(oldUser: IntranetUser | null, newUser: IntranetUser): boolean {
  if (!oldUser) return true;
  if (oldUser.rang?.id !== newUser.rang?.id) return true;
  if (oldUser.clan !== newUser.clan) return true;
  if (oldUser.isAdmin !== newUser.isAdmin) return true;
  if (oldUser.isKazekage !== newUser.isKazekage) return true;
  if (oldUser.isStaff !== newUser.isStaff) return true;

  const oldBranches = oldUser.branches.map((b) => b.slug).sort().join(',');
  const newBranches = newUser.branches.map((b) => b.slug).sort().join(',');
  if (oldBranches !== newBranches) return true;

  const oldGerant = [...oldUser.gerantDe].sort().join(',');
  const newGerant = [...newUser.gerantDe].sort().join(',');
  if (oldGerant !== newGerant) return true;

  const oldCoGerant = [...oldUser.coGerantDe].sort().join(',');
  const newCoGerant = [...newUser.coGerantDe].sort().join(',');
  if (oldCoGerant !== newCoGerant) return true;

  return false;
}

// ─── Helper : renouvelle l'access_token Discord via refresh_token ──
async function refreshDiscordAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
} | null> {
  try {
    const url = "https://discord.com/api/v10/oauth2/token";
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      console.error("[Auth] ❌ Échec refresh Discord token :", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 604800),
    };
  } catch (err) {
    console.error("[Auth] ❌ Erreur refresh Discord token :", err);
    return null;
  }
}

// ─── Helper : re-construit l'IntranetUser depuis Discord ──────────
/**
 * 🛡️ Garde-fous anti-écrasement :
 * - Retourne null si l'appel Discord échoue (le caller garde l'ancien intranet)
 * - Retourne null si Discord renvoie 0 rôle alors qu'on en avait avant
 *   (signe d'un bug temporaire : rate limit, timeout, etc.)
 */
async function rebuildIntranetUser(
  discordId: string,
  accessToken: string,
  username: string,
  avatarUrl: string | null,
  previousRolesCount = 0
): Promise<IntranetUser | null> {
  try {
    const whitelisted = await isInWhitelist(discordId);
    const guildData = await fetchGuildMember(accessToken);

    // 🛡️ Garde-fou 1 : appel Discord raté (incluant rate limit 429)
    if (!guildData) {
      console.warn("[Auth] ⚠️ fetchGuildMember a renvoyé null, refresh annulé");
      return null;
    }

    const newRoles = guildData.roles ?? [];

    // 🛡️ Garde-fou 2 : réponse vide suspecte
    // Si on avait des rôles avant et que Discord renvoie 0 rôle maintenant,
    // c'est presque certainement un bug temporaire. On préfère garder l'ancien.
    if (newRoles.length === 0 && previousRolesCount > 0) {
      console.warn(
        "[Auth] ⚠️ Discord a renvoyé 0 rôle alors qu'on en avait",
        previousRolesCount,
        "→ refresh annulé pour protéger les permissions"
      );
      return null;
    }

    return buildIntranetUser({
      discordId,
      username,
      avatarUrl,
      roleIds: newRoles,
      isMembreServeur: guildData.isMember ?? false,
      isWhitelisted: whitelisted,
    });
  } catch (err) {
    console.error("[Auth] ❌ Erreur rebuildIntranetUser :", err);
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "identify email guilds guilds.members.read",
        },
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },

  pages: {
    signIn: "/login",
    error: "/access-denied",
  },

  callbacks: {
    // ─── signIn : bloque les non-autorisés + LOG FIREBASE ────────────
    async signIn({ account, profile, user }) {
      try {
        if (account?.provider !== "discord") return false;
        if (!account.access_token) return false;

        const discordId = (account.providerAccountId as string) || (user.id as string);
        if (!discordId) {
          console.error("[Auth] signIn : discordId introuvable");
          return false;
        }

        const whitelisted = await isInWhitelist(discordId);
        const guildData = await fetchGuildMember(account.access_token);

        const isAllowed = whitelisted || guildData?.isMember;
        if (!isAllowed) {
          console.log("[Auth] ⛔ Accès refusé pour", discordId);
          return "/access-denied";
        }

        const discordProfile = (profile ?? {}) as {
          id?: string;
          username?: string;
          global_name?: string;
          avatar?: string;
          email?: string;
        };

        const username = discordProfile.username ?? user.name ?? "Inconnu";
        const avatarUrl = discordProfile.avatar
          ? `https://cdn.discordapp.com/avatars/${discordId}/${discordProfile.avatar}.png`
          : (user.image ?? null);
        const email = discordProfile.email ?? user.email ?? undefined;

        const intranet = buildIntranetUser({
          discordId,
          username,
          avatarUrl,
          roleIds: guildData?.roles ?? [],
          isMembreServeur: guildData?.isMember ?? false,
          isWhitelisted: whitelisted,
        });

        await logUserToFirebase({
          discordId,
          username,
          avatarUrl,
          email,
          intranet,
        });

        return true;
      } catch (err) {
        console.error("[Auth] ❌ Erreur dans signIn :", err);
        return "/access-denied";
      }
    },

    /**
     * Callback JWT : enrichit le token + REFRESH AUTO toutes les 5 minutes.
     *
     * Trois cas :
     * 1. Login initial : on stocke tout (intranet + tokens Discord)
     * 2. Trigger 'update' (refresh manuel via useSession().update()) : refresh forcé
     * 3. À chaque visite : si > 5 min depuis le dernier refresh → re-fetch Discord
     */
    async jwt({ token, account, profile, trigger }) {
      // ─── 1. Login initial : on stocke tout ───────────────────────
      if (account && profile) {
        try {
          const discordProfile = profile as {
            id?: string;
            username?: string;
            global_name?: string;
            avatar?: string;
            email?: string;
          };

          const discordId = discordProfile.id ?? (account.providerAccountId as string);
          const avatarUrl = discordProfile.avatar
            ? `https://cdn.discordapp.com/avatars/${discordId}/${discordProfile.avatar}.png`
            : null;
          const username = discordProfile.username ?? "Inconnu";

          const intranet = await rebuildIntranetUser(
            discordId,
            account.access_token!,
            username,
            avatarUrl
          );

          token.discordId = discordId;
          token.discordUsername = discordProfile.username;
          token.discordGlobalName = discordProfile.global_name;
          token.discordAvatar = avatarUrl;
          if (intranet) token.intranet = intranet;

          // Tokens Discord pour refresh ultérieur
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.expiresAt = account.expires_at ?? (Math.floor(Date.now() / 1000) + 604800);
          token.lastRefresh = Date.now();
        } catch (err) {
          console.error("[Auth] ❌ Erreur dans jwt (login initial) :", err);
        }
        return token;
      }

      // ─── 2 & 3. Refresh manuel OU automatique ───────────────────
      const lastRefresh = (token.lastRefresh as number) ?? 0;
      const elapsed = Date.now() - lastRefresh;
      const shouldRefresh = trigger === "update" || elapsed > REFRESH_INTERVAL_MS;

      if (!shouldRefresh) return token;

      try {
        const discordId = token.discordId as string;
        let accessToken = token.accessToken as string;
        const refreshToken = token.refreshToken as string;
        const expiresAt = (token.expiresAt as number) ?? 0;

        // 🛡️ Garde-fou : si pas assez d'infos pour refresh, on garde le token tel quel
        if (!discordId || !refreshToken || !accessToken) {
          console.warn("[Auth] ⚠️ JWT sans tokens Discord (vieux JWT), refresh impossible");
          token.lastRefresh = Date.now();
          return token;
        }

        // Si l'access_token expire dans moins de 5 min, on le renouvelle
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt - now < 300) {
          console.log("[Auth] 🔄 Renouvellement access_token Discord...");
          const refreshed = await refreshDiscordAccessToken(refreshToken);
          if (refreshed) {
            accessToken = refreshed.access_token;
            token.accessToken = refreshed.access_token;
            token.refreshToken = refreshed.refresh_token;
            token.expiresAt = refreshed.expires_at;
          } else {
            // Refresh failed : on garde l'ancien intranet
            console.warn("[Auth] ⚠️ Refresh token Discord échoué, on garde l'ancien intranet");
            token.lastRefresh = Date.now();
            return token;
          }
        }

        // 🛡️ On compte les rôles actuels pour détecter les réponses Discord vides suspectes
        const previousRolesCount = (token.intranet as IntranetUser)?.rolesRaw?.length ?? 0;

        // Re-fetch les rôles Discord avec garde-fou anti-écrasement
        const newIntranet = await rebuildIntranetUser(
          discordId,
          accessToken,
          (token.discordUsername as string) ?? "Inconnu",
          (token.discordAvatar as string) ?? null,
          previousRolesCount
        );

        // 🛡️ Si le refresh a échoué (Discord API down, rate limit, réponse vide, etc.),
        //    on garde l'ancien intranet pour ne pas perdre les permissions
        if (!newIntranet) {
          token.lastRefresh = Date.now();
          return token;
        }

        const oldIntranet = (token.intranet as IntranetUser) ?? null;

        // 🆕 Si les rôles ont changé, on sync Firebase
        if (hasIntranetChanged(oldIntranet, newIntranet)) {
          console.log("[Auth] 🔄 Rôles modifiés pour", discordId, "→ sync Firebase");
          await logUserToFirebase({
            discordId,
            username: (token.discordUsername as string) ?? "Inconnu",
            avatarUrl: (token.discordAvatar as string) ?? null,
            intranet: newIntranet,
          });
        }

        token.intranet = newIntranet;
        token.lastRefresh = Date.now();

        if (trigger === "update") {
          console.log("[Auth] 🔄 Refresh manuel terminé pour", discordId);
        }
      } catch (err) {
        console.error("[Auth] ❌ Erreur refresh jwt :", err);
        token.lastRefresh = Date.now(); // évite la boucle d'erreurs
      }

      return token;
    },

    async session({ session, token }) {
      if (token.intranet) {
        (session as { intranet?: IntranetUser }).intranet = token.intranet as IntranetUser;
      }
      // Expose un flag pour que le client sache quand a eu lieu le dernier refresh
      (session as { lastRefresh?: number }).lastRefresh = token.lastRefresh as number;
      return session;
    },
  },
};
