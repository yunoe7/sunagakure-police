/**
 * ════════════════════════════════════════════════════════════════
 *  Route API NextAuth.js
 * ════════════════════════════════════════════════════════════════
 *
 *  URL : /api/auth/[action]
 *
 *  Gère automatiquement :
 *    /api/auth/signin        → page de connexion
 *    /api/auth/signin/discord → lance le flow OAuth Discord
 *    /api/auth/callback/discord → callback après login Discord
 *    /api/auth/signout       → déconnexion
 *    /api/auth/session       → infos du user connecté
 *
 *  Variables d'environnement requises (dans .env.local) :
 *    - DISCORD_CLIENT_ID
 *    - DISCORD_CLIENT_SECRET
 *    - NEXTAUTH_SECRET
 *    - NEXTAUTH_URL (= http://localhost:3000 en dev)
 * ════════════════════════════════════════════════════════════════
 */

import NextAuth, { type NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      // On demande les scopes minimaux : identité + email
      authorization: { params: { scope: 'identify email' } },
    }),
  ],

  // Sessions stockées en JWT (stateless, parfait pour Vercel serverless)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },

  // Pages personnalisées (notre /login plus joli que celui par défaut)
  pages: {
    signIn: '/login',
  },

  callbacks: {
    /**
     * Ce callback s'exécute à chaque création/rafraîchissement de JWT.
     * On enrichit le token avec les infos Discord pour les avoir
     * partout dans l'app via useSession().
     */
    async jwt({ token, account, profile }) {
      // Premier login : on stocke les infos Discord
      if (account && profile) {
        const discordProfile = profile as {
          id?: string;
          username?: string;
          global_name?: string;
          discriminator?: string;
          avatar?: string;
        };
        token.discordId = discordProfile.id;
        token.discordUsername = discordProfile.username;
        token.discordGlobalName = discordProfile.global_name || discordProfile.username;
        token.discordAvatar = discordProfile.avatar
          ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png`
          : null;
      }
      return token;
    },

    /**
     * Ce callback expose les données du JWT au client via useSession().
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.discordId = token.discordId as string | undefined;
        session.user.discordUsername = token.discordUsername as string | undefined;
        session.user.discordGlobalName = token.discordGlobalName as string | undefined;
        session.user.discordAvatar = token.discordAvatar as string | null | undefined;
      }
      return session;
    },
  },

  // Debug en dev pour voir les erreurs OAuth dans le terminal
  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

// Export pour l'App Router (Next.js 13+)
// Les deux exports pointent vers le même handler car NextAuth gère
// GET et POST en interne en fonction de l'action.
export const GET = handler;
export const POST = handler;
