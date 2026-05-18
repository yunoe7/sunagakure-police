'use client';

import { usePathname } from 'next/navigation';
import { findNavItemByPath } from '@/lib/navigation';
import { useFirebaseConnection } from '@/hooks/useFirebaseConnection';
import styles from './Topbar.module.css';

/**
 * Barre supérieure : titre de la page + indicateur de connexion Firebase.
 * Remplace le bloc <.topbar> de l'ancien HTML.
 */
export function Topbar() {
  const pathname = usePathname();
  const isConnected = useFirebaseConnection();
  const currentItem = findNavItemByPath(pathname);

  return (
    <header className={styles.topbar}>
      <div
        className={`${styles.statusDot} ${!isConnected ? styles.offline : ''}`}
        title={isConnected ? 'Connecté à Firebase' : 'Hors-ligne'}
      />
      <h1 className={styles.title}>{currentItem?.label ?? 'Sunagakure'}</h1>
      <span className={styles.path}>~/{pathname.replace(/^\//, '')}</span>
    </header>
  );
}
