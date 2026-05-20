'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { findNavItemByPath } from '@/lib/navigation';
import { useFirebaseConnection } from '@/hooks/useFirebaseConnection';
import { useSidebar } from './SidebarContext';
import styles from './Topbar.module.css';

/**
 * Barre supérieure : titre de la page + indicateur de connexion Firebase.
 *
 * Mobile (< 768px) :
 *  - Affiche un bouton burger à gauche pour ouvrir la sidebar
 *  - Le chemin "~/path" est masqué (manque de place)
 */
export function Topbar() {
  const pathname = usePathname();
  const isConnected = useFirebaseConnection();
  const currentItem = findNavItemByPath(pathname);
  const { toggle } = useSidebar();

  return (
    <header className={styles.topbar}>
      {/* Bouton burger — visible uniquement en mobile */}
      <button
        type="button"
        className={styles.burgerBtn}
        onClick={toggle}
        aria-label="Ouvrir le menu"
        title="Menu"
      >
        <Menu size={20} />
      </button>

      <div
        className={`${styles.statusDot} ${!isConnected ? styles.offline : ''}`}
        title={isConnected ? 'Connecté à Firebase' : 'Hors-ligne'}
      />
      <h1 className={styles.title}>{currentItem?.label ?? 'Sunagakure'}</h1>
      <span className={styles.path}>~/{pathname.replace(/^\//, '')}</span>
    </header>
  );
}
