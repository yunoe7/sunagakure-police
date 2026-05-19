/**
 * Types étendus pour NextAuth.
 *
 * Permet à TypeScript de connaître les champs Discord ajoutés
 * dans le callback session() de [...nextauth]/route.ts.
 *
 * Phase B : ajoute aussi le champ `intranetUser` qui contient
 * le rang, les branches, les permissions gérant/co-gérant, etc.
 */
import 'next-auth';
import 'next-auth/jwt';
import type { IntranetUser } from '@/lib/roles';

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      // Champs Discord ajoutés via callback
      discordId?: string;
      discordUsername?: string;
      discordGlobalName?: string;
      discordAvatar?: string | null;
    };
    // Phase B : utilisateur intranet enrichi (rang, branches, permissions)
    intranetUser?: IntranetUser;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    discordId?: string;
    discordUsername?: string;
    discordGlobalName?: string;
    discordAvatar?: string | null;
    // Phase B : utilisateur intranet enrichi (stocké dans le token)
    intranetUser?: IntranetUser;
  }
}
