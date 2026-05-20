'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page DONS DU SANG — Gestion des dons
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage : sunagakure/hospital_dons (TABLEAU)
 *
 * Features :
 *   - Stats : total volume par groupe sanguin
 *   - Liste des dons avec date, donneur, groupe
 *   - Indicateur visuel des groupes rares (O- universel)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Droplet } from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type DonSang, type GroupeSanguin,
  GROUPES_SANGUINS, fmtDateFR,
} from '@/types/medical';

import styles from './page.module.css';

const FB_PATH = 'hospital_dons';
type Filter = 'all' | GroupeSanguin;

export default function DonsPage() {
  const { can, displayName } = useCurrentUser();
  const canEdit = can.adminBranche('medecin');
  const CURRENT_USER = displayName;

  const { data, loading } = useFirebaseValue<DonSang[] | null>(FB_PATH);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<DonSang>>({});

  const all = useMemo<DonSang[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (d): d is DonSang => d !== null && typeof d === 'object' && !!d.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    if (filter !== 'all') list = list.filter((d) => d.groupe === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        ((d.donneur || '') + ' ' + (d.preleveur || '') + ' ' + (d.destination || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id));
  }, [all, filter, search]);

  // Stats par groupe sanguin
  const statsByGroupe = useMemo(() => {
    const s: Record<string, { count: number; volume: number }> = {};
    GROUPES_SANGUINS.forEach((g) => {
      s[g] = { count: 0, volume: 0 };
    });
    for (const d of all) {
      if (s[d.groupe]) {
        s[d.groupe].count++;
        s[d.groupe].volume += d.quantite || 0;
      }
    }
    return s;
  }, [all]);

  const totalVolume = useMemo(() => all.reduce((s, d) => s + (d.quantite || 0), 0), [all]);

  function openCreate() {
    setEditingId(null);
    setForm({ groupe: 'O+', quantite: 450, preleveur: CURRENT_USER, date: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  }
  function openEdit(d: DonSang) {
    if (!canEdit) return;
    setEditingId(d.id); setForm(d); setShowForm(true);
  }
  function closeForm() {
    setShowForm(false); setEditingId(null); setForm({});
  }

  async function handleSave() {
    if (!form.donneur?.trim()) {
      toast.error('Le nom du donneur est obligatoire'); return;
    }
    if (!form.quantite || form.quantite <= 0) {
      toast.error('La quantité doit être positive'); return;
    }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((d) => d.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as DonSang;
      } else {
        list.push({
          id: now,
          donneur: form.donneur!.trim(),
          groupe: form.groupe || 'O+',
          quantite: Number(form.quantite),
          date: form.date || new Date().toISOString().slice(0, 10),
          preleveur: form.preleveur?.trim() || CURRENT_USER,
          destination: form.destination?.trim() || 'Stock',
          notes: form.notes?.trim() || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Don mis à jour' : 'Don enregistré');
      closeForm();
    } catch (err) {
      console.error(err); toast.error('Erreur');
    }
  }

  async function handleDelete(d: DonSang) {
    const ok = await confirmAction({
      title: 'Supprimer le don',
      message: `Supprimer le don de ${d.donneur} (${d.quantite}mL) ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== d.id));
      toast.success('Supprimé');
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Dons du sang"
        subtitle="Banque de sang de l'Hôpital de Sunagakure"
        actions={
          <RequireBranche branche="medecin">
            <Button onClick={openCreate}><Plus size={14} /> Enregistrer un don</Button>
          </RequireBranche>
        }
      >
        {/* Grille des groupes sanguins */}
        <div className={styles.bloodGrid}>
          {GROUPES_SANGUINS.map((g) => {
            const s = statsByGroupe[g];
            const isLow = s.volume < 1000;  // moins d'1 litre = bas
            const isEmpty = s.count === 0;
            return (
              <div
                key={g}
                className={`${styles.bloodCard} ${isEmpty ? styles.bloodEmpty : isLow ? styles.bloodLow : ''}`}
                onClick={() => setFilter(filter === g ? 'all' : g)}
              >
                <div className={styles.bloodGroup}>{g}</div>
                <div className={styles.bloodCount}>{s.count} don{s.count > 1 ? 's' : ''}</div>
                <div className={styles.bloodVolume}>{s.volume.toLocaleString('fr-FR')} mL</div>
              </div>
            );
          })}
        </div>

        <div className={styles.totalBox}>
          <Droplet size={16} />
          <span>Volume total disponible : <strong>{totalVolume.toLocaleString('fr-FR')} mL</strong></span>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Donneur, préleveur, destination…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filter !== 'all' && (
            <button className={styles.clearFilter} onClick={() => setFilter('all')}>
              Filtre actif : {filter} ×
            </button>
          )}
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Droplet size={32} style={{ opacity: 0.3 }} />
            <p>Aucun don pour ces critères.</p>
          </div>
        ) : (
          <table className={styles.donTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Donneur</th>
                <th>Groupe</th>
                <th>Volume</th>
                <th>Préleveur</th>
                <th>Destination</th>
                {canEdit && <th aria-label="actions" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td className={styles.mono}>{fmtDateFR(d.date)}</td>
                  <td
                    onClick={() => openEdit(d)}
                    style={canEdit ? { cursor: 'pointer' } : { cursor: 'default' }}
                  >
                    <strong>{d.donneur}</strong>
                  </td>
                  <td>
                    <span className={styles.groupeChip}>{d.groupe}</span>
                  </td>
                  <td className={styles.mono}><strong>{d.quantite} mL</strong></td>
                  <td className={styles.muted}>{d.preleveur || '—'}</td>
                  <td className={styles.muted}>{d.destination || 'Stock'}</td>
                  {canEdit && (
                    <td>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(d)}
                        aria-label="Supprimer"
                      >
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

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier le don' : 'Enregistrer un don'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>
              Donneur *
              <input
                type="text"
                value={form.donneur ?? ''}
                onChange={(e) => setForm({ ...form, donneur: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              Groupe sanguin
              <select
                value={form.groupe ?? 'O+'}
                onChange={(e) => setForm({ ...form, groupe: e.target.value as GroupeSanguin })}
              >
                {GROUPES_SANGUINS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.row3}>
            <label>
              Quantité (mL) *
              <input
                type="number"
                min="0"
                value={form.quantite ?? ''}
                onChange={(e) => setForm({ ...form, quantite: Number(e.target.value) })}
                placeholder="450"
              />
            </label>
            <label>
              Date du don
              <input
                type="date"
                value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Préleveur
              <input
                type="text"
                value={form.preleveur ?? ''}
                onChange={(e) => setForm({ ...form, preleveur: e.target.value })}
              />
            </label>
          </div>

          <label>
            Destination
            <input
              type="text"
              value={form.destination ?? ''}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              placeholder="Stock, nom du bénéficiaire..."
            />
          </label>

          <label>
            Notes
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
