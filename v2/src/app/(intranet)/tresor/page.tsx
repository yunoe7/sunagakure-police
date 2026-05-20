'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page TRÉSOR CENTRAL — Consolidation des prélèvements
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir : tout le monde (connecté)
 * - Retraits / config taux / suppressions : TOUS LES MEMBRES POLICE + Admin
 *
 * 🔍 AUDIT LOG (Phase 2) :
 *   Page critique — toutes les opérations sont tracées dans /audit_log :
 *     - create sur tresor:retrait        (retrait manuel)
 *     - delete sur tresor:retrait        (annulation retrait)
 *     - delete sur tresor:mouvement      (⚠️ efface une trace de versement)
 *     - update sur tresor:config         (changement taux global)
 *   Les versements entrants sont déjà loggés côté ComptaModule
 *   (action=create, target=tresor:mouvement, lors d'une clôture).
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Landmark, Settings, TrendingDown, TrendingUp,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbUpdate } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireMembreBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type TresorCentral, type TresorMouvement, type TresorRetrait, type ComptaSection,
  SECTION_LABEL, SECTION_ICON, TRESOR_DEFAULT_RATE,
  fmtMoney, fmtDateTimeFR,
} from '@/types/compta';

import styles from './page.module.css';

type Tab = 'mouvements' | 'retraits';

export default function TresorCentralPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const CURRENT_USER_ID = u.id;
  const canEdit = u.can.membreBranche('police');

  const { data, loading } = useFirebaseValue<TresorCentral | null>('tresorCentral');

  const [tab, setTab] = useState<Tab>('mouvements');
  const [search, setSearch] = useState('');
  const [filterSection, setFilterSection] = useState<'all' | ComptaSection>('all');
  const [showRetraitForm, setShowRetraitForm] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [retraitForm, setRetraitForm] = useState<Partial<TresorRetrait>>({});
  const [rateForm, setRateForm] = useState<number>(TRESOR_DEFAULT_RATE);

  const tresor: TresorCentral = useMemo(() => ({
    prelevementRate: data?.prelevementRate ?? TRESOR_DEFAULT_RATE,
    mouvements: (Array.isArray(data?.mouvements) ? data!.mouvements :
                 data?.mouvements ? Object.values(data.mouvements) : [])
                 .filter((m): m is TresorMouvement => m !== null && typeof m === 'object' && !!m.id),
    retraits: (Array.isArray(data?.retraits) ? data!.retraits :
               data?.retraits ? Object.values(data.retraits) : [])
               .filter((r): r is TresorRetrait => r !== null && typeof r === 'object' && !!r.id),
  }), [data]);

  const totals = useMemo(() => {
    const totalRecu = tresor.mouvements.reduce((s, m) => s + (m.amount || 0), 0);
    const totalRetire = (tresor.retraits || []).reduce((s, r) => s + (r.montant || 0), 0);
    const solde = totalRecu - totalRetire;
    return { totalRecu, totalRetire, solde };
  }, [tresor]);

  const parSection = useMemo(() => {
    const m = new Map<ComptaSection, number>();
    for (const mv of tresor.mouvements) {
      m.set(mv.section, (m.get(mv.section) || 0) + (mv.amount || 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [tresor]);

  const visibleMouvements = useMemo(() => {
    let list = tresor.mouvements;
    if (filterSection !== 'all') list = list.filter((m) => m.section === filterSection);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((m) =>
      ((m.archiveLabel || '') + ' ' + (m.sectionLabel || '') + ' ' + (m.section || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => b.date - a.date);
  }, [tresor.mouvements, filterSection, search]);

  const visibleRetraits = useMemo(() => {
    const list = tresor.retraits || [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((r) => ((r.motif || '') + ' ' + (r.agent || '')).toLowerCase().includes(q))
      : list;
    return [...filtered].sort((a, b) => b.date - a.date);
  }, [tresor.retraits, search]);

  function openRetrait() {
    setRetraitForm({ date: Date.now(), agent: CURRENT_USER });
    setShowRetraitForm(true);
  }

  async function handleSaveRetrait() {
    if (!retraitForm.montant || retraitForm.montant <= 0) {
      toast.error('Le montant doit être positif'); return;
    }
    if (!retraitForm.motif?.trim()) {
      toast.error('Le motif est obligatoire'); return;
    }
    let depassement = false;
    if (retraitForm.montant > totals.solde) {
      const ok = await confirmAction({
        title: 'Solde insuffisant',
        message: `Le retrait (${fmtMoney(retraitForm.montant)} ₽) dépasse le solde actuel (${fmtMoney(totals.solde)} ₽). Confirmer quand même ?`,
        confirmLabel: 'Confirmer', variant: 'danger',
      });
      if (!ok) return;
      depassement = true;
    }
    try {
      const newRetrait: TresorRetrait = {
        id: 'TR-' + Date.now(),
        date: Date.now(),
        montant: Number(retraitForm.montant),
        motif: retraitForm.motif!.trim(),
        agent: retraitForm.agent?.trim() || CURRENT_USER,
      };
      const newRetraits = [newRetrait, ...(tresor.retraits || [])];
      await dbUpdate('tresorCentral', { ...tresor, retraits: newRetraits });

      // 🔍 Audit log — opération sensible (sortie d'argent du Trésor)
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'create',
        target: 'tresor:retrait',
        targetId: newRetrait.id,
        detail: `Trésor — Retrait manuel : −${fmtMoney(newRetrait.montant)} ₽ — ` +
          `Motif : "${newRetrait.motif}" ` +
          `(solde avant : ${fmtMoney(totals.solde)} ₽${depassement ? ', DÉPASSEMENT' : ''})`,
      });

      toast.success(`Retrait de ${fmtMoney(newRetrait.montant)} ₽ enregistré`);
      setShowRetraitForm(false);
      setRetraitForm({});
    } catch { toast.error('Erreur'); }
  }

  async function handleDeleteRetrait(r: TresorRetrait) {
    const ok = await confirmAction({
      title: 'Supprimer le retrait',
      message: `Supprimer "${r.motif}" (${fmtMoney(r.montant)} ₽) ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbUpdate('tresorCentral', {
        ...tresor,
        retraits: (tresor.retraits || []).filter((x) => x.id !== r.id),
      });

      // 🔍 Audit log — annulation d'un retrait (réécrit l'historique du Trésor)
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'delete',
        target: 'tresor:retrait',
        targetId: r.id,
        detail: `Trésor — Suppression retrait : −${fmtMoney(r.montant)} ₽ — ` +
          `Motif initial : "${r.motif}" — Agent initial : ${r.agent || '?'}`,
      });

      toast.success('Retrait supprimé');
    } catch { toast.error('Erreur'); }
  }

  async function handleDeleteMouvement(m: TresorMouvement) {
    const ok = await confirmAction({
      title: 'Supprimer le mouvement',
      message: `Supprimer ce versement de ${fmtMoney(m.amount)} ₽ depuis ${m.sectionLabel} ? Cette action n'affecte pas la section d'origine.`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbUpdate('tresorCentral', {
        ...tresor,
        mouvements: tresor.mouvements.filter((x) => x.id !== m.id),
      });

      // 🔍 Audit log — ⚠️ ULTRA SENSIBLE : efface une trace de versement
      // sans réinjecter l'argent dans la section d'origine
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'delete',
        target: 'tresor:mouvement',
        targetId: m.id,
        detail: `Trésor — Suppression mouvement : +${fmtMoney(m.amount)} ₽ ` +
          `depuis ${m.sectionLabel || m.section} ` +
          `(taux ${m.rate}%, archive ${m.archiveId} "${m.archiveLabel || '?'}"). ` +
          `⚠️ Trace effacée sans réinjection dans la section d'origine.`,
      });

      toast.success('Mouvement supprimé');
    } catch { toast.error('Erreur'); }
  }

  function openConfig() {
    setRateForm(tresor.prelevementRate);
    setShowConfigForm(true);
  }

  async function handleSaveConfig() {
    if (rateForm < 0 || rateForm > 100) {
      toast.error('Le taux doit être entre 0 et 100');
      return;
    }
    const oldRate = tresor.prelevementRate;
    if (rateForm === oldRate) {
      setShowConfigForm(false);
      return;
    }
    try {
      await dbUpdate('tresorCentral', { ...tresor, prelevementRate: rateForm });

      // 🔍 Audit log — changement de paramètre global qui affecte
      // toutes les clôtures futures de toutes les sections
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'update',
        target: 'tresor:config',
        targetId: 'prelevementRate',
        detail: `Trésor — Taux de prélèvement modifié : ${oldRate}% → ${rateForm}% ` +
          `(s'applique à toutes les clôtures futures, toutes sections)`,
      });

      toast.success(`Taux mis à jour : ${rateForm}%`);
      setShowConfigForm(false);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="🏛️ Trésor Central"
        subtitle="Consolidation des prélèvements de toutes les sections"
        actions={
          <RequireMembreBranche branche="police">
            <>
              <Button variant="outline" onClick={openConfig}>
                <Settings size={14} /> Taux : {tresor.prelevementRate}%
              </Button>
              <Button onClick={openRetrait}>
                <Plus size={14} /> Retrait manuel
              </Button>
            </>
          </RequireMembreBranche>
        }
      >
        <div className={styles.heroStats}>
          <div className={`${styles.heroStat} ${styles.heroSolde}`}>
            <div className={styles.heroLbl}>Solde du Trésor</div>
            <div className={styles.heroVal}>
              {totals.solde >= 0 ? '+' : ''}{fmtMoney(totals.solde)} ₽
            </div>
          </div>
          <div className={styles.heroSub}>
            <div className={styles.subItem}>
              <TrendingUp size={14} className={styles.green} />
              <div>
                <div className={styles.subLbl}>Total reçu</div>
                <div className={styles.subVal}>+{fmtMoney(totals.totalRecu)} ₽</div>
              </div>
            </div>
            <div className={styles.subItem}>
              <TrendingDown size={14} className={styles.red} />
              <div>
                <div className={styles.subLbl}>Total retiré</div>
                <div className={styles.subVal}>−{fmtMoney(totals.totalRetire)} ₽</div>
              </div>
            </div>
          </div>
        </div>

        {parSection.length > 0 && (
          <div className={styles.parSectionGrid}>
            <div className={styles.parSectionTitle}>Contributions par section</div>
            <div className={styles.parSectionList}>
              {parSection.map(([section, amount]) => (
                <div key={section} className={styles.sectionPill}>
                  <span className={styles.sectionIcon}>{SECTION_ICON[section]}</span>
                  <span className={styles.sectionName}>{SECTION_LABEL[section]}</span>
                  <span className={styles.sectionAmount}>+{fmtMoney(amount)} ₽</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'mouvements' ? styles.tabActive : ''}`}
            onClick={() => setTab('mouvements')}
          >
            <span>Versements reçus</span>
            <span className={styles.tabCount}>{tresor.mouvements.length}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'retraits' ? styles.tabActive : ''}`}
            onClick={() => setTab('retraits')}
          >
            <span>Retraits manuels</span>
            <span className={styles.tabCount}>{(tresor.retraits || []).length}</span>
          </button>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Rechercher…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {tab === 'mouvements' && (
            <select
              className={styles.filterSelect}
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value as 'all' | ComptaSection)}
            >
              <option value="all">Toutes sections</option>
              <option value="avocat">⚖️ Avocat</option>
              <option value="medical">🏥 Médical</option>
              <option value="justice">🏛️ Justice</option>
              <option value="missions">🎯 Missions</option>
              <option value="diplo">🌍 Diplomatie</option>
              <option value="police">👮 Police</option>
            </select>
          )}
        </div>

        {tab === 'mouvements' && (
          loading ? <p className={styles.empty}>Chargement…</p>
          : visibleMouvements.length === 0 ? (
            <div className={styles.empty}>
              <Landmark size={32} style={{ opacity: 0.3 }} />
              <p>
                {tresor.mouvements.length === 0
                  ? 'Aucun versement. Clôture une semaine dans une section pour alimenter le Trésor.'
                  : 'Aucun versement pour ces critères.'}
              </p>
            </div>
          ) : (
            <table className={styles.tresorTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Section</th>
                  <th>Archive</th>
                  <th>Taux</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                  {canEdit && <th aria-label="actions" />}
                </tr>
              </thead>
              <tbody>
                {visibleMouvements.map((m) => (
                  <tr key={m.id}>
                    <td className={styles.mono}>{fmtDateTimeFR(m.date)}</td>
                    <td>
                      <span className={styles.sectionChip}>
                        {SECTION_ICON[m.section]} {m.sectionLabel || SECTION_LABEL[m.section]}
                      </span>
                    </td>
                    <td className={styles.archLabel}>
                      <div>{m.archiveLabel || '—'}</div>
                      <div className={styles.archIdSmall}>{m.archiveId}</div>
                    </td>
                    <td className={styles.mono}>{m.rate}%</td>
                    <td className={`${styles.amount} ${styles.amtPos}`} style={{ textAlign: 'right' }}>
                      +{fmtMoney(m.amount)} ₽
                    </td>
                    {canEdit && (
                      <td>
                        <button className={styles.deleteBtn} onClick={() => handleDeleteMouvement(m)} aria-label="Supprimer">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'retraits' && (
          loading ? <p className={styles.empty}>Chargement…</p>
          : visibleRetraits.length === 0 ? (
            <div className={styles.empty}>
              <TrendingDown size={32} style={{ opacity: 0.3 }} />
              <p>Aucun retrait. {canEdit ? 'Utilise le bouton ci-dessus pour effectuer un retrait manuel.' : ''}</p>
            </div>
          ) : (
            <table className={styles.tresorTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Motif</th>
                  <th>Agent</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                  {canEdit && <th aria-label="actions" />}
                </tr>
              </thead>
              <tbody>
                {visibleRetraits.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.mono}>{fmtDateTimeFR(r.date)}</td>
                    <td><strong>{r.motif}</strong></td>
                    <td className={styles.muted}>{r.agent}</td>
                    <td className={`${styles.amount} ${styles.amtNeg}`} style={{ textAlign: 'right' }}>
                      −{fmtMoney(r.montant)} ₽
                    </td>
                    {canEdit && (
                      <td>
                        <button className={styles.deleteBtn} onClick={() => handleDeleteRetrait(r)} aria-label="Supprimer">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>

      <Modal open={showConfigForm} onClose={() => setShowConfigForm(false)}
        title="Configurer le taux de prélèvement"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowConfigForm(false)}>Annuler</Button>
            <Button onClick={handleSaveConfig}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <p className={styles.help}>
            Ce taux est appliqué à chaque clôture de semaine dans toutes les sections.
            Le montant prélevé est automatiquement versé au Trésor Central.
          </p>
          <label>Taux de prélèvement (%)
            <input type="number" min="0" max="100" step="1"
              value={rateForm}
              onChange={(e) => setRateForm(Number(e.target.value) || 0)} autoFocus />
          </label>
        </div>
      </Modal>

      <Modal open={showRetraitForm} onClose={() => setShowRetraitForm(false)}
        title="Retrait manuel du Trésor"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowRetraitForm(false)}>Annuler</Button>
            <Button onClick={handleSaveRetrait}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <p className={styles.help}>
            Solde actuel du Trésor : <strong>{fmtMoney(totals.solde)} ₽</strong>
          </p>
          <label>Montant (₽) *
            <input type="number" min="1" step="1" value={retraitForm.montant ?? ''}
              onChange={(e) => setRetraitForm({ ...retraitForm, montant: e.target.value ? Number(e.target.value) : undefined })}
              autoFocus />
          </label>
          <label>Motif *
            <textarea rows={2} value={retraitForm.motif ?? ''}
              onChange={(e) => setRetraitForm({ ...retraitForm, motif: e.target.value })}
              placeholder="Raison du retrait..." />
          </label>
          <label>Agent
            <input type="text" value={retraitForm.agent ?? ''}
              onChange={(e) => setRetraitForm({ ...retraitForm, agent: e.target.value })} />
          </label>
        </div>
      </Modal>
    </>
  );
}
