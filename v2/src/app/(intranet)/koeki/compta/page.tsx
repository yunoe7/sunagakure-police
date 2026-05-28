'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — COMPTAS : Historique des déclarations de CA
 * ════════════════════════════════════════════════════════════════
 *
 * NB Phase 3 : cette page héberge l'historique des déclarations fiscales.
 *    La compta interne des membres (paie hebdo, primes…) arrivera en
 *    Phase 4 et viendra s'ajouter ici (onglets).
 *
 * Permissions :
 * - Voir       : canVoirComptaGlobale (direction, superviseurs, chefs +admin/Jonin+)
 * - Supprimer  : canGererSocietes (réécrit l'historique + retire le mouvement Trésor)
 *
 * 📜 Audit log : delete koeki:declaration + delete tresor:mouvement lié.
 *
 * ⭐ Suppression symétrique (pattern page Impôts) :
 *    supprime la déclaration ET le TresorMouvement lié, avec garde-fou
 *    « le mouvement existe-t-il encore ? » (cas suppression manuelle côté Trésor).
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Trash2, Search, Coins, Receipt } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet, dbUpdate } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type DeclarationCA, type SocieteType,
  SOCIETE_TYPES, SOCIETE_TYPE_LABEL, SOCIETE_TYPE_ICON,
  fmtMoney, fmtDateFR,
} from '@/types/koeki';
import {
  type TresorCentral, type TresorMouvement, type TresorRetrait,
  TRESOR_DEFAULT_RATE,
} from '@/types/compta';

import styles from './page.module.css';

const FB_DECLARATIONS = 'koeki/declarations';
const FB_TRESOR = 'tresorCentral';

export default function KoekiComptaPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canVoir = u.can.koeki.voirComptaGlobale();
  const canDelete = u.can.koeki.gererSocietes();

  const { data: declarationsData, loading } = useFirebaseValue<DeclarationCA[] | null>(FB_DECLARATIONS);
  const { data: tresorData } = useFirebaseValue<TresorCentral | null>(FB_TRESOR);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | SocieteType>('all');

  const declarations = useMemo<DeclarationCA[]>(() => {
    const list = Array.isArray(declarationsData)
      ? declarationsData
      : declarationsData ? Object.values(declarationsData) : [];
    return list.filter((d): d is DeclarationCA => d !== null && typeof d === 'object' && !!d.id);
  }, [declarationsData]);

  const tresorCurrent = useMemo<TresorCentral>(() => ({
    prelevementRate: tresorData?.prelevementRate ?? TRESOR_DEFAULT_RATE,
    mouvements: (Array.isArray(tresorData?.mouvements) ? tresorData!.mouvements :
                 tresorData?.mouvements ? Object.values(tresorData.mouvements) : [])
                 .filter((m): m is TresorMouvement => m !== null && typeof m === 'object' && !!m.id),
    retraits: (Array.isArray(tresorData?.retraits) ? tresorData!.retraits :
               tresorData?.retraits ? Object.values(tresorData.retraits) : [])
               .filter((r): r is TresorRetrait => r !== null && typeof r === 'object' && !!r.id),
  }), [tresorData]);

  const visible = useMemo(() => {
    let list = declarations;
    if (filterType !== 'all') list = list.filter((d) => d.type === filterType);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        ((d.societeNom || '') + ' ' + (d.semaine || '') + ' ' + (d.agent || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.date - a.date);
  }, [declarations, filterType, search]);

  const stats = useMemo(() => {
    const totalCA = declarations.reduce((s, d) => s + (d.chiffreAffaires || 0), 0);
    const totalImpot = declarations.reduce((s, d) => s + (d.impot || 0), 0);
    return { count: declarations.length, totalCA, totalImpot };
  }, [declarations]);

  async function handleDelete(d: DeclarationCA) {
    const ok = await confirmAction({
      title: 'Supprimer la déclaration',
      message: `Supprimer la déclaration de "${d.societeNom}" (CA ${fmtMoney(d.chiffreAffaires)} ₽, impôt ${fmtMoney(d.impot)} ₽) ?` +
        (d.tresorMouvementId ? ' Le mouvement Trésor associé sera aussi supprimé.' : ''),
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      // ⭐ Suppression symétrique : retire aussi le mouvement Trésor lié,
      //    avec garde-fou « existe-t-il encore ? »
      if (d.tresorMouvementId) {
        const existeEncore = tresorCurrent.mouvements.some((m) => m.id === d.tresorMouvementId);
        if (existeEncore) {
          await dbUpdate(FB_TRESOR, {
            ...tresorCurrent,
            mouvements: tresorCurrent.mouvements.filter((m) => m.id !== d.tresorMouvementId),
          });
          logAction({
            who: CURRENT_USER, whoId: u.id ?? null,
            action: 'delete', target: 'tresor:mouvement', targetId: d.tresorMouvementId,
            detail: `Trésor — Suppression versement Fiscalité sociétés : −${fmtMoney(d.impot)} ₽ ` +
              `(suppression déclaration ${d.societeNom}, semaine ${d.semaine})`,
          });
        }
      }

      await dbSet(FB_DECLARATIONS, declarations.filter((x) => x.id !== d.id));

      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: 'delete', target: 'koeki:declaration', targetId: String(d.id),
        detail: `Kōeki — Suppression déclaration "${d.societeNom}" : ` +
          `CA ${fmtMoney(d.chiffreAffaires)} ₽, impôt ${fmtMoney(d.impot)} ₽ (semaine ${d.semaine})` +
          (d.tresorMouvementId ? ` — mouvement Trésor lié supprimé (${d.tresorMouvementId})` : ''),
      });

      toast.success('Déclaration supprimée');
    } catch (err) {
      console.error('[KOEKI DECL DELETE]', err);
      toast.error('Erreur');
    }
  }

  if (!canVoir) {
    return (
      <Card title="🏯 Kōeki — Comptas" subtitle="Historique des déclarations fiscales">
        <div className={styles.empty}>
          <Receipt size={32} style={{ opacity: 0.3 }} />
          <p>Tu n'as pas accès à la vue comptable globale de Kōeki.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="🏯 Kōeki — Comptas"
      subtitle="Historique des déclarations de chiffre d'affaires"
    >
      <div className={styles.statRow}>
        <div className={`${styles.statCard} ${styles.scGold}`}>
          <Receipt size={16} />
          <div className={styles.statVal}>{stats.count}</div>
          <div className={styles.statLbl}>Déclarations</div>
        </div>
        <div className={`${styles.statCard} ${styles.scBlue}`}>
          <Coins size={16} />
          <div className={styles.statVal}>{fmtMoney(stats.totalCA)} ₽</div>
          <div className={styles.statLbl}>CA déclaré (total)</div>
        </div>
        <div className={`${styles.statCard} ${styles.scGold}`}>
          <Coins size={16} />
          <div className={styles.statVal}>{fmtMoney(stats.totalImpot)} ₽</div>
          <div className={styles.statLbl}>Impôts collectés</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Société, semaine, agent…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className={styles.filterSelect} value={filterType}
          onChange={(e) => setFilterType(e.target.value as 'all' | SocieteType)}>
          <option value="all">Tous les types</option>
          {SOCIETE_TYPES.map((t) => (
            <option key={t} value={t}>{SOCIETE_TYPE_ICON[t]} {SOCIETE_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <Receipt size={32} style={{ opacity: 0.3 }} />
          <p>
            {declarations.length === 0
              ? 'Aucune déclaration. Les CA déclarés depuis la page Économie apparaîtront ici.'
              : 'Aucune déclaration pour ces critères.'}
          </p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Semaine</th>
              <th>Société</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>CA</th>
              <th style={{ textAlign: 'right' }}>Taux</th>
              <th style={{ textAlign: 'right' }}>Impôt</th>
              <th>Agent</th>
              {canDelete && <th aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.id}>
                <td className={styles.mono}>{fmtDateFR(d.date)}</td>
                <td className={styles.mono}>{d.semaine || '—'}</td>
                <td><strong>{d.societeNom}</strong></td>
                <td>
                  <span className={styles.typeChip}>
                    {SOCIETE_TYPE_ICON[d.type]} {SOCIETE_TYPE_LABEL[d.type]}
                  </span>
                </td>
                <td className={styles.amount} style={{ textAlign: 'right' }}>{fmtMoney(d.chiffreAffaires)} ₽</td>
                <td className={styles.mono} style={{ textAlign: 'right' }}>{d.taux}%</td>
                <td className={`${styles.amount} ${styles.amtImpot}`} style={{ textAlign: 'right' }}>
                  +{fmtMoney(d.impot)} ₽
                </td>
                <td className={styles.muted}>{d.agent || '—'}</td>
                {canDelete && (
                  <td>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(d)} aria-label="Supprimer">
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
