'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import * as Icons from 'lucide-react';
import { NAV_SECTIONS } from '@/lib/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSidebar } from './SidebarContext';
import { toast } from '@/lib/toast';
import styles from './Sidebar.module.css';

/**
 * Sidebar gauche, fixe, avec sections de navigation.
 *
 * Mobile (< 768px) :
 *  - La sidebar est cachée par défaut (translateX(-100%))
 *  - Quand isOpen = true, elle slide depuis la gauche
 *  - Un overlay noir apparaît derrière pour la fermer au clic
 *  - Au clic sur un lien, elle se referme automatiquement
 *
 * Menu utilisateur :
 *  - Clic sur l'avatar → ouvre un menu déroulant
 *  - "🔄 Refresh mes rôles" : force le refetch des rôles Discord
 *  - "🚪 Déconnexion" : logout
 */
export function Sidebar() {
  const pathname = usePathname();
  const u = useCurrentUser();
  const { isOpen, close } = useSidebar();

  // Menu utilisateur dropdown
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const userPillRef = useRef<HTMLDivElement>(null);

  // Ferme le menu user au clic en dehors
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (userPillRef.current && !userPillRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  // Ferme le menu user sur touche Echap
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setUserMenuOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [userMenuOpen]);

  function handleLogout() {
    setUserMenuOpen(false);
    signOut({ callbackUrl: '/login' });
  }

  async function handleRefreshRoles() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await u.refreshRoles();
      toast.success('✅ Rôles mis à jour');
    } catch (err) {
      console.error('[Sidebar] Refresh failed:', err);
      toast.error('Erreur lors du refresh');
    } finally {
      setRefreshing(false);
      setUserMenuOpen(false);
    }
  }

  function handleLinkClick() {
    close();
  }

  const branchesAffichees = u.user?.branches.slice(0, 2).map((b) => b.nom) ?? [];
  if ((u.user?.branches.length ?? 0) > 2) {
    branchesAffichees.push(`+${u.user!.branches.length - 2}`);
  }
  const segmentsBas = [...branchesAffichees];
  if (u.user?.clan) segmentsBas.push(u.user.clan);
  const ligneBas = segmentsBas.join(' · ');

  const sousTitre =
    u.user?.rang?.nom ??
    (u.username ? `@${u.username}` : 'Membre du village');

  const allHrefs = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

  function isItemActive(itemHref: string): boolean {
    if (pathname === itemHref) return true;
    const hasChildren = allHrefs.some(
      (h) => h !== itemHref && h.startsWith(itemHref + '/')
    );
    if (!hasChildren) return false;
    return pathname.startsWith(itemHref + '/');
  }

  return (
    <>
      {/* Overlay mobile */}
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayOpen : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
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
                const Icon = (Icons[item.icon as keyof typeof Icons] ||
                  Icons.Circle) as Icons.LucideIcon;
                const isActive = isItemActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleLinkClick}
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
          <div
            ref={userPillRef}
            className={styles.userPill}
            onClick={() => setUserMenuOpen((v) => !v)}
            style={{ cursor: 'pointer', position: 'relative' }}
            role="button"
            tabIndex={0}
            aria-label="Menu utilisateur"
            aria-expanded={userMenuOpen}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setUserMenuOpen((v) => !v);
              }
            }}
          >
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

            {/* Menu déroulant */}
            {userMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(180deg, #1a140c, #15110b)',
                  border: '1px solid rgba(212, 172, 13, 0.3)',
                  borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  zIndex: 100,
                  overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={handleRefreshRoles}
                  disabled={refreshing}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: refreshing ? '#666' : '#e5d4a4',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    cursor: refreshing ? 'wait' : 'pointer',
                    transition: 'background 0.15s',
                    letterSpacing: '0.03em',
                  }}
                  onMouseEnter={(e) => {
                    if (!refreshing) e.currentTarget.style.background = 'rgba(212, 172, 13, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Met à jour tes rôles Discord (utile après une promotion)"
                >
                  <Icons.RefreshCw
                    size={14}
                    style={{
                      animation: refreshing ? 'spin 1s linear infinite' : 'none',
                    }}
                  />
                  {refreshing ? 'Refresh en cours…' : 'Refresh mes rôles'}
                </button>

                <div
                  style={{
                    height: 1,
                    background: 'rgba(212, 172, 13, 0.15)',
                  }}
                />

                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#e89a9a',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    letterSpacing: '0.03em',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Icons.LogOut size={14} />
                  Se déconnecter
                </button>
              </div>
            )}
          </div>

          {/* Animation CSS pour l'icône refresh */}
          <style jsx>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </aside>
    </>
  );
}
