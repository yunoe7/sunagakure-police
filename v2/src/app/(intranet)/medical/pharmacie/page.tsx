'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page PHARMACIE — Stock de médicaments
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir : tout le monde (connecté)
 * - Créer / modifier / supprimer : TOUS LES MEMBRES MÉDECIN + Admin
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Pill, AlertTriangle,
  Minus, Package, Coins,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireMembreBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Medicament, type MedCategorie,
  MED_CATEGORIES, MED_CATEGORIE_LABEL, fmtMoney,
} from '@/types/medical';

import styles from './page.module.css';

const FB_PATH = 'hospital_pharmacie';
type CatFilter = 'all' | MedCategorie;

export default function PharmaciePage() {
  const { can } = useCurrentUser();
  const canEdit = can.membreBranche('medecin');

  const { data, loading } = useFirebaseValue<Medicament[] | null>(FB_PATH);

  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Medicament>>({});

  const all = useMemo<Medicament[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (m): m is Medicament => m !== null && typeof m === 'object' && !!m.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    if (catFilter !== 'all') list = list.filter((m) => m.categorie === catFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) =>
        ((m.nom || '') + ' ' + (m.fournisseur || '') + ' ' + (m.notes || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [all, catFilter, search]);

  const stats = useMemo(() => {
    const total = all.length;
    const ruptures = all.filter((m) => m.stock === 0).length;
    const alertes = all.filter((m) => m.alerteSeuil && m.stock > 0 && m.stock <= m.alerteSeuil).length;
    const valeur = all.reduce((s, m) => s + (m.prix || 0) * m.stock, 0);
    return { total, ruptures, alertes, valeur };
  }, [all]);

  function openCreate() {
    setEditingId(null);
    setForm({ categorie: 'antalgique', stock: 0, alerteSeuil: 5 });
    setShowForm(true);
  }
  function openEdit(m: Medicament) {
    if (!canEdit) return;
    setEditingId(m.id); setForm(m); setShowForm(true);
  }
  function closeForm() {
    setShowForm(false); setEditingId(null); setForm({});
  }

  async function handleSave() {
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire'); return;
    }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((m) => m.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Medicament;
      } else {
        list.push({
          id: now,
          nom: form.nom!.trim(),
          categorie: form.categorie || 'autre',
          stock: Number(form.stock) || 0,
          unite: form.unite?.trim() || undefined,
          prix: form.prix ? Number(form.prix) : undefined,
          fournisseur: form.fournisseur?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          alerteSeuil: form.alerteSeuil ? Number(form.alerteSeuil) : undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Produit mis à jour' : 'Produit ajouté');
      closeForm();
    } catch (err) {
      console.error(err); toast.error('Erreur');
    }
  }

  async function handleDelete(m: Medicament) {
    const ok = await confirmAction({
      title: 'Retirer du stock',
      message: `Retirer "${m.nom}" de la pharmacie ?`,
      confirmLabel: 'Retirer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== m.id));
      toast.success('Retiré');
    } catch { toast.error('Erreur'); }
  }

  async function adjustStock(m: Medicament, delta: number) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx === -1) return;
      const newStock = Math.max(0, list[idx].stock + delta);
      list[idx] = { ...list[idx], stock: newStock };
      await dbSet(FB_PATH, list);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Pharmacie"
        subtitle="Stock de médicaments de l'Hôpital"
        actions={
          <RequireMembreBranche branche="medecin">
            <Button onClick={openCreate}><Plus size={14} /> Ajouter un produit</Button>
          </RequireMembreBranche>
        }
      >
        <div className={styles.statGrid}>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Package size={16} />
            <div className={styles.statVal}>{stats.total}</div>
            <div className={styles.statLbl}>Produits</div>
          </div>
          <div className={`${styles.statCard} ${styles.scWarn}`}>
            <AlertTriangle size={16} />
            <div className={styles.statVal}>{stats.alertes}</div>
            <div className={styles.statLbl}>Stock bas</div>
          </div>
          <div className={`${styles.statCard} ${styles.scDanger}`}>
            <AlertTriangle size={16} />
            <div className={styles.statVal}>{stats.ruptures}</div>
            <div className={styles.statLbl}>En rupture</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGreen}`}>
            <Coins size={16} />
            <div className={styles.statVal}>{fmtMoney(stats.valeur)} ₽</div>
            <div className={styles.statLbl}>Valeur stock</div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Nom, fournisseur…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value as CatFilter)}
          >
            <option value="all">Toutes catégories</option>
            {MED_CATEGORIES.map((c) => (
              <option key={c} value={c}>{MED_CATEGORIE_LABEL[c]}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Pill size={32} style={{ opacity: 0.3 }} />
            <p>Aucun médicament en stock.</p>
          </div>
        ) : (
          <table className={styles.medTable}>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Catégorie</th>
                <th>Stock</th>
                <th>Prix</th>
                <th>Fournisseur</th>
                {canEdit && <th aria-label="actions" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const inRupture = m.stock === 0;
                const inAlerte = !inRupture && m.alerteSeuil && m.stock <= m.alerteSeuil;
                return (
                  <tr key={m.id} className={inRupture ? styles.rowRupture : inAlerte ? styles.rowAlerte : ''}>
                    <td
                      onClick={() => openEdit(m)}
                      style={canEdit ? { cursor: 'pointer' } : { cursor: 'default' }}
                    >
                      <strong>{m.nom}</strong>
                      {m.notes && <div className={styles.notes}>{m.notes}</div>}
                    </td>
                    <td>
                      <span className={styles.catChip}>{MED_CATEGORIE_LABEL[m.categorie]}</span>
                    </td>
                    <td>
                      <div className={styles.stockControl}>
                        {canEdit && (
                          <button
                            className={styles.stockBtn}
                            onClick={() => adjustStock(m, -1)}
                            disabled={m.stock === 0}
                          >
                            <Minus size={11} />
                          </button>
                        )}
                        <span className={`${styles.stockVal} ${inRupture ? styles.stockRupture : inAlerte ? styles.stockAlerte : ''}`}>
                          {m.stock}
                          {m.unite && <small> {m.unite}</small>}
                        </span>
                        {canEdit && (
                          <button className={styles.stockBtn} onClick={() => adjustStock(m, +1)}>
                            <Plus size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={styles.mono}>
                      {m.prix ? `${fmtMoney(m.prix)} ₽` : '—'}
                    </td>
                    <td className={styles.muted}>{m.fournisseur || '—'}</td>
                    {canEdit && (
                      <td>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(m)}
                          aria-label="Supprimer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier le produit' : 'Nouveau produit'}
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
              Nom du produit *
              <input
                type="text"
                value={form.nom ?? ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                autoFocus
                placeholder="Ex: Paracétamol 500mg"
              />
            </label>
            <label>
              Catégorie
              <select
                value={form.categorie ?? 'antalgique'}
                onChange={(e) => setForm({ ...form, categorie: e.target.value as MedCategorie })}
              >
                {MED_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{MED_CATEGORIE_LABEL[c]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.row3}>
            <label>
              Stock initial
              <input
                type="number"
                min="0"
                value={form.stock ?? 0}
                onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
              />
            </label>
            <label>
              Unité
              <input
                type="text"
                value={form.unite ?? ''}
                onChange={(e) => setForm({ ...form, unite: e.target.value })}
                placeholder="comprimés, flacons..."
              />
            </label>
            <label>
              Seuil d&apos;alerte
              <input
                type="number"
                min="0"
                value={form.alerteSeuil ?? ''}
                onChange={(e) =>
                  setForm({ ...form, alerteSeuil: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="Ex: 5"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              Prix unitaire (₽)
              <input
                type="number"
                min="0"
                value={form.prix ?? ''}
                onChange={(e) =>
                  setForm({ ...form, prix: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </label>
            <label>
              Fournisseur
              <input
                type="text"
                value={form.fournisseur ?? ''}
                onChange={(e) => setForm({ ...form, fournisseur: e.target.value })}
              />
            </label>
          </div>

          <label>
            Notes
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Posologie, contre-indications, effets..."
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
