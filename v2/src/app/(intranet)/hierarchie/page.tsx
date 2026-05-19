'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page HIÉRARCHIE — Organigramme officiel de la Police
 * ════════════════════════════════════════════════════════════════
 *
 * Visualise la chaîne de commandement de Sunagakure sous forme
 * d'organigramme en niveaux, du plus haut grade au plus bas.
 *
 * Lit la collection sunagakure/users.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';
import { Network } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { Card } from '@/components/ui/Card';
import type { User } from '@/types/admin';
import { ROLE_HIERARCHY, ROLE_LABELS_FULL, ROLE_EMOJI } from '@/types/rh';
import styles from './page.module.css';

export default function HierarchiePage() {
  const { data, loading } = useFirebaseValue<User[] | null>('users');

  const all = useMemo<User[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (u): u is User => u !== null && typeof u === 'object' && !!u.id
    ),
    [data]
  );

  // Groupement par rôle, dans l'ordre hiérarchique
  const levels = useMemo(() => {
    return ROLE_HIERARCHY
      .filter((r) => r !== 'visiteur')  // pas dans l'organigramme
      .map((role) => ({
        role,
        users: all.filter((u) => u.role === role)
          .sort((a, b) => (a.nom || '').localeCompare(b.nom || '')),
      }))
      .filter((lvl) => lvl.users.length > 0);
  }, [all]);

  return (
    <Card
      title="Hiérarchie"
      subtitle="Organigramme officiel de la Police de Sunagakure"
    >
      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : levels.length === 0 ? (
        <div className={styles.empty}>
          <Network size={32} style={{ opacity: 0.3 }} />
          <p>Aucun membre dans la hiérarchie.</p>
        </div>
      ) : (
        <div className={styles.tree}>
          {levels.map(({ role, users }, idx) => (
            <div key={role} className={styles.level}>
              {idx > 0 && <div className={styles.connector} />}
              <div className={styles.levelHeader}>
                <span className={styles.levelEmoji}>{ROLE_EMOJI[role]}</span>
                <span className={styles.levelTitle}>{ROLE_LABELS_FULL[role]}</span>
                <span className={styles.levelCount}>×{users.length}</span>
              </div>
              <div className={styles.cards}>
                {users.map((u) => (
                  <article key={u.id} className={`${styles.card} ${styles[`card-${role}`]}`}>
                    {u.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.photo} alt={u.nom} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        {u.nom[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <h4>{u.nom}</h4>
                    {u.grade && <div className={styles.grade}>{u.grade}</div>}
                    {u.section && <div className={styles.section}>{u.section}</div>}
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
