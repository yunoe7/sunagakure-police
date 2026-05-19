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
 * Le pied de sidebar affiche l'utilisateur Discord connecté avec :
 *  - Avatar Discord
 *  - Pseudo + badge ADMIN si admin technique
 *  - Rang ninja (ex: "Tokubetsu Jonin")
 *  - Branche(s) + clan séparés par "·" (ex: "Police · Sabaku")
 * Et propose un bouton de déconnexion.
 */
export function Sidebar() {
  const pathname = usePathname();
  const u = useCurrentUser();

  function handleLogout() {
    signOut({ callbackUrl: '/login' });
  }

  // ─── Construction de la ligne "Branche · Clan" ─────────────────
  // On limite à 2 branches max pour ne pas surcharger la sidebar.
  const branchesAffichees = u.user?.branches.slice(0, 2).map((b) => b.nom) ?? [];
  if ((u.user?.branches.length ?? 0) > 2) {
    branchesAffichees.push(`+${u.user!.branches.length - 2}`);
  }
  const segmentsBas = [...branchesAffichees];
  if (u.user?.clan) segmentsBas.push(u.user.clan);
  const ligneBas = segmentsBas.join(' · ');

  // Sous-titre principal : rang ninja, sinon @username, sinon "Membre du village"
  const sousTitre =
    u.user?.rang?.nom ??
    (u.username ? `@${u.username}` : 'Membre du village');

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
        <div className={styles.userPill}>
          {u.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatar}
              alt={u.displayName}
              className={styles.avatarImg}
            />
          ) : (
            <div className={styles.avatar}>{u.initials}</div>
          )}
          <div className={styles.userInfo}>
            <div className={styles.uname}>
              {u.isLoading ? '…' : u.displayName}
              {u.user?.isAdmin && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    padding: '1px 5px',
                    background: 'rgba(212, 172, 13, 0.18)',
                    color: '#d4ac0d',
                    borderRadius: 3,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    verticalAlign: 'middle',
                  }}
                  title="Administrateur technique"
                >
                  Admin
                </span>
              )}
            </div>
            <div className={styles.urank}>
              {u.isLoading ? '…' : sousTitre}
            </div>
            {ligneBas && (
              <div
                className={styles.urank}
                style={{
                  fontSize: '0.7rem',
                  opacity: 0.7,
                  marginTop: 1,
                }}
                title={u.user?.branches.map((b) => b.nom).join(', ')}
              >
                {ligneBas}
              </div>
            )}
          </div>
        </div>
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
