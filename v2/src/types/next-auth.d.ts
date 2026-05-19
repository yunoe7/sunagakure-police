/**
 * Types étendus pour NextAuth.
 *
 * Permet à TypeScript de connaître les champs Discord ajoutés
 * dans le callback session() de [...nextauth]/route.ts.
 */

import 'next-auth';
import 'next-auth/jwt';

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
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    discordId?: string;
    discordUsername?: string;
    discordGlobalName?: string;
    discordAvatar?: string | null;
  }
}
