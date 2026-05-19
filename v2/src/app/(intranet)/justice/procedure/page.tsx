'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page CODE DE PROCÉDURE — Articles régissant le tribunal
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/procedures (TABLEAU)
 *
 * Articles éditables avec numéro (ex: "Art. 12"), titre, contenu
 * et catégorie. Click → modale viewer en mode lecture.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, BookText } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { type ArticleProcedure, fmtDateFR } from '@/types/justice-plus';

import styles from './page.module.css';

const FB_PATH = 'procedures';
const CURRENT_USER = 'Ninja';

export default function ProcedurePage() {
  const { data, loading } = useFirebaseValue<ArticleProcedure[] | null>(FB_PATH);

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<ArticleProcedure>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);

  const all = useMemo<ArticleProcedure[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (a): a is ArticleProcedure => a !== null && typeof a === 'object' && !!a.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) =>
      ((a.numero || '') + ' ' + (a.titre || '') + ' ' + (a.contenu || '') + ' ' + (a.categorie || ''))
        .toLowerCase().includes(q)
    );
    // Tri : par numéro d'article (extrait le nombre)
    return [...list].sort((a, b) => {
      const numA = parseInt((a.numero || '').replace(/\D/g, ''), 10) || 999999;
      const numB = parseInt((b.numero || '').replace(/\D/g, ''), 10) || 999999;
      return numA - numB;
    });
  }, [all, search]);

  const viewing = viewingId ? all.find((a) => a.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({ auteur: CURRENT_USER });
    setShowForm(true);
  }
  function openEdit(a: ArticleProcedure) {
    setEditingId(a.id); setForm(a); setShowForm(true); setViewingId(null);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.titre?.trim()) { toast.error('Le titre est obligatoire'); return; }
    if (!form.contenu?.trim()) { toast.error('Le contenu est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((a) => a.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = {
          ...list[idx], ...form, id: editingId, updatedAt: now,
        } as ArticleProcedure;
      } else {
        list.push({
          id: now,
          numero: form.numero?.trim() || undefined,
          titre: form.titre!.trim(),
          contenu: form.contenu!.trim(),
          categorie: form.categorie?.trim() || undefined,
          auteur: form.auteur?.trim() || CURRENT_USER,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Article mis à jour' : 'Article ajouté');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(a: ArticleProcedure) {
    const ok = await confirmAction({
      title: "Supprimer l'article",
      message: `Supprimer "${a.titre}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== a.id));
      toast.success('Supprimé');
      if (viewingId === a.id) setViewingId(null);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Code de procédure"
        subtitle="Articles régissant le déroulement des procédures judiciaires"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvel article</Button>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Numéro, titre, contenu, catégorie…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.totalChip}>
            {all.length} article{all.length > 1 ? 's' : ''}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <BookText size={32} style={{ opacity: 0.3 }} />
              <p>Aucun article. Ajoute le premier !</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((a) => (
                <article key={a.id} className={styles.article} onClick={() => setViewingId(a.id)}>
                  <div className={styles.aHeader}>
                    {a.numero && <span className={styles.numero}>{a.numero}</span>}
                    {a.categorie && <span className={styles.cat}>{a.categorie}</span>}
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => { e.stopPropagation(); handleDelete(a); }}
                      aria-label="Supprimer"
                    ><Trash2 size={13} /></button>
                  </div>
                  <h3>{a.titre}</h3>
                  <p className={styles.preview}>{a.contenu}</p>
                </article>
              ))}
            </div>
          )}
      </Card>

      {/* Viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)}
        title={viewing ? (viewing.numero ? `${viewing.numero} — ${viewing.titre}` : viewing.titre) : ''}
        size="lg"
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
              {viewing.categorie && (
                <span className={styles.cat}>{viewing.categorie}</span>
              )}
              {viewing.auteur && <span>✍ {viewing.auteur}</span>}
              <span>📅 {fmtDateFR(viewing.updatedAt ?? viewing.createdAt)}</span>
            </div>
            <div className={styles.contenuFull}>{viewing.contenu}</div>
          </div>
        )}
      </Modal>

      {/* Formulaire */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? "Modifier l'article" : 'Nouvel article'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Numéro
              <input type="text" value={form.numero ?? ''}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                placeholder="Ex: Art. 12" />
            </label>
            <label>Catégorie
              <input type="text" value={form.categorie ?? ''}
                onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                placeholder="Procès, Garde à vue, Recours…" />
            </label>
          </div>

          <label>Titre *
            <input type="text" value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus
              placeholder="Ex: Droit du prévenu à un avocat" />
          </label>

          <label>Contenu de l&apos;article *
            <textarea rows={10} value={form.contenu ?? ''}
              onChange={(e) => setForm({ ...form, contenu: e.target.value })}
              placeholder="Texte intégral de l'article..." />
          </label>
        </div>
      </Modal>
    </>
  );
}
