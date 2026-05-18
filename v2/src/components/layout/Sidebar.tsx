'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { NAV_SECTIONS } from '@/lib/navigation';
import styles from './Sidebar.module.css';

/**
 * Sidebar gauche, fixe, avec sections de navigation.
 * Remplace tout le bloc <#sidebar> de l'ancien HTML.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoBadge}>砂</div>
        <h1>SUNAGAKURE</h1>
        <span>VILLAGE CACHÉ DU SABLE</span>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className={styles.navSection}>{section.title}</div>
            {section.items.map((item) => {
              // Récupère dynamiquement l'icône depuis lucide-react
              // (ça évite d'importer 50 icônes une par une)
              const Icon = (Icons[item.icon as keyof typeof Icons] ||
                Icons.Circle) as Icons.LucideIcon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                >
                  <Icon size={16} className={styles.icon} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={styles.badge}>{item.badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer utilisateur */}
      <div className={styles.footer}>
        <div className={styles.userPill}>
          <div className={styles.avatar}>N</div>
          <div className={styles.userInfo}>
            <div className={styles.uname}>Ninja</div>
            <div className={styles.urank}>RANK_GENIN</div>
          </div>
          <Icons.LogOut size={15} className={styles.logoutBtn} />
        </div>
      </div>
    </aside>
  );
}
