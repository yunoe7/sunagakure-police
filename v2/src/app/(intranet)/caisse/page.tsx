'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page CAISSE POLICE — Comptabilité du commissariat
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/caisse_police/transactions (TABLEAU)
 *
 * Affiche :
 *   - Solde courant (entrées - sorties)
 *   - Total entrées / sorties sur la période
 *   - Liste chronologique des transactions
 *   - Filtres par type
 *
 * Note : on utilise un sous-chemin (caisse_police/transactions) pour
 * laisser de la place à d'autres données plus tard (archives, etc.).
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  TrendingUp,
  TrendingDown,
  Wallet,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Transaction,
  type TransactionType,
  TRANSACTION_TYPE_LABEL,
  ENTREES,
  SORTIES,
  isEntree,
  signedAmount,
  fmtMoney,
  fmtDateFR,
} from '@/types/caisse';

import styles from './page.module.css';

const FB_PATH = 'caisse_police/transactions';
const CURRENT_USER = 'Ninja';

type Filter = 'all' | 'entrees' | 'sorties';

export default function CaissePage() {
  const { data, loading } = useFirebaseValue<Transaction[] | null>(FB_PATH);

  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Transaction>>({});

  // ─── Données normalisées ───
  const all = useMemo<Transaction[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (t): t is Transaction => t !== null && typeof t === 'object' && !!t.id
    );
  }, [data]);

  const visible = useMemo(() => {
    let list = all;
    if (filter === 'entrees') list = list.filter((t) => isEntree(t.type));
    if (filter === 'sorties') list = list.filter((t) => !isEntree(t.type));
    return [...list].sort((a, b) => b.date - a.date);
  }, [all, filter]);

  // ─── Stats ───
  const stats = useMemo(() => {
    let entrees = 0;
    let sorties = 0;
    for (const t of all) {
      if (isEntree(t.type)) entrees += t.montant;
      else sorties += t.montant;
    }
    return {
      solde: entrees - sorties,
      entrees,
      sorties,
      count: all.length,
    };
  }, [all]);

  // ─── Handlers ───
  function openCreate() {
    setEditingId(null);
    setForm({ type: 'amende', date: Date.now() });
    setShowForm(true);
  }

  function openEdit(t: Transaction) {
    setEditingId(t.id);
    setForm(t);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  }

  async function handleSave() {
    if (!form.description?.trim()) {
      toast.error('La description est obligatoire');
      return;
    }
    if (!form.montant || form.montant <= 0) {
      toast.error('Le montant doit être positif');
      return;
    }
    try {
      const list = [...all];
      const now = Date.now();

      if (editingId) {
        const idx = list.findIndex((t) => t.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Transaction;
      } else {
        list.push({
          id: now,
          type: form.type || 'amende',
          montant: Number(form.montant),
          description: form.description!.trim(),
          date: form.date || now,
          agent: CURRENT_USER,
        } as Transaction);
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Transaction mise à jour' : 'Transaction enregistrée');
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(t: Transaction) {
    const ok = await confirmAction({
      title: 'Supprimer la transaction',
      message: `Supprimer "${t.description}" (${fmtMoney(t.montant)} ₽) ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== t.id));
      toast.success('Transaction supprimée');
    } catch {
      toast.error('Erreur');
    }
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Caisse Police"
        subtitle="Comptabilité du commissariat de Suna"
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> Nouvelle transaction
          </Button>
        }
      >
        {/* Solde + stats */}
        <div className={styles.heroBox}>
          <div className={styles.soldeBox}>
            <div className={styles.soldeLabel}>
              <Wallet size={12} /> Solde courant
            </div>
            <div
              className={`${styles.soldeValue} ${stats.solde >= 0 ? styles.positif : styles.negatif}`}
            >
              {stats.solde >= 0 ? '+' : '−'}
              {fmtMoney(stats.solde)} ₽
            </div>
            <div className={styles.soldeSub}>
              {stats.count} transaction{stats.count > 1 ? 's' : ''} enregistrée{stats.count > 1 ? 's' : ''}
            </div>
          </div>

          <div className={styles.statsRight}>
            <div className={`${styles.statBox} ${styles.statEntrees}`}>
              <div className={styles.statHead}>
                <TrendingUp size={13} />
                <span>Entrées</span>
              </div>
              <div className={styles.statValue}>+{fmtMoney(stats.entrees)} ₽</div>
            </div>
            <div className={`${styles.statBox} ${styles.statSorties}`}>
              <div className={styles.statHead}>
                <TrendingDown size={13} />
                <span>Sorties</span>
              </div>
              <div className={styles.statValue}>−{fmtMoney(stats.sorties)} ₽</div>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className={styles.filters}>
          <button
            className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`}
            onClick={() => setFilter('all')}
          >
            Toutes
          </button>
          <button
            className={`${styles.fbtn} ${styles.fbtnEntree} ${filter === 'entrees' ? styles.fbtnOn : ''}`}
            onClick={() => setFilter('entrees')}
          >
            <TrendingUp size={11} /> Entrées
          </button>
          <button
            className={`${styles.fbtn} ${styles.fbtnSortie} ${filter === 'sorties' ? styles.fbtnOn : ''}`}
            onClick={() => setFilter('sorties')}
          >
            <TrendingDown size={11} /> Sorties
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Coins size={32} style={{ opacity: 0.3 }} />
            <p>
              {filter !== 'all'
                ? 'Aucune transaction pour ce filtre.'
                : 'Aucune transaction. Ajoute la première !'}
            </p>
          </div>
        ) : (
          <table className={styles.txTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Agent</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const positive = isEntree(t.type);
                return (
                  <tr key={t.id} onClick={() => openEdit(t)}>
                    <td className={styles.mono}>{fmtDateFR(t.date)}</td>
                    <td>
                      <span
                        className={`${styles.typeChip} ${positive ? styles.chipEntree : styles.chipSortie}`}
                      >
                        {positive ? (
                          <ArrowUpRight size={11} />
                        ) : (
                          <ArrowDownRight size={11} />
                        )}
                        {TRANSACTION_TYPE_LABEL[t.type]}
                      </span>
                    </td>
                    <td>{t.description}</td>
                    <td className={styles.muted}>{t.agent || '—'}</td>
                    <td
                      className={`${styles.amountCell} ${positive ? styles.amtPos : styles.amtNeg}`}
                      style={{ textAlign: 'right' }}
                    >
                      {positive ? '+' : '−'}
                      {fmtMoney(t.montant)} ₽
                    </td>
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(t);
                        }}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modale */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier la transaction' : 'Nouvelle transaction'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>
              Annuler
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Type de transaction
            <select
              value={form.type ?? 'amende'}
              onChange={(e) => setForm({ ...form, type: e.target.value as TransactionType })}
            >
              <optgroup label="Entrées (+)">
                {ENTREES.map((t) => (
                  <option key={t} value={t}>
                    {TRANSACTION_TYPE_LABEL[t]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Sorties (−)">
                {SORTIES.map((t) => (
                  <option key={t} value={t}>
                    {TRANSACTION_TYPE_LABEL[t]}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className={styles.row}>
            <label>
              Montant (₽) *
              <input
                type="number"
                min="0"
                value={form.montant ?? ''}
                onChange={(e) =>
                  setForm({ ...form, montant: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="Ex: 5000"
                autoFocus
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.date ? new Date(form.date).toISOString().slice(0, 10) : ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    date: e.target.value ? new Date(e.target.value).getTime() : Date.now(),
                  })
                }
              />
            </label>
          </div>

          <label>
            Description *
            <input
              type="text"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Amende — vol au marché central"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
