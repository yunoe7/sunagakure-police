'use client';

/**
 * BanGuard — Bloque l'affichage de l'intranet pour un utilisateur banni.
 *
 * Enveloppe le contenu des pages connectées. Si useCurrentUser signale
 * isBanned, on affiche BannedScreen à la place de l'intranet.
 * Pendant le chargement de la session, on laisse passer (évite un flash).
 */

import type { ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { BannedScreen } from '@/components/BannedScreen';

export function BanGuard({ children }: { children: ReactNode }) {
  const { isBanned, banReason, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.6,
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: 13,
        }}
      >
        Chargement…
      </div>
    );
  }

  if (isBanned) {
    return <BannedScreen reason={banReason} />;
  }

  return <>{children}</>;
}
