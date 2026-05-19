'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page RÉCOMPENSES — Primes obtenues et historique des missions
 * ════════════════════════════════════════════════════════════════
 *
 * Lit la collection sunagakure/missions filtrée sur les missions
 * terminées (statut "terminee"). Pas de stockage propre.
 *
 * Affiche un récap des récompenses :
 *   - Total perçu
 *   - Nombre de missions terminées
 *   - Plus haut rang réussi
 *   - Moyenne par mission
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Search, Coins, Trophy, Target, TrendingUp, MapPin, Calendar, Users,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { Card } from '@/components/ui/Card';
import {
  type Mission, type MissionRang,
  fmtMoney as fmtMissionMoney, fmtDateFR as fmtMissionDate,
} from '@/types/mission';
import { highestRank } from '@/types/justice-plus';

import styles from './page.module.css';

const RANG_ORDER: MissionRang[] = ['S', 'A', 'B', 'C', 'D'];

export default function RecompensesPage() {
  const { data, loading } = useFirebaseValue<Mission[] | null>('missions');

  const [search, setSearch] = useState('');
  const [filterRang, setFilterRang] = useState<'all' | MissionRang>('all');

  const all = useMemo<Mission[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (m): m is Mission => m !== null && typeof m === 'object' && !!m.id
    ),
    [data]
  );

  // Missions terminées uniquement
  const missionsTerminees = useMemo(() => {
    return all.filter((m) => m.statut === 'terminee');
  }, [all]);

  // Stats
  const stats = useMemo(() => {
    const totalPercu = missionsTerminees.reduce((s, m) => s + (m.recompense || 0), 0);
    const count = missionsTerminees.length;
    let topRank = '—';
    for (const m of missionsTerminees) {
      topRank = highestRank(topRank === '—' ? undefined : topRank, m.rang);
    }
    const moyenne = count > 0 ? Math.round(totalPercu / count) : 0;
    return { totalPercu, count, topRank, moyenne };
  }, [missionsTerminees]);

  // Stats par rang
  const parRang = useMemo(() => {
    const m = new Map<MissionRang, { count: number; total: number }>();
    for (const r of RANG_ORDER) m.set(r, { count: 0, total: 0 });
    for (const mission of missionsTerminees) {
      const e = m.get(mission.rang as MissionRang);
      if (e) {
        e.count++;
        e.total += mission.recompense || 0;
      }
    }
    return Array.from(m.entries()).filter(([, v]) => v.count > 0);
  }, [missionsTerminees]);

  // Visible (avec filtres)
  const visible = useMemo(() => {
    let list = missionsTerminees;
    if (filterRang !== 'all') list = list.filter((m) => m.rang === filterRang);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((m) =>
      ((m.titre || '') + ' ' + (m.desc || '') + ' ' + (m.lieu || '') + ' ' + (m.type || '') + ' ' + (m.terminePar || ''))
        .toLowerCase().includes(q)
    );
    // Tri par date de fin (récent d'abord)
    return [...list].sort((a, b) => (b.termineLe ?? 0) - (a.termineLe ?? 0));
  }, [missionsTerminees, filterRang, search]);

  return (
    <Card
      title="💰 Récompenses"
      subtitle="Primes obtenues et historique des missions terminées"
    >
      {/* Stats hero */}
      <div className={styles.heroStats}>
        <div className={styles.heroMain}>
          <div className={styles.heroLbl}>Total perçu</div>
          <div className={styles.heroVal}>
            {fmtMissionMoney(stats.totalPercu)} <span className={styles.unit}>Ryōs</span>
          </div>
        </div>
        <div className={styles.heroSubs}>
          <div className={styles.heroSubItem}>
            <Target size={14} />
            <div>
              <div className={styles.subLbl}>Missions terminées</div>
              <div className={styles.subVal}>{stats.count}</div>
            </div>
          </div>
          <div className={styles.heroSubItem}>
            <Trophy size={14} />
            <div>
              <div className={styles.subLbl}>Plus haut rang réussi</div>
              <div className={styles.subVal}>
                <span className={`${styles.rangBadge} ${styles[`rang-${stats.topRank}`]}`}>
                  Rang {stats.topRank}
                </span>
              </div>
            </div>
          </div>
          <div className={styles.heroSubItem}>
            <TrendingUp size={14} />
            <div>
              <div className={styles.subLbl}>Moyenne / mission</div>
              <div className={styles.subVal}>
                {fmtMissionMoney(stats.moyenne)} <span className={styles.unitSmall}>Ryōs</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats par rang */}
      {parRang.length > 0 && (
        <div className={styles.parRangBox}>
          <div className={styles.parRangTitle}>Récapitulatif par rang</div>
          <div className={styles.parRangList}>
            {parRang.map(([rang, info]) => (
              <div key={rang} className={`${styles.rangCard} ${styles[`rang-${rang}`]}`}>
                <div className={styles.rangCardHeader}>
                  <span className={styles.rangIcon}>Rang {rang}</span>
                  <span className={styles.rangCount}>{info.count} mission{info.count > 1 ? 's' : ''}</span>
                </div>
                <div className={styles.rangTotal}>
                  +{fmtMissionMoney(info.total)} <span className={styles.unitSmall}>Ryōs</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Titre, lieu, équipier…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className={styles.filterSelect}
          value={filterRang}
          onChange={(e) => setFilterRang(e.target.value as 'all' | MissionRang)}
        >
          <option value="all">Tous rangs</option>
          {RANG_ORDER.map((r) => (
            <option key={r} value={r}>Rang {r}</option>
          ))}
        </select>
      </div>

      {/* Liste */}
      {loading ? <p className={styles.empty}>Chargement…</p>
        : visible.length === 0 ? (
          <div className={styles.empty}>
            <Coins size={32} style={{ opacity: 0.3 }} />
            <p>
              {missionsTerminees.length === 0
                ? 'Aucune mission terminée. Termine des missions pour gagner des Ryōs !'
                : 'Aucune mission pour ces critères.'}
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map((m) => (
              <article key={m.id} className={`${styles.mission} ${styles[`m-rang-${m.rang}`]}`}>
                <div className={styles.mHeader}>
                  <span className={`${styles.rangBadge} ${styles[`rang-${m.rang}`]}`}>
                    Rang {m.rang}
                  </span>
                  {m.type && <span className={styles.typeChip}>{m.type}</span>}
                  {m.termineLe && (
                    <span className={styles.dateChip}>
                      <Calendar size={11} /> Terminée le {fmtMissionDate(m.termineLe)}
                    </span>
                  )}
                </div>

                <div className={styles.mBody}>
                  <div className={styles.mInfo}>
                    <h3>{m.titre}</h3>
                    {m.desc && <p className={styles.desc}>{m.desc}</p>}
                    <div className={styles.mMeta}>
                      {m.lieu && (
                        <span><MapPin size={11} /> {m.lieu}</span>
                      )}
                      {m.assignes && m.assignes.length > 0 && (
                        <span><Users size={11} /> {m.assignes.map((a) => a.nom).join(', ')}</span>
                      )}
                      {m.terminePar && (
                        <span>✓ Validée par <strong>{m.terminePar}</strong></span>
                      )}
                    </div>
                  </div>

                  <div className={styles.recompenseBox}>
                    <div className={styles.recompenseLbl}>Récompense</div>
                    <div className={styles.recompenseVal}>
                      +{fmtMissionMoney(m.recompense)}
                      <span className={styles.unit}>Ryōs</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
    </Card>
  );
}
