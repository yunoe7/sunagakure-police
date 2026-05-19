'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page PLAIDOIRIES — Notes et arguments d'audience
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/avocat_plaidoiries (TABLEAU)
 *
 * Chaque plaidoirie est liée à une affaire (optionnellement) et
 * contient le texte de l'argumentation, les preuves et les
 * arguments clés. Vue détaillée en modale.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Mic, Calendar } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Plaidoirie, type Affaire,
  fmtDateFR,
} from '@/types/avocat';

import styles from './page.module.css';

const FB_PATH = 'avocat_plaidoiries';

export default function PlaidoiriesPage() {
  const { data, loading } = useFirebaseValue<Plaidoirie[] | null>(FB_PATH);
  const { data: affairesData } = useFirebaseValue<Affaire[] | null>('avocat_affaires');

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Plaidoirie>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);

  const all = useMemo<Plaidoirie[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (p): p is Plaidoirie => p !== null && typeof p === 'object' && !!p.id
    ),
    [data]
  );

  const affaires = useMemo<Affaire[]>(
    () => (Array.isArray(affairesData) ? affairesData : affairesData ? Object.values(affairesData) : []).filter(
      (a): a is Affaire => a !== null && typeof a === 'object' && !!a.id
    ),
    [affairesData]
  );

  const visible = useMemo(() => {
    let list = all;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) =>
      ((p.titre || '') + ' ' + (p.affaireRef || '') + ' ' + (p.contenu || '') + ' ' + (p.arguments || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  }, [all, search]);

  const viewing = viewingId ? all.find((p) => p.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({});
    setShowForm(true);
  }
  function openEdit(p: Plaidoirie) {
    setEditingId(p.id); setForm(p); setShowForm(true); setViewingId(null);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  function selectAffaire(id: number) {
    const a = affaires.find((x) => x.id === id);
    if (a) {
      setForm({
        ...form,
        affaireId: id,
        affaireRef: a.ref || a.titre,
      });
    }
  }

  async function handleSave() {
    if (!form.titre?.trim()) { toast.error('Le titre est obligatoire'); return; }
    if (!form.contenu?.trim()) { toast.error('Le contenu est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((p) => p.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = {
          ...list[idx],
          ...form,
          id: editingId,
          updatedAt: now,
        } as Plaidoirie;
      } else {
        list.push({
          id: now,
          titre: form.titre!.trim(),
          affaireId: form.affaireId,
          affaireRef: form.affaireRef,
          contenu: form.contenu!.trim(),
          arguments: form.arguments?.trim() || undefined,
          preuves: form.preuves?.trim() || undefined,
          dateAudience: form.dateAudience || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Plaidoirie mise à jour' : 'Plaidoirie enregistrée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(p: Plaidoirie) {
    const ok = await confirmAction({
      title: 'Supprimer la plaidoirie',
      message: `Supprimer "${p.titre}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== p.id));
      toast.success('Supprimée');
      if (viewingId === p.id) setViewingId(null);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Plaidoiries"
        subtitle="Notes et arguments préparés pour vos affaires"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvelle plaidoirie</Button>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Titre, affaire, arguments…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.totalChip}>
            {all.length} plaidoirie{all.length > 1 ? 's' : ''}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Mic size={32} style={{ opacity: 0.3 }} />
              <p>Aucune plaidoirie. Ajoute la première !</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((p) => (
                <article key={p.id} className={styles.plaidoirie} onClick={() => setViewingId(p.id)}>
                  <div className={styles.pHeader}>
                    {p.affaireRef && <span className={styles.affaireRef}>📁 {p.affaireRef}</span>}
                    {p.dateAudience && (
                      <span className={styles.dateChip}>
                        <Calendar size={11} /> Audience : {fmtDateFR(p.dateAudience)}
                      </span>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                      aria-label="Supprimer"
                    ><Trash2 size={13} /></button>
                  </div>
                  <h3>{p.titre}</h3>
                  <p className={styles.preview}>{p.contenu}</p>
                  <div className={styles.pFooter}>
                    <Mic size={10} />
                    <span>Modifiée {fmtDateFR(p.updatedAt ?? p.createdAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
      </Card>

      {/* Viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)}
        title={viewing?.titre || ''} size="lg"
        footer={
          viewing && (
            <>
              <Button variant="ghost" onClick={() => handleDelete(viewing)}><Trash2 size={14} /> Supprimer</Button>
              <Button onClick={() => openEdit(viewing)}>Modifier</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className={styles.viewer}>
            <div className={styles.vMeta}>
              {viewing.affaireRef && <span>📁 {viewing.affaireRef}</span>}
              {viewing.dateAudience && <span>📅 Audience : {fmtDateFR(viewing.dateAudience)}</span>}
            </div>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>📜 Plaidoirie</div>
              <p className={styles.contenuFull}>{viewing.contenu}</p>
            </div>
            {viewing.arguments && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>⚖ Arguments clés</div>
                <p className={styles.argumentsFull}>{viewing.arguments}</p>
              </div>
            )}
            {viewing.preuves && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>🔍 Pièces et preuves</div>
                <p className={styles.preuvesFull}>{viewing.preuves}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Form */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier la plaidoirie' : 'Nouvelle plaidoirie'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Titre *
            <input type="text" value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus
              placeholder="Ex: Plaidoirie d'ouverture - Affaire X" />
          </label>

          <div className={styles.row}>
            <label>Affaire liée
              <select value={form.affaireId ?? ''}
                onChange={(e) => e.target.value ? selectAffaire(Number(e.target.value)) : setForm({ ...form, affaireId: undefined, affaireRef: undefined })}>
                <option value="">— Aucune —</option>
                {affaires.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ref || `#${a.id}`} - {a.titre}
                  </option>
                ))}
              </select>
            </label>
            <label>Date d&apos;audience
              <input type="date" value={form.dateAudience ?? ''}
                onChange={(e) => setForm({ ...form, dateAudience: e.target.value })} />
            </label>
          </div>

          <label>Plaidoirie (texte complet) *
            <textarea rows={8} value={form.contenu ?? ''}
              onChange={(e) => setForm({ ...form, contenu: e.target.value })}
              placeholder="Mesdames et Messieurs les juges, ..." />
          </label>

          <label>Arguments clés (un par ligne)
            <textarea rows={4} value={form.arguments ?? ''}
              onChange={(e) => setForm({ ...form, arguments: e.target.value })}
              placeholder="• L'accusé n'avait pas conscience...&#10;• Les témoignages indiquent que..." />
          </label>

          <label>Pièces et preuves
            <textarea rows={3} value={form.preuves ?? ''}
              onChange={(e) => setForm({ ...form, preuves: e.target.value })}
              placeholder="Liste des pièces que vous présenterez..." />
          </label>
        </div>
      </Modal>
    </>
  );
}
