/**
 * ═══════════════════════════════════════════════════════════════════
 *  NextAuth — Configuration Discord OAuth pour Sunagakure
 * ═══════════════════════════════════════════════════════════════════
 *  - Scopes étendus : identify + email + guilds + guilds.members.read
 *  - Callback signIn : vérifie membre serveur OU whitelist
 *  - Callback jwt    : enrichit le token avec rang + branches + flags
 *  - Callback session: expose ces données au client
 *
 *  Variables d'environnement requises (dans .env.local) :
 *    - DISCORD_CLIENT_ID
 *    - DISCORD_CLIENT_SECRET
 *    - NEXTAUTH_SECRET
 *    - NEXTAUTH_URL
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
          // identify+email = existant, guilds+guilds.members.read = nouveau pour Phase B
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
    // ─── Callback signIn : bloque les non-autorisés ─────────────────
    async signIn({ account, user }) {
      if (account?.provider !== "discord") return false;
      if (!account.access_token) return false;

      const discordId = (account.providerAccountId as string) || (user.id as string);

      // Whitelist admin = accès direct
      if (isInWhitelist(discordId)) return true;

      // Sinon, doit être membre du serveur Sunagakure
      const guildData = await fetchGuildMember(account.access_token);
      if (guildData?.isMember) return true;

      // Redirection vers /access-denied
      return "/access-denied";
    },

    /**
     * Callback JWT : enrichit le token avec :
     *  - Les champs Discord existants (discordId, discordUsername, etc.)
     *  - Le nouvel objet intranetUser (rang, branches, gérant, etc.)
     */
    async jwt({ token, account, profile, user }) {
      // Premier login : on a un account + access_token
      if (account && profile) {
        const discordProfile = profile as {
          id?: string;
          username?: string;
          global_name?: string;
          discriminator?: string;
          avatar?: string;
        };

        // ─── Champs existants (préservés) ──────────────────────────
        token.discordId = discordProfile.id;
        token.discordUsername = discordProfile.username;
        token.discordGlobalName = discordProfile.global_name || discordProfile.username;
        token.discordAvatar = discordProfile.avatar
          ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png`
          : null;

        // ─── Nouveaux champs Phase B : IntranetUser ────────────────
        if (account.access_token) {
          const discordId = discordProfile.id ?? (account.providerAccountId as string);
          const isWhitelisted = isInWhitelist(discordId);

          const guildData = await fetchGuildMember(account.access_token);
          const isMembreServeur = guildData?.isMember ?? false;
          const roleIds = guildData?.roles ?? [];

          const intranetUser = buildIntranetUser({
            discordId,
            username: (token.discordGlobalName as string) ?? user?.name ?? "Ninja inconnu",
            avatarUrl: (token.discordAvatar as string | null) ?? user?.image ?? null,
            roleIds,
            isMembreServeur,
            isWhitelisted,
          });

          token.intranetUser = intranetUser;
        }
      }

      return token;
    },

    /**
     * Callback session : expose les données au client.
     * On garde TOUS les champs existants + on ajoute intranetUser.
     */
    async session({ session, token }) {
      if (session.user) {
        // ─── Champs existants (préservés) ──────────────────────────
        session.user.discordId = token.discordId as string | undefined;
        session.user.discordUsername = token.discordUsername as string | undefined;
        session.user.discordGlobalName = token.discordGlobalName as string | undefined;
        session.user.discordAvatar = token.discordAvatar as string | null | undefined;
      }

      // ─── Nouveau champ Phase B ────────────────────────────────────
      if (token.intranetUser) {
        session.intranetUser = token.intranetUser as IntranetUser;
      }

      return session;
    },
  },

  debug: process.env.NODE_ENV === "development",
};
