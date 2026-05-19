/**
 * Proxy NextAuth — Protection des routes
 *
 * Anciennement appelé "middleware.ts" dans Next.js 13-15.
 * Renommé en "proxy.ts" dans Next.js 16+.
 *
 * S'exécute AVANT chaque requête vers une page de l'intranet.
 * Si l'utilisateur n'est pas connecté, le redirige vers /login.
 *
 * Le `matcher` ci-dessous précise quelles URLs sont protégées.
 * On exclut :
 *   - /api/auth/*    (endpoints NextAuth, sinon boucle infinie)
 *   - /login         (page de connexion publique)
 *   - /_next/*       (assets Next.js)
 *   - /favicon.ico
 *   - les fichiers statiques (images, fonts, etc.)
 */

import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  // Tout ce qui matche est PROTÉGÉ (= besoin d'être connecté).
  // Cette regex exclut les routes publiques.
  matcher: [
    /*
     * Match toutes les routes SAUF :
     * - /api/auth/* (endpoints NextAuth)
     * - /login (page de connexion)
     * - /_next/static (fichiers Next.js)
     * - /_next/image (optimisation images Next.js)
     * - /favicon.ico
     * - Fichiers avec extension (images, JSON, etc.)
     */
    '/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
