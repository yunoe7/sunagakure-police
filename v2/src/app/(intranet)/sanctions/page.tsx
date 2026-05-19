'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page SANCTIONS — Promotions, récompenses et sanctions
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/sanctions (TABLEAU)
 *
 * 6 types : Promotion, Rétrogradation, Avertissement,
 *           Exclusion, Récompense, Suspension
 * Coloration verte (positives) / rouge (négatives) automatique.
 *
 * Permissions (Phase C) :
 * - Voir / chercher / filtrer : tout le monde (connecté)
 * - Créer / modifier / supprimer : Gérants Police + Admin
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Scale, TrendingUp, TrendingDown,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { RequireBranche } from '@/components/Require';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Sanction, type SanctionType,
  SANCTION_TYPE_LABEL, isSanctionPositive, isSanctionNegative, fmtDateFR,
} from '@/types/police-rh';

import styles from './page.module.css';

const FB_PATH = 'sanctions';
type Filter = 'all' | 'positive' | 'negative';

export default function SanctionsPage() {
  const { displayName: CURRENT_USER, can } = useCurrentUser();
  const { data, loading } = useFirebaseValue<Sanction[] | null>(FB_PATH);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Sanction>>({});

  // Permission centralisée
  const canEdit = can.adminBranche('police');

  const all = useMemo<Sanction[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (s): s is Sanction => s !== null && typeof s === 'object' && !!s.id
    ),
    [data]
  );

  const counts = useMemo(() => {
    return {
      all: all.length,
      positive: all.filter((s) => isSanctionPositive(s.type)).length,
      negative: all.filter((s) => isSanctionNegative(s.type)).length,
    };
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (filter === 'positive') list = list.filter((s) => isSanctionPositive(s.type));
    else if (filter === 'negative') list = list.filter((s) => isSanctionNegative(s.type));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) =>
      ((s.cible || '') + ' ' + (s.motif || '') + ' ' + (s.auteur || '') + ' ' + (s.type || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      const da = typeof a.date === 'number' ? a.date : new Date(a.date || 0).getTime();
      const db_ = typeof b.date === 'number' ? b.date : new Date(b.date || 0).getTime();
      return db_ - da;
    });
  }, [all, filter, search]);

  function openCreate() {
    setEditingId(null);
    setForm({ type: 'Avertissement', auteur: CURRENT_USER });
    setShowForm(true);
  }
  function openEdit(s: Sanction) { setEditingId(s.id); setForm(s); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.cible?.trim()) { toast.error('La cible est obligatoire'); return; }
    if (!form.type) { toast.error('Le type est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((s) => s.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Sanction;
      } else {
        list.push({
          id: now,
          type: form.type!,
          cible: form.cible!.trim(),
          motif: form.motif?.trim() || undefined,
          auteur: form.auteur?.trim() || CURRENT_USER,
          date: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Sanction mise à jour' : 'Sanction enregistrée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(s: Sanction) {
    const ok = await confirmAction({
      title: 'Supprimer la sanction',
      message: `Supprimer "${SANCTION_TYPE_LABEL[s.type]}" pour ${s.cible} ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== s.id)); toast.success('Supprimée'); }
    catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Sanctions"
        subtitle="Promotions, récompenses, sanctions et avertissements"
        actions={
          <RequireBranche branche="police">
            <Button onClick={openCreate}><Plus size={14} /> Nouvelle sanction</Button>
          </RequireBranche>
        }
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGreen}`}>
            <TrendingUp size={16} />
            <div className={styles.statVal}>{counts.positive}</div>
            <div className={styles.statLbl}>Positives</div>
          </div>
          <div className={`${styles.statCard} ${styles.scRed}`}>
            <TrendingDown size={16} />
            <div className={styles.statVal}>{counts.negative}</div>
            <div className={styles.statLbl}>Négatives</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Scale size={16} />
            <div className={styles.statVal}>{counts.all}</div>
            <div className={styles.statLbl}>Total</div>
          </div>
        </div>

        <div className={styles.tabs}>
          {(['all', 'positive', 'negative'] as Filter[]).map((f) => (
            <button key={f}
              className={`${styles.tab} ${filter === f ? styles.tabActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Toutes' : f === 'positive' ? '⬆ Positives' : '⬇ Négatives'}
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Nom, motif, auteur, type…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Scale size={32} style={{ opacity: 0.3 }} />
              <p>Aucune sanction pour ces critères.</p>
            </div>
          ) : (
            <table className={styles.sanctionTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Cible</th>
                  <th>Motif</th>
                  <th>Par</th>
                  {canEdit && <th aria-label="actions" />}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const positive = isSanctionPositive(s.type);
                  const negative = isSanctionNegative(s.type);
                  return (
                    <tr key={s.id} className={positive ? styles.rowPositive : negative ? styles.rowNegative : ''}>
                      <td className={styles.mono}>{fmtDateFR(s.date)}</td>
                      <td>
                        <span className={`${styles.typeChip} ${positive ? styles.chipPos : negative ? styles.chipNeg : styles.chipNeu}`}>
                          {SANCTION_TYPE_LABEL[s.type]}
                        </span>
                      </td>
                      <td><strong>{s.cible}</strong></td>
                      <td className={styles.motif}>{s.motif || '—'}</td>
                      <td className={styles.muted}>{s.auteur || '—'}</td>
                      {canEdit && (
                        <td>
                          <div className={styles.rowActions}>
                            <button className={styles.editBtn} onClick={() => openEdit(s)}>Modifier</button>
                            <button className={styles.deleteBtn} onClick={() => handleDelete(s)} aria-label="Supprimer">
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
      </Card>

      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier la sanction' : 'Nouvelle sanction'} size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Type *
            <select value={form.type ?? 'Avertissement'}
              onChange={(e) => setForm({ ...form, type: e.target.value as SanctionType })}>
              <optgroup label="Positives">
                <option value="Promotion">{SANCTION_TYPE_LABEL.Promotion}</option>
                <option value="Récompense">{SANCTION_TYPE_LABEL.Récompense}</option>
              </optgroup>
              <optgroup label="Négatives">
                <option value="Avertissement">{SANCTION_TYPE_LABEL.Avertissement}</option>
                <option value="Rétrogradation">{SANCTION_TYPE_LABEL.Rétrogradation}</option>
                <option value="Suspension">{SANCTION_TYPE_LABEL.Suspension}</option>
                <option value="Exclusion">{SANCTION_TYPE_LABEL.Exclusion}</option>
              </optgroup>
            </select>
          </label>

          <label>Cible (nom de l&apos;agent) *
            <input type="text" value={form.cible ?? ''}
              onChange={(e) => setForm({ ...form, cible: e.target.value })} autoFocus
              placeholder="Nom du destinataire" />
          </label>

          <label>Motif
            <textarea rows={3} value={form.motif ?? ''}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              placeholder="Raison de la sanction..." />
          </label>

          <label>Auteur
            <input type="text" value={form.auteur ?? ''}
              onChange={(e) => setForm({ ...form, auteur: e.target.value })}
              placeholder="Qui décerne la sanction" />
          </label>
        </div>
      </Modal>
    </>
  );
}
