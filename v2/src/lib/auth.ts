/**
 * ═══════════════════════════════════════════════════════════════════
 *  NextAuth — Configuration Discord OAuth pour Sunagakure
 * ═══════════════════════════════════════════════════════════════════
 *  - Scopes étendus : identify + email + guilds + guilds.members.read
 *  - Callback signIn : vérifie membre serveur OU whitelist
 *  - Callback jwt    : enrichit le token avec rang + branches + flags
 *  - Callback session: expose ces données au client
 *  - Log Firebase     : enregistre les users dans users/{discordId}
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
      if (await isInWhitelist(discordId)) return true;

      // Sinon, doit être membre du serveur Sunagakure
      const guildData = await fetchGuildMember(account.access_token);
      if (guildData?.isMember) return true;

      // Redirection vers /access-denied
      return "/access-denied";
    },

    async jwt({ token, account, profile, user }) {
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
          const isWhitelisted = await isInWhitelist(discordId);

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

          // ─── Log dans Firebase users/{discordId} ─────────────────
          // On enregistre / met à jour automatiquement chaque user
          // pour pouvoir les voir dans /admin/membres
          await logUserToFirebase(intranetUser);
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.discordId = token.discordId as string | undefined;
        session.user.discordUsername = token.discordUsername as string | undefined;
        session.user.discordGlobalName = token.discordGlobalName as string | undefined;
        session.user.discordAvatar = token.discordAvatar as string | null | undefined;
      }

      if (token.intranetUser) {
        session.intranetUser = token.intranetUser as IntranetUser;
      }

      return session;
    },
  },

  debug: process.env.NODE_ENV === "development",
};

// ═══════════════════════════════════════════════════════════════════
//  Log Firebase des utilisateurs
// ═══════════════════════════════════════════════════════════════════

/**
 * Enregistre / met à jour l'utilisateur dans Firebase Realtime DB.
 * Path : users/{discordId}
 *
 * Conserve la date de première connexion (firstLogin) si elle existe,
 * met à jour lastLogin et les infos potentiellement changées
 * (rang, branches, etc. si Discord a évolué entre temps).
 */
async function logUserToFirebase(user: IntranetUser): Promise<void> {
  try {
    const { getDatabase, ref, get, set, update, child } = await import("firebase/database");
    const { initializeApp, getApps } = await import("firebase/app");

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!,
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
    const db = getDatabase(app);

    const userRef = ref(db, `members/${user.discordId}`);
    const now = Date.now();

    // Vérifie si l'utilisateur existe déjà
    const snap = await Promise.race([
      get(child(ref(db), `members/${user.discordId}`)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    const isFirstLogin = !snap || !("exists" in snap) || !snap.exists();

    // Données à toujours mettre à jour
    const updates = {
      discordId: user.discordId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      rangNom: user.rang?.nom ?? null,
      rangNiveau: user.rang?.niveau ?? null,
      branches: user.branches.map((b) => b.slug),
      clan: user.clan,
      gerantDe: user.gerantDe,
      coGerantDe: user.coGerantDe,
      isAdmin: user.isAdmin,
      isStaff: user.isStaff,
      isKazekage: user.isKazekage,
      lastLogin: now,
      ...(isFirstLogin ? { firstLogin: now } : {}),
    };

    if (isFirstLogin) {
      await set(userRef, updates);
    } else {
      await update(userRef, updates);
    }
  } catch (err) {
    // On ne fait pas planter le login si Firebase est down
    console.error("[Auth] logUserToFirebase failed:", err);
  }
}
