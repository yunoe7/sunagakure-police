'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Composant UserBadges — Affichage des badges d'un IntranetUser
 * ════════════════════════════════════════════════════════════════
 *
 * Utilisé dans :
 * - La Sidebar (footer utilisateur)
 * - La page Profil
 * - Potentiellement plus tard : page Maintenance, fiches membres
 *
 * Couleurs des badges :
 * - gold      : rang ninja
 * - goldBright: Kazekage
 * - blue      : branches (membre)
 * - green     : Gérant de branche
 * - greenLight: Co-gérant
 * - purple    : clan
 * - red       : Conseil du Vent, Conseiller Kazekage
 * - gray      : Staff
 *
 * Props :
 * - user : IntranetUser
 * - size : 'sm' | 'md'   (sm = compact pour sidebar, md = page profil)
 * - showAdmin : booléen pour afficher le badge "Admin" (par défaut false ici,
 *               car la sidebar le gère à part à côté du nom)
 * ════════════════════════════════════════════════════════════════
 */

import type { IntranetUser } from '@/lib/roles';

interface Props {
  user: IntranetUser;
  size?: 'sm' | 'md';
  showAdmin?: boolean;
}

type BadgeColor =
  | 'gold' | 'goldBright' | 'blue' | 'purple'
  | 'green' | 'greenLight' | 'red' | 'gray';

type Badge = {
  label: string;
  color: BadgeColor;
  icon?: string;
  title?: string;
};

const colorStyles: Record<BadgeColor, React.CSSProperties> = {
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

export function buildBadges(user: IntranetUser, showAdmin = false): Badge[] {
  const badges: Badge[] = [];

  // Rang ninja
  if (user.rang) {
    badges.push({
      label: user.rang.nom,
      color: 'gold',
      title: 'Rang ninja',
    });
  }

  // Branches
  for (const b of user.branches) {
    const isGerant = user.gerantDe.includes(b.slug);
    const isCoGerant = user.coGerantDe.includes(b.slug);
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
  if (user.clan) {
    badges.push({
      label: user.clan,
      color: 'purple',
      title: 'Clan',
    });
  }

  // Rôles institutionnels
  if (user.isKazekage) {
    badges.push({
      label: 'Kazekage',
      color: 'goldBright',
      icon: '👑',
      title: 'Kazekage du village',
    });
  }
  if (user.isConseilDuVent) {
    badges.push({
      label: 'Conseil du Vent',
      color: 'red',
      icon: '🏛️',
      title: 'Membre du Conseil du Vent',
    });
  }
  if (user.isConseillerKazekage) {
    badges.push({
      label: 'Conseiller',
      color: 'red',
      icon: '🏛️',
      title: 'Conseiller du Kazekage',
    });
  }

  // Staff
  if (user.isStaff) {
    badges.push({
      label: 'Staff',
      color: 'gray',
      icon: '🛡️',
      title: 'Équipe staff',
    });
  }

  // Admin technique (optionnel)
  if (showAdmin && user.isAdmin) {
    badges.push({
      label: 'Admin',
      color: 'gold',
      title: 'Administrateur technique',
    });
  }

  return badges;
}

export function UserBadges({ user, size = 'sm', showAdmin = false }: Props) {
  const badges = buildBadges(user, showAdmin);

  if (badges.length === 0) return null;

  const baseStyle: React.CSSProperties =
    size === 'md'
      ? {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.05em',
          borderRadius: 5,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }
      : {
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
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: size === 'md' ? 6 : 3,
      }}
    >
      {badges.map((b, i) => (
        <span
          key={i}
          style={{ ...baseStyle, ...colorStyles[b.color] }}
          title={b.title}
        >
          {b.icon && <span>{b.icon}</span>}
          {b.label}
        </span>
      ))}
    </div>
  );
}
