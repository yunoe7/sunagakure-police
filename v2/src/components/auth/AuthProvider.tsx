'use client';

/**
 * AuthProvider — Fournit la session NextAuth à toute l'app React.
 *
 * À placer dans le layout racine pour que useSession() soit
 * accessible partout via le hook React standard.
 */

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export default function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
