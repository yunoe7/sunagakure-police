'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page CASIERS — Vue agrégée par utilisateur
 * ════════════════════════════════════════════════════════════════
 *
 * Pour chaque user, on agrège :
 *   - ses infos de profil (grade, section, statut)
 *   - les dossiers ouverts à son nom
 *   - les plaintes le concernant (en tant qu'accusé OU plaignant)
 *
 * Pas d'édition directe ici : on consulte. Pour éditer un user,
 * il faut aller dans /admin.
 *
 * Lit : sunagakure/users + sunagakure/dossiers + sunagakure/plaintes
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Search, FileText, AlertCircle, Users as UsersIcon } from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { User } from '@/types/admin';
import type { Dossier } from '@/types/dossier';
import type { Plainte } from '@/types/plainte';

import styles from './page.module.css';

export default function CasiersPage() {
  const { data: usersData, loading: usersLoading } = useFirebaseValue<User[] | null>('users');
  const { data: dossiersData } = useFirebaseValue<Dossier[] | null>('dossiers');
  const { data: plaintesData } = useFirebaseValue<Plainte[] | null>('plaintes');

  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [viewing, setViewing] = useState<User | null>(null);

  // Normalisation
  const users = useMemo<User[]>(
    () =>
      (Array.isArray(usersData)
        ? usersData
        : usersData
          ? Object.values(usersData)
          : []
      ).filter((u): u is User => u !== null && typeof u === 'object' && !!u.id),
    [usersData]
  );

  const dossiers = useMemo<Dossier[]>(
    () =>
      (Array.isArray(dossiersData)
        ? dossiersData
        : dossiersData
          ? Object.values(dossiersData)
          : []
      ).filter((d): d is Dossier => d !== null && typeof d === 'object' && !!d.id),
    [dossiersData]
  );

  const plaintes = useMemo<Plainte[]>(
    () =>
      (Array.isArray(plaintesData)
        ? plaintesData
        : plaintesData
          ? Object.values(plaintesData)
          : []
      ).filter((p): p is Plainte => p !== null && typeof p === 'object' && !!p.id),
    [plaintesData]
  );

  // Liste unique des sections pour le filtre
  const sections = useMemo(() => {
    const s = new Set<string>();
    users.forEach((u) => {
      if (u.section) s.add(u.section);
    });
    return Array.from(s).sort();
  }, [users]);

  // Calcule le casier de chaque user (compteurs)
  const usersWithCasier = useMemo(() => {
    return users.map((u) => {
      const dossiersLies = dossiers.filter((d) =>
        (d.nom || '').toLowerCase().includes((u.nom || '').toLowerCase())
      );
      const plaintesAccuse = plaintes.filter((p) =>
        (p.accuse || '').toLowerCase().includes((u.nom || '').toLowerCase())
      );
      const plaintesPlaignant = plaintes.filter((p) =>
        (p.plaignant || '').toLowerCase().includes((u.nom || '').toLowerCase())
      );

      // Score "casier chargé" : critique si des dossiers OU plaintes actives
      const isClean =
        dossiersLies.length === 0 && plaintesAccuse.filter((p) => p.statut !== 'fermee').length === 0;
      const isCritical = dossiersLies.some((d) => d.danger === 'critique' || d.danger === 'eleve');

      return {
        user: u,
        dossiersLies,
        plaintesAccuse,
        plaintesPlaignant,
        isClean,
        isCritical,
      };
    });
  }, [users, dossiers, plaintes]);

  const visible = useMemo(() => {
    let list = usersWithCasier;
    if (sectionFilter !== 'all') {
      list = list.filter((x) => x.user.section === sectionFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((x) =>
        ((x.user.nom || '') + ' ' + (x.user.grade || '') + ' ' + (x.user.section || ''))
          .toLowerCase()
          .includes(q)
      );
    }
    return [...list].sort((a, b) => a.user.nom.localeCompare(b.user.nom));
  }, [usersWithCasier, search, sectionFilter]);

  const viewingCasier = viewing
    ? usersWithCasier.find((x) => x.user.id === viewing.id)
    : null;

  return (
    <>
      <Card
        title="Casiers"
        subtitle="Vue agrégée des ninjas du village"
      >
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Rechercher par nom, grade, section…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="all">Toutes sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {usersLoading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <UsersIcon size={32} style={{ opacity: 0.3 }} />
            <p>Aucun ninja pour ces critères.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visible.map(({ user, dossiersLies, plaintesAccuse, plaintesPlaignant, isClean, isCritical }) => (
              <article
                key={user.id}
                className={`${styles.card} ${isCritical ? styles.cardCritical : isClean ? styles.cardClean : ''}`}
                onClick={() => setViewing(user)}
              >
                <div className={styles.cardHeader}>
                  {user.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.photo} alt={user.nom} className={styles.photo} />
                  ) : (
                    <div className={styles.photoPlaceholder}>
                      {user.nom[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className={styles.cardIdentity}>
                    <h3>{user.nom}</h3>
                    <div className={styles.subline}>
                      <span>{user.grade || 'Sans grade'}</span>
                      {user.section && (
                        <>
                          <span className={styles.sep}>·</span>
                          <span>{user.section}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {user.statut && user.statut !== 'Actif' && (
                    <span className={`${styles.statutChip} ${styles[`stc-${(user.statut || '').toLowerCase()}`]}`}>
                      {user.statut}
                    </span>
                  )}
                </div>

                <div className={styles.counters}>
                  <div
                    className={`${styles.counter} ${dossiersLies.length > 0 ? styles.counterActive : ''}`}
                  >
                    <FileText size={11} />
                    <span>{dossiersLies.length}</span>
                    <small>dossier{dossiersLies.length > 1 ? 's' : ''}</small>
                  </div>
                  <div
                    className={`${styles.counter} ${plaintesAccuse.length > 0 ? styles.counterAccuse : ''}`}
                  >
                    <AlertCircle size={11} />
                    <span>{plaintesAccuse.length}</span>
                    <small>accusation{plaintesAccuse.length > 1 ? 's' : ''}</small>
                  </div>
                  <div className={styles.counter}>
                    <AlertCircle size={11} />
                    <span>{plaintesPlaignant.length}</span>
                    <small>plainte{plaintesPlaignant.length > 1 ? 's' : ''} déposée{plaintesPlaignant.length > 1 ? 's' : ''}</small>
                  </div>
                </div>

                {isClean && (
                  <div className={styles.cleanBadge}>✓ Casier vierge</div>
                )}
                {isCritical && (
                  <div className={styles.criticalBadge}>⚠ Casier chargé</div>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>

      {/* Modal détail du casier */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Casier de ${viewing.nom}` : ''}
        size="lg"
      >
        {viewingCasier && (
          <div className={styles.viewer}>
            <div className={styles.viewerProfile}>
              {viewingCasier.user.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewingCasier.user.photo}
                  alt={viewingCasier.user.nom}
                  className={styles.viewerPhoto}
                />
              ) : (
                <div className={styles.viewerPhotoPlaceholder}>
                  {viewingCasier.user.nom[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div>
                <h3>{viewingCasier.user.nom}</h3>
                <div className={styles.viewerMeta}>
                  {viewingCasier.user.grade && <span>{viewingCasier.user.grade}</span>}
                  {viewingCasier.user.section && (
                    <>
                      <span className={styles.sep}>·</span>
                      <span>{viewingCasier.user.section}</span>
                    </>
                  )}
                  {viewingCasier.user.statut && (
                    <>
                      <span className={styles.sep}>·</span>
                      <span>{viewingCasier.user.statut}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h4>📁 Dossiers criminels ({viewingCasier.dossiersLies.length})</h4>
              {viewingCasier.dossiersLies.length === 0 ? (
                <p className={styles.smallEmpty}>Aucun dossier criminel ouvert.</p>
              ) : (
                <ul className={styles.subList}>
                  {viewingCasier.dossiersLies.map((d) => (
                    <li key={d.id}>
                      <strong>{d.nom}</strong>
                      <span className={styles.muted}>
                        {' '}
                        · Danger {d.danger} · {d.statut}
                      </span>
                      {d.infractions && <span> · {d.infractions}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.section}>
              <h4>⚠ Plaintes en tant qu&apos;accusé ({viewingCasier.plaintesAccuse.length})</h4>
              {viewingCasier.plaintesAccuse.length === 0 ? (
                <p className={styles.smallEmpty}>Aucune accusation enregistrée.</p>
              ) : (
                <ul className={styles.subList}>
                  {viewingCasier.plaintesAccuse.map((p) => (
                    <li key={p.id}>
                      <strong>{p.ref || `Plainte #${p.id}`}</strong>
                      <span className={styles.muted}> · {p.type} · {p.statut}</span>
                      {p.desc && (
                        <span className={styles.descShort}> — {p.desc.slice(0, 80)}…</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.section}>
              <h4>📋 Plaintes déposées par {viewingCasier.user.nom} ({viewingCasier.plaintesPlaignant.length})</h4>
              {viewingCasier.plaintesPlaignant.length === 0 ? (
                <p className={styles.smallEmpty}>Aucune plainte déposée.</p>
              ) : (
                <ul className={styles.subList}>
                  {viewingCasier.plaintesPlaignant.map((p) => (
                    <li key={p.id}>
                      <strong>{p.ref || `Plainte #${p.id}`}</strong>
                      <span className={styles.muted}> · contre {p.accuse} · {p.statut}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
