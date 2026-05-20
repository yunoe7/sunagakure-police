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
 *
 * Badges :
 *  - Rang ninja (or)
 *  - Branches (bleu)
 *  - Clan (violet)
 *  - Gérant / Co-gérant de branche (vert)
 *  - Conseil du Vent, Conseiller Kazekage (rouge institutionnel)
 *  - Staff (gris)
 *  - Kazekage RP (or brillant)
 *  - Admin technique (or)
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

  const allHrefs = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

  function isItemActive(itemHref: string): boolean {
    if (pathname === itemHref) return true;
    const hasChildren = allHrefs.some(
      (h) => h !== itemHref && h.startsWith(itemHref + '/')
    );
    if (!hasChildren) return false;
    return pathname.startsWith(itemHref + '/');
  }

  // ─── Préparation des badges ─────────────────────────────────
  // Construit la liste de tous les badges à afficher pour l'user
  type Badge = {
    label: string;
    color: 'gold' | 'blue' | 'purple' | 'green' | 'greenLight' | 'red' | 'gray' | 'goldBright';
    icon?: string;
    title?: string;
  };

  const badges: Badge[] = [];

  if (u.user) {
    // Rang ninja
    if (u.user.rang) {
      badges.push({
        label: u.user.rang.nom,
        color: 'gold',
        title: 'Rang ninja',
      });
    }

    // Branches
    for (const b of u.user.branches) {
      const isGerant = u.user.gerantDe.includes(b.slug);
      const isCoGerant = u.user.coGerantDe.includes(b.slug);
      if (isGerant) {
        badges.push({
          label: `Gérant ${b.nom}`,
          color: 'green',
          icon: '⭐',
          title: `Chef de la branche ${b.nom}`,
        });
      } else if (isCoGerant) {
        badges.push({
          label: `Co-gérant ${b.nom}`,
          color: 'greenLight',
          title: `Co-gérant de la branche ${b.nom}`,
        });
      } else {
        badges.push({
          label: b.nom,
          color: 'blue',
          title: `Membre de la branche ${b.nom}`,
        });
      }
    }

    // Clan
    if (u.user.clan) {
      badges.push({
        label: u.user.clan,
        color: 'purple',
        title: 'Clan',
      });
    }

    // Rôles institutionnels (rouge)
    if (u.user.isKazekage) {
      badges.push({
        label: 'Kazekage',
        color: 'goldBright',
        icon: '👑',
        title: 'Kazekage du village',
      });
    }
    if (u.user.isConseilDuVent) {
      badges.push({
        label: 'Conseil du Vent',
        color: 'red',
        icon: '🏛️',
        title: 'Membre du Conseil du Vent',
      });
    }
    if (u.user.isConseillerKazekage) {
      badges.push({
        label: 'Conseiller',
        color: 'red',
        icon: '🏛️',
        title: 'Conseiller du Kazekage',
      });
    }

    // Staff
    if (u.user.isStaff) {
      badges.push({
        label: 'Staff',
        color: 'gray',
        icon: '🛡️',
        title: 'Équipe staff',
      });
    }
  }

  // Mapping couleur → styles inline (pour ne pas avoir à toucher au CSS)
  const colorStyles: Record<Badge['color'], React.CSSProperties> = {
    gold: {
      background: 'rgba(212, 172, 13, 0.18)',
      color: '#d4ac0d',
      border: '1px solid rgba(212, 172, 13, 0.35)',
    },
    goldBright: {
      background: 'rgba(255, 215, 0, 0.22)',
      color: '#ffd700',
      border: '1px solid rgba(255, 215, 0, 0.5)',
      textShadow: '0 0 6px rgba(255, 215, 0, 0.4)',
    },
    blue: {
      background: 'rgba(59, 130, 246, 0.18)',
      color: '#93c5fd',
      border: '1px solid rgba(59, 130, 246, 0.35)',
    },
    purple: {
      background: 'rgba(168, 85, 247, 0.18)',
      color: '#c4b5fd',
      border: '1px solid rgba(168, 85, 247, 0.35)',
    },
    green: {
      background: 'rgba(34, 197, 94, 0.22)',
      color: '#86efac',
      border: '1px solid rgba(34, 197, 94, 0.45)',
    },
    greenLight: {
      background: 'rgba(34, 197, 94, 0.12)',
      color: '#bbf7d0',
      border: '1px solid rgba(34, 197, 94, 0.25)',
    },
    red: {
      background: 'rgba(239, 68, 68, 0.18)',
      color: '#fca5a5',
      border: '1px solid rgba(239, 68, 68, 0.4)',
    },
    gray: {
      background: 'rgba(156, 163, 175, 0.15)',
      color: '#d1d5db',
      border: '1px solid rgba(156, 163, 175, 0.3)',
    },
  };

  const badgeBaseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 7px',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.04em',
    borderRadius: 4,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  };

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
            <div className={styles.userInfo} style={{ minWidth: 0, flex: 1 }}>
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

              {/* 🎨 Tous les badges (rang, branches, clan, rôles spéciaux) */}
              {u.isLoading ? (
                <div className={styles.urank}>…</div>
              ) : badges.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 3,
                    marginTop: 3,
                  }}
                >
                  {badges.map((b, i) => (
                    <span
                      key={i}
                      style={{ ...badgeBaseStyle, ...colorStyles[b.color] }}
                      title={b.title}
                    >
                      {b.icon && <span>{b.icon}</span>}
                      {b.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className={styles.urank}>Membre du village</div>
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
