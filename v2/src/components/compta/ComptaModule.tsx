'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Composant COMPTAMODULE — Module de comptabilité réutilisable
 * ════════════════════════════════════════════════════════════════
 *
 * Utilisé par toutes les pages comptabilité (avocat, médical, justice,
 * missions, diplomatie, police) avec une seule prop `section`.
 *
 * Permissions (gérées en interne via SECTION_TO_BRANCHE) :
 *   - Voir : tout le monde (connecté)
 *   - Créer / Modifier / Supprimer une transaction : Membre branche
 *   - Clôturer la semaine : Gérant branche uniquement
 *   - Supprimer une archive : Gérant branche uniquement
 *
 * Features :
 *   - 3 stats : Entrées (vert), Sorties (rouge), Solde (or)
 *   - Liste des transactions en cours avec recherche/filtre
 *   - Bouton "Nouvelle transaction" (modale)
 *   - Bouton "Clôturer la semaine" → archive + verse % au Trésor
 *   - Onglet "Archives" pour consulter les semaines passées
 *
 * Le % prélevé par le Trésor est lu depuis sunagakure/tresorCentral.
 *
 * 🔍 AUDIT LOG (Phase 2) :
 *   Toutes les opérations sensibles sont tracées dans /audit_log :
 *     - create/update/delete d'une transaction
 *     - compress (clôture de semaine)
 *     - create (versement au Trésor Central, target=tresor:mouvement)
 *     - delete (suppression d'archive)
 *   Le `target` encode la section (compta:police:transaction, etc.)
 *   pour pouvoir filtrer par module dans la future page Maintenance.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, TrendingUp, TrendingDown,
  Wallet, Archive, PackageCheck,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet, dbUpdate } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireMembreBranche, RequireBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type ComptaSection, type ComptaTransaction, type ComptaArchive,
  type ComptaData, type TransactionType, type TransactionCategory,
  type TresorCentral, type TresorMouvement,
  SECTION_LABEL, SECTION_FB_PATH, SECTION_ICON,
  TRANSACTION_CATEGORY_LABEL, ENTREE_CATEGORIES, SORTIE_CATEGORIES,
  TRESOR_DEFAULT_RATE,
  fmtMoney, fmtDateFR, fmtDateTimeFR, computeTotals, isEntree,
} from '@/types/compta';

import styles from './ComptaModule.module.css';

interface Props {
  section: ComptaSection;
}

type Tab = 'transactions' | 'archives';

/**
 * Mapping des sections compta vers les slugs de branches.
 * Si une section n'a pas de branche dédiée (ex: avocat), on fallback sur police.
 */
const SECTION_TO_BRANCHE: Record<ComptaSection, string> = {
  police: 'police',
  medical: 'medecin',
  justice: 'police',         // la justice est gérée par la police
  missions: 'bureau-missions',
  diplo: 'diplomate',
  avocat: 'police',          // fallback temporaire en attendant la branche Avocat
};

export default function ComptaModule({ section }: Props) {
  const { displayName: CURRENT_USER, id: CURRENT_USER_ID, can } = useCurrentUser();
  const fbPath = SECTION_FB_PATH[section];
  const branche = SECTION_TO_BRANCHE[section];

  // ─── Permissions ───
  const canEdit = can.membreBranche(branche);   // Membre = peut créer/modifier/supprimer transactions
  const canCloture = can.adminBranche(branche); // Gérant = peut clôturer + supprimer archive

  const { data, loading } = useFirebaseValue<ComptaData | null>(fbPath);
  const { data: tresorData } = useFirebaseValue<TresorCentral | null>('tresorCentral');

  const [tab, setTab] = useState<Tab>('transactions');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'entree' | 'sortie'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<ComptaTransaction>>({});
  const [viewingArchiveId, setViewingArchiveId] = useState<string | null>(null);

  // ─── Données ───
  const transactions = useMemo<ComptaTransaction[]>(() => {
    const tx = data?.transactions;
    return (Array.isArray(tx) ? tx : tx ? Object.values(tx) : []).filter(
      (t): t is ComptaTransaction => t !== null && typeof t === 'object' && !!t.id
    );
  }, [data]);

  const archives = useMemo<ComptaArchive[]>(() => {
    const arc = data?.archives;
    return (Array.isArray(arc) ? arc : arc ? Object.values(arc) : []).filter(
      (a): a is ComptaArchive => a !== null && typeof a === 'object' && !!a.id
    );
  }, [data]);

  const rate = tresorData?.prelevementRate ?? TRESOR_DEFAULT_RATE;
  const totals = useMemo(() => computeTotals(transactions), [transactions]);

  // ─── Filtres ───
  const visibleTransactions = useMemo(() => {
    let list = transactions;
    if (filterType !== 'all') list = list.filter((t) => t.type === filterType);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) =>
      ((t.description || '') + ' ' + (t.agent || '') + ' ' + (t.ref || '') + ' ' + (t.category || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => b.date - a.date);
  }, [transactions, filterType, search]);

  const visibleArchives = useMemo(() => {
    return [...archives].sort((a, b) => b.clotureLe - a.clotureLe);
  }, [archives]);

  const viewingArchive = viewingArchiveId
    ? archives.find((a) => a.id === viewingArchiveId)
    : null;

  // ─── Audit helper ───
  // Préfixe target avec section pour filtrer facilement par module compta
  const auditTargetTransaction = `compta:${section}:transaction`;
  const auditTargetArchive = `compta:${section}:archive`;

  // ─── Handlers ───
  function openCreate(type: TransactionType = 'entree') {
    setEditingId(null);
    setForm({
      type,
      category: type === 'entree' ? 'paiement_client' : 'salaire',
      date: Date.now(),
      agent: CURRENT_USER,
    });
    setShowForm(true);
  }
  function openEdit(t: ComptaTransaction) {
    setEditingId(t.id); setForm(t); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function persistData(newData: Partial<ComptaData>) {
    await dbUpdate(fbPath, newData);
  }

  async function handleSave() {
    if (!form.montant || form.montant <= 0) { toast.error('Le montant doit être positif'); return; }
    if (!form.category) { toast.error('La catégorie est obligatoire'); return; }
    const isEntreeCat = ENTREE_CATEGORIES.includes(form.category);
    const type: TransactionType = isEntreeCat ? 'entree' : 'sortie';

    try {
      const list = [...transactions];
      const now = Date.now();
      const sectionLbl = SECTION_LABEL[section];
      let savedTx: ComptaTransaction;
      let isUpdate = false;
      let oldTx: ComptaTransaction | undefined;

      if (editingId) {
        const idx = list.findIndex((t) => t.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        oldTx = list[idx];
        // Merge propre : on évite d'injecter des undefined dans Firebase
        const merged: ComptaTransaction = { ...list[idx], ...form, type, id: editingId } as ComptaTransaction;
        const cleanedDesc = form.description?.trim();
        const cleanedRef = form.ref?.trim();
        if (cleanedDesc) merged.description = cleanedDesc; else delete (merged as Partial<ComptaTransaction>).description;
        if (cleanedRef) merged.ref = cleanedRef; else delete (merged as Partial<ComptaTransaction>).ref;
        list[idx] = merged;
        savedTx = merged;
        isUpdate = true;
      } else {
        // Construction du nouvel objet SANS clés undefined (Firebase les refuse)
        const newTx: ComptaTransaction = {
          id: now,
          type,
          category: form.category,
          montant: Number(form.montant),
          date: form.date || now,
          agent: form.agent?.trim() || CURRENT_USER,
        };
        const cleanedDesc = form.description?.trim();
        const cleanedRef = form.ref?.trim();
        if (cleanedDesc) newTx.description = cleanedDesc;
        if (cleanedRef) newTx.ref = cleanedRef;
        savedTx = newTx;
        list.push(savedTx);
      }

      await persistData({ transactions: list, archives });

      // 🔍 Audit log (non-bloquant)
      const sign = savedTx.type === 'entree' ? '+' : '−';
      const catLbl = TRANSACTION_CATEGORY_LABEL[savedTx.category];
      const desc = savedTx.description ? ` — ${savedTx.description}` : '';

      if (isUpdate && oldTx) {
        const changes: string[] = [];
        if (oldTx.montant !== savedTx.montant) {
          changes.push(`montant ${fmtMoney(oldTx.montant)} → ${fmtMoney(savedTx.montant)} ₽`);
        }
        if (oldTx.category !== savedTx.category) {
          changes.push(`catégorie ${TRANSACTION_CATEGORY_LABEL[oldTx.category]} → ${catLbl}`);
        }
        if ((oldTx.description || '') !== (savedTx.description || '')) {
          changes.push('description');
        }
        const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';
        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'update',
          target: auditTargetTransaction,
          targetId: String(savedTx.id),
          detail: `Compta ${sectionLbl} — Modification ${catLbl} : ${sign}${fmtMoney(savedTx.montant)} ₽${desc}${changeSummary}`,
        });
      } else {
        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'create',
          target: auditTargetTransaction,
          targetId: String(savedTx.id),
          detail: `Compta ${sectionLbl} — Nouvelle ${savedTx.type} (${catLbl}) : ${sign}${fmtMoney(savedTx.montant)} ₽${desc}`,
        });
      }

      toast.success(editingId ? 'Transaction mise à jour' : 'Transaction enregistrée');
      closeForm();
    } catch (err) {
      console.error('[COMPTA SAVE]', err);
      toast.error('Erreur');
    }
  }

  async function handleDelete(t: ComptaTransaction) {
    const ok = await confirmAction({
      title: 'Supprimer la transaction',
      message: `Supprimer "${t.description || '#' + t.id}" (${fmtMoney(t.montant)} ₽) ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await persistData({
        transactions: transactions.filter((x) => x.id !== t.id),
        archives,
      });

      // 🔍 Audit log
      const sign = t.type === 'entree' ? '+' : '−';
      const catLbl = TRANSACTION_CATEGORY_LABEL[t.category];
      const desc = t.description ? ` — ${t.description}` : '';
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'delete',
        target: auditTargetTransaction,
        targetId: String(t.id),
        detail: `Compta ${SECTION_LABEL[section]} — Suppression ${catLbl} : ${sign}${fmtMoney(t.montant)} ₽${desc}`,
      });

      toast.success('Supprimée');
    } catch (err) {
      console.error('[COMPTA DELETE]', err);
      toast.error('Erreur');
    }
  }

  /**
   * Clôture de semaine : archive toutes les transactions et verse
   * le pourcentage convenu au Trésor Central.
   *
   * 🔒 Réservé aux Gérants de la branche (vérifié à 2 niveaux :
   *    bouton caché ET garde-fou ici au cas où).
   *
   * 🔍 Trace 2 entrées d'audit log :
   *    - compress sur compta:<section>:archive (la clôture)
   *    - create sur tresor:mouvement (le versement, si > 0)
   */
  async function handleClotureSemaine() {
    if (!canCloture) {
      toast.error('Seul le Gérant peut clôturer la semaine');
      return;
    }
    if (transactions.length === 0) {
      toast.error('Aucune transaction à clôturer'); return;
    }
    const prelevement = totals.solde > 0 ? Math.round(totals.solde * rate / 100) : 0;
    const msg = `Clôturer la semaine ?\n\n` +
      `• ${transactions.length} transactions\n` +
      `• Entrées : ${fmtMoney(totals.entrees)} ₽\n` +
      `• Sorties : ${fmtMoney(totals.sorties)} ₽\n` +
      `• Solde net : ${fmtMoney(totals.solde)} ₽\n` +
      `• Prélèvement Trésor (${rate}%) : ${fmtMoney(prelevement)} ₽\n\n` +
      `Toutes les transactions seront archivées.`;

    const ok = await confirmAction({
      title: 'Clôture de semaine',
      message: msg,
      confirmLabel: '📦 Clôturer',
    });
    if (!ok) return;

    try {
      const now = Date.now();
      const sectionLbl = SECTION_LABEL[section];
      const arch: ComptaArchive = {
        id: 'AR-' + now,
        label: `Semaine du ${new Date(now - 7 * 86400000).toLocaleDateString('fr-FR')} au ${new Date(now).toLocaleDateString('fr-FR')}`,
        clotureLe: now,
        cloturePar: CURRENT_USER,
        total: totals.solde,
        totalEntrees: totals.entrees,
        totalSorties: totals.sorties,
        count: transactions.length,
        tresorRate: rate,
        tresorPrelevement: prelevement,
        transactions: JSON.parse(JSON.stringify(transactions)),
      };

      // 1. Archiver + vider transactions
      await persistData({
        transactions: [],
        archives: [arch, ...archives],
      });

      // 🔍 Audit log de la clôture (compress = "regrouper N tx en 1 archive")
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'compress',
        target: auditTargetArchive,
        targetId: arch.id,
        detail: `Compta ${sectionLbl} — Clôture "${arch.label}" : ${arch.count} tx, ` +
          `+${fmtMoney(arch.totalEntrees)} ₽ / −${fmtMoney(arch.totalSorties)} ₽ ` +
          `(solde ${arch.total >= 0 ? '+' : ''}${fmtMoney(arch.total)} ₽), ` +
          `prélèvement Trésor ${rate}% : ${fmtMoney(prelevement)} ₽`,
      });

      // 2. Verser au Trésor Central si prélèvement > 0
      if (prelevement > 0) {
        const tresor: TresorCentral = tresorData || { prelevementRate: TRESOR_DEFAULT_RATE, mouvements: [] };
        const mouvements = Array.isArray(tresor.mouvements) ? [...tresor.mouvements] : [];
        const newMouv: TresorMouvement = {
          id: 'TC-' + now,
          section,
          sectionLabel: sectionLbl,
          amount: prelevement,
          date: now,
          archiveId: arch.id,
          archiveLabel: arch.label,
          rate,
          soldeOrigine: totals.solde,
        };
        mouvements.unshift(newMouv);
        await dbUpdate('tresorCentral', { ...tresor, mouvements });

        // 🔍 Audit log du versement (target=tresor:mouvement pour pouvoir
        // filtrer "d'où viennent les fonds du Trésor ?")
        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'create',
          target: 'tresor:mouvement',
          targetId: newMouv.id,
          detail: `Versement Trésor depuis Compta ${sectionLbl} : +${fmtMoney(prelevement)} ₽ ` +
            `(${rate}% du solde ${fmtMoney(totals.solde)} ₽, clôture ${arch.id})`,
        });
      }

      toast.success(`📦 Semaine clôturée — ${fmtMoney(prelevement)} ₽ versés au Trésor`);
    } catch (err) {
      console.error('[COMPTA CLOTURE]', err);
      toast.error('Erreur lors de la clôture');
    }
  }

  async function handleDeleteArchive(a: ComptaArchive) {
    if (!canCloture) {
      toast.error('Seul le Gérant peut supprimer une archive');
      return;
    }
    const ok = await confirmAction({
      title: "Supprimer l'archive",
      message: `Supprimer définitivement "${a.label}" ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await persistData({
        transactions,
        archives: archives.filter((x) => x.id !== a.id),
      });

      // 🔍 Audit log (action critique — on perd la donnée)
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'delete',
        target: auditTargetArchive,
        targetId: a.id,
        detail: `Compta ${SECTION_LABEL[section]} — Suppression archive "${a.label}" : ` +
          `${a.count} tx, solde ${a.total >= 0 ? '+' : ''}${fmtMoney(a.total)} ₽, ` +
          `prélèvement Trésor ${a.tresorRate}% : ${fmtMoney(a.tresorPrelevement)} ₽`,
      });

      toast.success('Archive supprimée');
      if (viewingArchiveId === a.id) setViewingArchiveId(null);
    } catch (err) {
      console.error('[COMPTA DELETE ARCHIVE]', err);
      toast.error('Erreur');
    }
  }

  // ─── Rendu ───
  const previewPrelevement = totals.solde > 0 ? Math.round(totals.solde * rate / 100) : 0;

  return (
    <>
      <Card
        title={`${SECTION_ICON[section]} Comptabilité — ${SECTION_LABEL[section]}`}
        subtitle={`Suivi financier et clôture hebdomadaire (Trésor : ${rate}%)`}
        actions={
          <RequireMembreBranche branche={branche}>
            <Button variant="outline" onClick={() => openCreate('sortie')}>
              <TrendingDown size={14} /> Sortie
            </Button>
            <Button onClick={() => openCreate('entree')}>
              <TrendingUp size={14} /> Entrée
            </Button>
          </RequireMembreBranche>
        }
      >
        {/* Stats */}
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGreen}`}>
            <TrendingUp size={16} />
            <div className={styles.statVal}>+{fmtMoney(totals.entrees)} ₽</div>
            <div className={styles.statLbl}>Entrées</div>
          </div>
          <div className={`${styles.statCard} ${styles.scRed}`}>
            <TrendingDown size={16} />
            <div className={styles.statVal}>−{fmtMoney(totals.sorties)} ₽</div>
            <div className={styles.statLbl}>Sorties</div>
          </div>
          <div className={`${styles.statCard} ${totals.solde >= 0 ? styles.scGold : styles.scRed}`}>
            <Wallet size={16} />
            <div className={styles.statVal}>
              {totals.solde >= 0 ? '+' : ''}{fmtMoney(totals.solde)} ₽
            </div>
            <div className={styles.statLbl}>Solde net</div>
          </div>
          <div className={`${styles.statCard} ${styles.scBlue}`}>
            <PackageCheck size={16} />
            <div className={styles.statVal}>{fmtMoney(previewPrelevement)} ₽</div>
            <div className={styles.statLbl}>Prélèvement {rate}%</div>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'transactions' ? styles.tabActive : ''}`}
            onClick={() => setTab('transactions')}
          >
            <span>Transactions actives</span>
            <span className={styles.tabCount}>{transactions.length}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'archives' ? styles.tabActive : ''}`}
            onClick={() => setTab('archives')}
          >
            <Archive size={11} /><span>Archives</span>
            <span className={styles.tabCount}>{archives.length}</span>
          </button>
        </div>

        {/* Toolbar tab transactions */}
        {tab === 'transactions' && (
          <>
            <div className={styles.toolbar}>
              <div className={styles.searchBox}>
                <Search size={14} />
                <input type="text" placeholder="Description, agent, référence…"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select
                className={styles.filterSelect}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | 'entree' | 'sortie')}
              >
                <option value="all">Tous types</option>
                <option value="entree">Entrées seulement</option>
                <option value="sortie">Sorties seulement</option>
              </select>
              {transactions.length > 0 && (
                <RequireBranche branche={branche}>
                  <Button variant="outline" onClick={handleClotureSemaine}>
                    📦 Clôturer la semaine
                  </Button>
                </RequireBranche>
              )}
            </div>

            {loading ? <p className={styles.empty}>Chargement…</p>
              : visibleTransactions.length === 0 ? (
                <div className={styles.empty}>
                  <Wallet size={32} style={{ opacity: 0.3 }} />
                  <p>{transactions.length === 0 ? 'Aucune transaction. Crée la première !' : 'Aucune transaction pour ces critères.'}</p>
                </div>
              ) : (
                <table className={styles.txTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Catégorie</th>
                      <th>Description</th>
                      <th>Agent</th>
                      <th style={{ textAlign: 'right' }}>Montant</th>
                      {canEdit && <th aria-label="actions" />}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTransactions.map((t) => {
                      const entree = t.type === 'entree';
                      return (
                        <tr key={t.id} className={entree ? styles.rowEntree : styles.rowSortie}>
                          <td className={styles.mono}>{fmtDateFR(t.date)}</td>
                          <td>
                            <span className={`${styles.catChip} ${entree ? styles.catEntree : styles.catSortie}`}>
                              {TRANSACTION_CATEGORY_LABEL[t.category]}
                            </span>
                          </td>
                          <td>
                            <div className={styles.desc}>{t.description || '—'}</div>
                            {t.ref && <div className={styles.refSmall}>réf. {t.ref}</div>}
                          </td>
                          <td className={styles.muted}>{t.agent || '—'}</td>
                          <td className={`${styles.amount} ${entree ? styles.amtPos : styles.amtNeg}`} style={{ textAlign: 'right' }}>
                            {entree ? '+' : '−'}{fmtMoney(t.montant)} ₽
                          </td>
                          {canEdit && (
                            <td>
                              <div className={styles.rowActions}>
                                <button className={styles.editBtn} onClick={() => openEdit(t)}>Modifier</button>
                                <button className={styles.deleteBtn} onClick={() => handleDelete(t)} aria-label="Supprimer">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </>
        )}

        {/* Tab archives */}
        {tab === 'archives' && (
          loading ? <p className={styles.empty}>Chargement…</p>
          : visibleArchives.length === 0 ? (
            <div className={styles.empty}>
              <Archive size={32} style={{ opacity: 0.3 }} />
              <p>Aucune semaine clôturée pour le moment.</p>
            </div>
          ) : (
            <div className={styles.archiveList}>
              {visibleArchives.map((a) => (
                <article key={a.id} className={styles.archive} onClick={() => setViewingArchiveId(a.id)}>
                  <div className={styles.archHeader}>
                    <span className={styles.archId}>{a.id}</span>
                    <span className={styles.archDate}>{fmtDateTimeFR(a.clotureLe)}</span>
                  </div>
                  <h3>{a.label}</h3>
                  <div className={styles.archStats}>
                    <span className={styles.archStat}>+{fmtMoney(a.totalEntrees)} ₽</span>
                    <span className={styles.archStatNeg}>−{fmtMoney(a.totalSorties)} ₽</span>
                    <span className={`${styles.archStatSolde} ${a.total >= 0 ? styles.amtPos : styles.amtNeg}`}>
                      Solde : {a.total >= 0 ? '+' : ''}{fmtMoney(a.total)} ₽
                    </span>
                    <span className={styles.archCount}>{a.count} transactions</span>
                  </div>
                  <div className={styles.archTresor}>
                    📦 Prélevé Trésor ({a.tresorRate}%) : <strong>{fmtMoney(a.tresorPrelevement)} ₽</strong>
                  </div>
                </article>
              ))}
            </div>
          )
        )}
      </Card>

      {/* Viewer archive */}
      <Modal open={!!viewingArchive} onClose={() => setViewingArchiveId(null)}
        title={viewingArchive?.label || ''}
        size="lg"
        footer={
          viewingArchive && (
            <>
              {canCloture && (
                <Button variant="ghost" onClick={() => handleDeleteArchive(viewingArchive)}>
                  <Trash2 size={14} /> Supprimer
                </Button>
              )}
              <Button onClick={() => setViewingArchiveId(null)}>Fermer</Button>
            </>
          )
        }
      >
        {viewingArchive && (
          <div className={styles.viewer}>
            <div className={styles.viewerStats}>
              <div>
                <div className={styles.fieldLabel}>Entrées</div>
                <strong className={styles.amtPos}>+{fmtMoney(viewingArchive.totalEntrees)} ₽</strong>
              </div>
              <div>
                <div className={styles.fieldLabel}>Sorties</div>
                <strong className={styles.amtNeg}>−{fmtMoney(viewingArchive.totalSorties)} ₽</strong>
              </div>
              <div>
                <div className={styles.fieldLabel}>Solde</div>
                <strong className={viewingArchive.total >= 0 ? styles.amtPos : styles.amtNeg}>
                  {viewingArchive.total >= 0 ? '+' : ''}{fmtMoney(viewingArchive.total)} ₽
                </strong>
              </div>
              <div>
                <div className={styles.fieldLabel}>Trésor</div>
                <strong>{fmtMoney(viewingArchive.tresorPrelevement)} ₽</strong>
              </div>
            </div>

            <div className={styles.archMeta}>
              Clôturée par <strong>{viewingArchive.cloturePar}</strong> le {fmtDateTimeFR(viewingArchive.clotureLe)}
            </div>

            <h4 className={styles.viewerSubtitle}>
              Détail des {viewingArchive.count} transactions
            </h4>

            <table className={styles.txTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Catégorie</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {viewingArchive.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className={styles.mono}>{fmtDateFR(t.date)}</td>
                    <td>
                      <span className={`${styles.catChip} ${t.type === 'entree' ? styles.catEntree : styles.catSortie}`}>
                        {TRANSACTION_CATEGORY_LABEL[t.category]}
                      </span>
                    </td>
                    <td>{t.description || '—'}</td>
                    <td className={`${styles.amount} ${t.type === 'entree' ? styles.amtPos : styles.amtNeg}`} style={{ textAlign: 'right' }}>
                      {t.type === 'entree' ? '+' : '−'}{fmtMoney(t.montant)} ₽
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Form transaction */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier la transaction' : `Nouvelle ${form.type === 'sortie' ? 'sortie' : 'entrée'}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Catégorie *
            <select value={form.category ?? 'paiement_client'}
              onChange={(e) => {
                const cat = e.target.value as TransactionCategory;
                setForm({ ...form, category: cat, type: isEntree(cat) ? 'entree' : 'sortie' });
              }}>
              <optgroup label="Entrées">
                {ENTREE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{TRANSACTION_CATEGORY_LABEL[c]}</option>
                ))}
              </optgroup>
              <optgroup label="Sorties">
                {SORTIE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{TRANSACTION_CATEGORY_LABEL[c]}</option>
                ))}
              </optgroup>
            </select>
          </label>

          <label>Montant (₽) *
            <input type="number" min="0" step="1" value={form.montant ?? ''}
              onChange={(e) => setForm({ ...form, montant: e.target.value ? Number(e.target.value) : undefined })}
              autoFocus />
          </label>

          <label>Description
            <input type="text" value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Détails de la transaction" />
          </label>

          <div className={styles.row}>
            <label>Référence (optionnel)
              <input type="text" value={form.ref ?? ''}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
                placeholder="N° facture, affaire..." />
            </label>
            <label>Agent
              <input type="text" value={form.agent ?? ''}
                onChange={(e) => setForm({ ...form, agent: e.target.value })} />
            </label>
          </div>
        </div>
      </Modal>
    </>
  );
}
