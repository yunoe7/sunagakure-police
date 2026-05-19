'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page EFFECTIFS — Roster opérationnel de la Police
 * ════════════════════════════════════════════════════════════════
 *
 * Lit la collection sunagakure/users (la même que /admin).
 * Présente une vue agréable du roster avec recherche et filtres.
 *
 * Pas d'édition ici : pour modifier un agent, va dans /admin.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Search, Shield, UserCheck, Users, Star } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { Card } from '@/components/ui/Card';
import type { User } from '@/types/admin';
import {
  ROLE_HIERARCHY, ROLE_LABELS_FULL, ROLE_EMOJI,
  isOfficierOrAbove, isAdmin,
} from '@/types/rh';
import styles from './page.module.css';

type RoleFilter = 'all' | User['role'];

export default function EffectifsPage() {
  const { data, loading } = useFirebaseValue<User[] | null>('users');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  const all = useMemo<User[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (u): u is User => u !== null && typeof u === 'object' && !!u.id
    ),
    [data]
  );

  const stats = useMemo(() => {
    const enService = all.filter((u) => u.statut !== 'banni' && u.statut !== 'inactif').length;
    const admins = all.filter((u) => isAdmin(u.role)).length;
    const officiers = all.filter((u) => isOfficierOrAbove(u.role)).length;
    const membres = all.filter((u) => u.role === 'membre' || u.role === 'stagiaire').length;
    return { enService, admins, officiers, membres };
  }, [all]);

  // Groupement par rôle pour affichage hiérarchique
  const grouped = useMemo(() => {
    const groups = new Map<User['role'], User[]>();
    for (const role of ROLE_HIERARCHY) groups.set(role, []);
    for (const u of all) {
      const r = u.role || 'membre';
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(u);
    }
    return groups;
  }, [all]);

  const visible = useMemo(() => {
    const result: { role: User['role']; users: User[] }[] = [];
    for (const role of ROLE_HIERARCHY) {
      if (roleFilter !== 'all' && roleFilter !== role) continue;
      let users = grouped.get(role) || [];
      const q = search.trim().toLowerCase();
      if (q) {
        users = users.filter((u) =>
          ((u.nom || '') + ' ' + (u.grade || '') + ' ' + (u.section || ''))
            .toLowerCase().includes(q)
        );
      }
      if (users.length > 0) result.push({ role, users });
    }
    return result;
  }, [grouped, roleFilter, search]);

  return (
    <Card
      title="Effectifs"
      subtitle="Roster opérationnel de la Police de Sunagakure"
    >
      {/* Stats hero */}
      <div className={styles.statRow}>
        <div className={`${styles.statCard} ${styles.scGreen}`}>
          <UserCheck size={16} />
          <div className={styles.statVal}>{stats.enService}</div>
          <div className={styles.statLbl}>En service</div>
        </div>
        <div className={`${styles.statCard} ${styles.scGold}`}>
          <Shield size={16} />
          <div className={styles.statVal}>{stats.admins}</div>
          <div className={styles.statLbl}>Administrateurs</div>
        </div>
        <div className={`${styles.statCard} ${styles.scBlue}`}>
          <Star size={16} />
          <div className={styles.statVal}>{stats.officiers}</div>
          <div className={styles.statLbl}>Officiers & +</div>
        </div>
        <div className={`${styles.statCard} ${styles.scAccent}`}>
          <Users size={16} />
          <div className={styles.statVal}>{stats.membres}</div>
          <div className={styles.statLbl}>Membres & Stagiaires</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Nom, grade, section…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        >
          <option value="all">Tous rôles</option>
          {ROLE_HIERARCHY.map((r) => (
            <option key={r} value={r}>{ROLE_EMOJI[r]} {ROLE_LABELS_FULL[r]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <Users size={32} style={{ opacity: 0.3 }} />
          <p>Aucun agent pour ces critères.</p>
        </div>
      ) : (
        <div className={styles.groups}>
          {visible.map(({ role, users }) => (
            <div key={role} className={styles.group}>
              <div className={styles.groupHeader}>
                <span className={styles.groupEmoji}>{ROLE_EMOJI[role]}</span>
                <span className={styles.groupTitle}>{ROLE_LABELS_FULL[role]}</span>
                <span className={styles.groupCount}>{users.length}</span>
              </div>
              <div className={styles.grid}>
                {users.map((u) => (
                  <article key={u.id} className={styles.agent}>
                    {u.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.photo} alt={u.nom} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        {u.nom[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className={styles.agentInfo}>
                      <h4>{u.nom}</h4>
                      <div className={styles.subline}>
                        {u.grade && <span>{u.grade}</span>}
                        {u.section && (
                          <>
                            <span className={styles.sep}>·</span>
                            <span>{u.section}</span>
                          </>
                        )}
                      </div>
                      {u.statut && u.statut !== 'Actif' && (
                        <span className={`${styles.statutChip} ${styles[`stc-${(u.statut || '').toLowerCase()}`]}`}>
                          {u.statut}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
