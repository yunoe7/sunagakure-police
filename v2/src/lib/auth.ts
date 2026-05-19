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
    // GET pour récupérer firstLogin s'il existe déjà
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
      console.log("[Auth] ✅ logUserToFirebase OK pour", params.username, "(", params.discordId, ")");
    }
  } catch (err) {
    console.error("[Auth] ❌ Erreur logUserToFirebase :", err);
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
      try {
        if (account?.provider !== "discord") return false;
        if (!account.access_token) return false;
 
        const discordId = (account.providerAccountId as string) || (user.id as string);
        if (!discordId) {
          console.error("[Auth] signIn : discordId introuvable");
          return false;
        }
 
        // 1) Whitelist admin = accès direct
        const whitelisted = await isInWhitelist(discordId);
 
        // 2) Récupère les infos du serveur Discord (rôles, isMember)
        const guildData = await fetchGuildMember(account.access_token);
 
        const isAllowed = whitelisted || guildData?.isMember;
        if (!isAllowed) {
          console.log("[Auth] ⛔ Accès refusé pour", discordId);
          return "/access-denied";
        }
 
        // ─── On est autorisé : on log dans Firebase ───────────────────
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
 
        // Construire l'IntranetUser pour avoir rang/branches/isAdmin
        const intranet = buildIntranetUser({
          discordId,
          username,
          avatarUrl,
          roleIds: guildData?.roles ?? [],
          isMembreServeur: guildData?.isMember ?? false,
          isWhitelisted: whitelisted,
        });
 
        // Log dans Firebase (non-bloquant : on log même si ça fail)
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
        // En cas d'erreur, on bloque pour éviter une boucle de crash
        return "/access-denied";
      }
    },
 
    /**
     * Callback JWT : enrichit le token (rang, branches, etc.)
     * Note : ce callback ne se redéclenche PAS à chaque visite — seulement
     *        au login OAuth et aux refresh de token. C'est pour ça qu'on a
     *        bougé le log Firebase dans signIn() ci-dessus.
     */
    async jwt({ token, account, profile }) {
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
          const whitelisted = await isInWhitelist(discordId);
          const guildData = await fetchGuildMember(account.access_token!);
 
          const avatarUrl = discordProfile.avatar
            ? `https://cdn.discordapp.com/avatars/${discordId}/${discordProfile.avatar}.png`
            : null;
 
          const intranet = buildIntranetUser({
            discordId,
            username: discordProfile.username ?? "Inconnu",
            avatarUrl,
            roleIds: guildData?.roles ?? [],
            isMembreServeur: guildData?.isMember ?? false,
            isWhitelisted: whitelisted,
          });
 
          token.discordId = discordId;
          token.discordUsername = discordProfile.username;
          token.discordGlobalName = discordProfile.global_name;
          token.discordAvatar = avatarUrl;
          token.intranet = intranet;
        } catch (err) {
          console.error("[Auth] ❌ Erreur dans jwt :", err);
        }
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
