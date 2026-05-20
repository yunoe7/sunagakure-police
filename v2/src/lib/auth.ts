/**
 * ═══════════════════════════════════════════════════════════════════
 *  NextAuth — Configuration Discord OAuth pour Sunagakure
 * ═══════════════════════════════════════════════════════════════════
 *  - Scopes étendus : identify + email + guilds + guilds.members.read
 *  - Callback signIn : vérifie membre serveur OU whitelist + LOG FIREBASE
 *  - Callback jwt    : enrichit le token + REFRESH AUTO toutes les 60s
 *  - Callback session: expose ces données au client
 *  - Log Firebase    : enregistre les users dans members/{discordId}
 *
 *  ✨ NOUVEAU : refresh automatique des rôles Discord toutes les 60s
 *     via le refresh_token (pas besoin de bot Discord).
 * ═══════════════════════════════════════════════════════════════════
 */

import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import DiscordProvider from "next-auth/providers/discord";
import { fetchGuildMember } from "@/lib/discord";
import { isInWhitelist } from "@/lib/whitelist";
import { buildIntranetUser, type IntranetUser } from "@/lib/roles";

// Refresh des rôles Discord toutes les 60 secondes
const REFRESH_INTERVAL_MS = 60 * 1000;

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
      console.log("[Auth] ✅ logUserToFirebase OK pour", params.username);
    }
  } catch (err) {
    console.error("[Auth] ❌ Erreur logUserToFirebase :", err);
  }
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
      refresh_token: data.refresh_token ?? refreshToken, // Discord ne renvoie pas toujours un nouveau
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 604800), // 7 jours par défaut
    };
  } catch (err) {
    console.error("[Auth] ❌ Erreur refresh Discord token :", err);
    return null;
  }
}

// ─── Helper : re-construit l'IntranetUser depuis Discord ──────────
async function rebuildIntranetUser(
  discordId: string,
  accessToken: string,
  username: string,
  avatarUrl: string | null
): Promise<IntranetUser | null> {
  try {
    const whitelisted = await isInWhitelist(discordId);
    const guildData = await fetchGuildMember(accessToken);

    return buildIntranetUser({
      discordId,
      username,
      avatarUrl,
      roleIds: guildData?.roles ?? [],
      isMembreServeur: guildData?.isMember ?? false,
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
     * Callback JWT : enrichit le token + REFRESH AUTO toutes les 60s.
     *
     * Trois cas :
     * 1. Login initial : on stocke tout (intranet + tokens Discord)
     * 2. Trigger 'update' (refresh manuel via useSession().update()) : refresh forcé
     * 3. À chaque visite : si > 60s depuis le dernier refresh → re-fetch Discord
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
          token.intranet = intranet;

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

      // Refresh nécessaire
      try {
        const discordId = token.discordId as string;
        let accessToken = token.accessToken as string;
        const refreshToken = token.refreshToken as string;
        const expiresAt = (token.expiresAt as number) ?? 0;

        if (!discordId || !refreshToken) {
          // Pas assez d'infos pour refresh → on garde le token tel quel
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
            // Refresh failed : on garde l'ancien intranet, on ré-essaiera plus tard
            console.warn("[Auth] ⚠️ Refresh token Discord échoué, on garde l'ancien intranet");
            token.lastRefresh = Date.now(); // évite de re-tenter en boucle
            return token;
          }
        }

        // Re-fetch les rôles Discord avec l'access_token valide
        const intranet = await rebuildIntranetUser(
          discordId,
          accessToken,
          (token.discordUsername as string) ?? "Inconnu",
          (token.discordAvatar as string) ?? null
        );

        if (intranet) {
          token.intranet = intranet;
          if (trigger === "update") {
            console.log("[Auth] 🔄 Refresh manuel des rôles pour", discordId);
          }
        }

        token.lastRefresh = Date.now();
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
