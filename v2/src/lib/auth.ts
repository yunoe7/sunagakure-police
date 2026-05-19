/**
 * ═══════════════════════════════════════════════════════════════════
 *  NextAuth — Configuration Discord OAuth pour Sunagakure
 * ═══════════════════════════════════════════════════════════════════
 *  - Scopes étendus : identify + email + guilds + guilds.members.read
 *  - Callback signIn : vérifie membre serveur OU whitelist + LOG FIREBASE
 *  - Callback jwt    : enrichit le token avec rang + branches + flags
 *  - Callback session: expose ces données au client
 *  - Log Firebase    : enregistre les users dans members/{discordId}
 *                      → déplacé dans signIn() car déclenché à CHAQUE login
 *                        (jwt() ne se redéclenche pas quand le cookie existe)
 * ═══════════════════════════════════════════════════════════════════
 */
 
import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { fetchGuildMember } from "@/lib/discord";
import { isInWhitelist } from "@/lib/whitelist";
import { buildIntranetUser, type IntranetUser } from "@/lib/roles";
 
// ─── Helper : écrire un membre dans Firebase ──────────────────────
async function logUserToFirebase(params: {
  discordId: string;
  username: string;
  globalName?: string;
  avatar?: string;
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
    // GET pour récupérer firstLogin s'il existe déjà
    const getRes = await fetch(url, { cache: "no-store" });
    const existing = getRes.ok ? await getRes.json() : null;
 
    const payload = {
      discordId: params.discordId,
      username: params.username,
      globalName: params.globalName ?? null,
      avatar: params.avatar ?? null,
      email: params.email ?? null,
      rang: params.intranet.rang ?? null,
      branches: params.intranet.branches ?? [],
      isAdmin: params.intranet.isAdmin ?? false,
      firstLogin: existing?.firstLogin ?? now,
      lastLogin: now,
    };
 
    const putRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
 
    if (!putRes.ok) {
      console.error("[Auth] Échec écriture Firebase members/", params.discordId, await putRes.text());
    } else {
      console.log("[Auth] ✅ logUserToFirebase OK pour", params.username, "(", params.discordId, ")");
    }
  } catch (err) {
    console.error("[Auth] Erreur logUserToFirebase :", err);
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
    // ⚠️ Ce callback est appelé à CHAQUE login Discord (contrairement à jwt()
    //    qui se contente du cookie quand il est encore valide).
    //    C'est donc ici qu'on log dans Firebase.
    async signIn({ account, profile, user }) {
      if (account?.provider !== "discord") return false;
      if (!account.access_token) return false;
 
      const discordId = (account.providerAccountId as string) || (user.id as string);
      if (!discordId) {
        console.error("[Auth] signIn : discordId introuvable");
        return false;
      }
 
      // 1) Whitelist admin = accès direct (hardcoded + Firebase)
      const whitelisted = await isInWhitelist(discordId);
 
      // 2) Sinon, doit être membre du serveur Sunagakure
      const guildData = whitelisted
        ? null
        : await fetchGuildMember(account.access_token);
 
      const isAllowed = whitelisted || guildData?.isMember;
      if (!isAllowed) {
        console.log("[Auth] ⛔ Accès refusé pour", discordId);
        return "/access-denied";
      }
 
      // ─── On est autorisé : on log dans Firebase ───────────────────
      // Refetch guildData si on l'avait sauté (cas whitelist)
      const guildForRoles = guildData ?? (await fetchGuildMember(account.access_token));
 
      const discordProfile = (profile ?? {}) as {
        id?: string;
        username?: string;
        global_name?: string;
        avatar?: string;
        email?: string;
      };
 
      const username = discordProfile.username ?? user.name ?? "Inconnu";
      const globalName = discordProfile.global_name;
      const avatar = discordProfile.avatar
        ? `https://cdn.discordapp.com/avatars/${discordId}/${discordProfile.avatar}.png`
        : (user.image ?? undefined);
      const email = discordProfile.email ?? user.email ?? undefined;
 
      // Construire l'IntranetUser pour avoir rang/branches/isAdmin
      const intranet = buildIntranetUser({
        discordId,
        username,
        globalName,
        roles: guildForRoles?.roles ?? [],
        isWhitelisted: whitelisted,
      });
 
      await logUserToFirebase({
        discordId,
        username,
        globalName,
        avatar,
        email,
        intranet,
      });
 
      return true;
    },
 
    /**
     * Callback JWT : enrichit le token (rang, branches, etc.)
     * Note : ce callback ne se redéclenche PAS à chaque visite — seulement
     *        au login OAuth et aux refresh de token. C'est pour ça qu'on a
     *        bougé le log Firebase dans signIn() ci-dessus.
     */
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const discordProfile = profile as {
          id?: string;
          username?: string;
          global_name?: string;
          avatar?: string;
          email?: string;
        };
 
        const discordId = discordProfile.id ?? (account.providerAccountId as string);
        const whitelisted = await isInWhitelist(discordId);
        const guildData = await fetchGuildMember(account.access_token!);
 
        const intranet = buildIntranetUser({
          discordId,
          username: discordProfile.username ?? "Inconnu",
          globalName: discordProfile.global_name,
          roles: guildData?.roles ?? [],
          isWhitelisted: whitelisted,
        });
 
        token.discordId = discordId;
        token.discordUsername = discordProfile.username;
        token.discordGlobalName = discordProfile.global_name;
        token.discordAvatar = discordProfile.avatar
          ? `https://cdn.discordapp.com/avatars/${discordId}/${discordProfile.avatar}.png`
          : null;
        token.intranet = intranet;
      }
      return token;
    },
 
    async session({ session, token }) {
      if (token.intranet) {
        (session as { intranet?: IntranetUser }).intranet = token.intranet as IntranetUser;
      }
      return session;
    },
  },
};
 
