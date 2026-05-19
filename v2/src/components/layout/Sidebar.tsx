'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import * as Icons from 'lucide-react';
import { NAV_SECTIONS } from '@/lib/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import styles from './Sidebar.module.css';

/**
 * Sidebar gauche, fixe, avec sections de navigation.
 * Remplace tout le bloc <#sidebar> de l'ancien HTML.
 *
 * Le pied de sidebar affiche l'utilisateur Discord connecté
 * et propose un bouton de déconnexion.
 */
export function Sidebar() {
  const pathname = usePathname();
  const user = useCurrentUser();

  function handleLogout() {
    signOut({ callbackUrl: '/login' });
  }

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

      {/* Footer utilisateur Discord */}
      <div className={styles.footer}>
        <Link href="/profil" className={styles.userPill}>
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar}
              alt={user.displayName}
              className={styles.avatarImg}
            />
          ) : (
            <div className={styles.avatar}>{user.initials}</div>
          )}
          <div className={styles.userInfo}>
            <div className={styles.uname}>
              {user.isLoading ? '…' : user.displayName}
            </div>
            <div className={styles.urank}>
              {user.username ? `@${user.username}` : 'NON CONNECTÉ'}
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className={styles.logoutBtnAction}
          title="Se déconnecter"
          aria-label="Se déconnecter"
        >
          <Icons.LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
