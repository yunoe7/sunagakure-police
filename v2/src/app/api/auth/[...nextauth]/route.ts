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
 *  La configuration est dans @/lib/auth (authOptions).
 * ════════════════════════════════════════════════════════════════
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

// Export pour l'App Router (Next.js 13+)
// Les deux exports pointent vers le même handler car NextAuth gère
// GET et POST en interne en fonction de l'action.
export const GET = handler;
export const POST = handler;

