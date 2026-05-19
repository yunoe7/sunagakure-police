/**
 * ═══════════════════════════════════════════════════════════════════
 *  NextAuth — Configuration Discord OAuth pour Sunagakure
 * ═══════════════════════════════════════════════════════════════════
 *  - Scopes étendus : identify + guilds + guilds.members.read
 *  - Callback signIn : vérifie membre serveur OU whitelist
 *  - Callback jwt    : enrichit le token avec rang + branches + flags
 *  - Callback session: expose ces données au client
 * ═══════════════════════════════════════════════════════════════════
 */

import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { fetchGuildMember } from "@/lib/discord";
import { isInWhitelist } from "@/lib/whitelist";
import { buildIntranetUser, type IntranetUser } from "@/lib/roles";

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          // Scopes étendus pour récupérer les rôles dans le serveur
          scope: "identify guilds guilds.members.read",
        },
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/",
    error: "/access-denied",
  },

  callbacks: {
    // ─── Callback OAuth : récupère l'access_token pour la suite ─────
    async jwt({ token, account, user, trigger }) {
      // 1er passage (login) : on a un account + access_token
      if (account?.access_token && user) {
        const discordId = (account.providerAccountId as string) || (user.id as string);
        const isWhitelisted = isInWhitelist(discordId);

        // Appel Discord API pour récupérer les rôles dans le guild
        const guildData = await fetchGuildMember(account.access_token);
        const isMembreServeur = guildData?.isMember ?? false;
        const roleIds = guildData?.roles ?? [];

        // Construction de l'utilisateur intranet
        const intranetUser = buildIntranetUser({
          discordId,
          username: user.name ?? "Ninja inconnu",
          avatarUrl: user.image ?? null,
          roleIds,
          isMembreServeur,
          isWhitelisted,
        });

        // On stocke tout dans le JWT
        token.intranetUser = intranetUser;
        token.accessDenied = !intranetUser.isMembreServeur && !intranetUser.isWhitelisted;
      }

      return token;
    },

    // ─── Callback signIn : bloque les non-autorisés ─────────────────
    async signIn({ account, user }) {
      if (account?.provider !== "discord") return false;
      if (!account.access_token) return false;

      const discordId = (account.providerAccountId as string) || (user.id as string);

      // Whitelist Kazekage = accès direct
      if (isInWhitelist(discordId)) return true;

      // Sinon, doit être membre du serveur
      const guildData = await fetchGuildMember(account.access_token);
      if (guildData?.isMember) return true;

      // Redirection vers /access-denied
      return "/access-denied";
    },

    // ─── Callback session : expose les données au client ────────────
    async session({ session, token }) {
      if (token.intranetUser) {
        session.intranetUser = token.intranetUser as IntranetUser;
      }
      return session;
    },
  },
};
