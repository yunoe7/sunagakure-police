'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, FileSignature, Calendar } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Traite, type TraiteType, type TraiteStatut,
  TRAITE_TYPE_LABEL, TRAITE_STATUT_LABEL, fmtDateFR,
} from '@/types/diplo';
import styles from './page.module.css';

const FB_PATH = 'diplo_traites';
type Filter = 'all' | TraiteStatut;

export default function TraitesPage() {
  const { data, loading } = useFirebaseValue<Traite[] | null>(FB_PATH);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Traite>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);

  const all = useMemo<Traite[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (t): t is Traite => t !== null && typeof t === 'object' && !!t.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    if (filter !== 'all') list = list.filter((t) => t.statut === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) =>
      ((t.titre || '') + ' ' + (t.parties || '') + ' ' + (t.contenu || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id));
  }, [all, filter, search]);

  const viewing = viewingId ? all.find((t) => t.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({ type: 'paix', statut: 'brouillon' });
    setShowForm(true);
  }
  function openEdit(t: Traite) { setEditingId(t.id); setForm(t); setShowForm(true); setViewingId(null); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.titre?.trim()) { toast.error('Le titre est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((t) => t.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Traite;
      } else {
        list.push({
          id: now,
          titre: form.titre!.trim(),
          type: form.type || 'paix',
          parties: form.parties?.trim() || undefined,
          date: form.date || undefined,
          dateExpiration: form.dateExpiration || undefined,
          statut: form.statut || 'brouillon',
          contenu: form.contenu?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Traité mis à jour' : 'Traité enregistré');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(t: Traite) {
    const ok = await confirmAction({
      title: 'Supprimer le traité',
      message: `Supprimer "${t.titre}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== t.id)); toast.success('Supprimé'); }
    catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Traités"
        subtitle="Accords diplomatiques signés et brouillons"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouveau traité</Button>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Titre, parties, contenu…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.filters}>
            <button className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`} onClick={() => setFilter('all')}>Tous</button>
            {(['brouillon', 'actif', 'expire', 'rompu'] as TraiteStatut[]).map((s) => (
              <button key={s} className={`${styles.fbtn} ${filter === s ? styles.fbtnOn : ''}`} onClick={() => setFilter(s)}>
                {TRAITE_STATUT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <FileSignature size={32} style={{ opacity: 0.3 }} />
              <p>Aucun traité.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((t) => (
                <article key={t.id}
                  className={`${styles.traite} ${styles[`st-${t.statut}`]}`}
                  onClick={() => setViewingId(t.id)}
                >
                  <div className={styles.tHeader}>
                    <span className={`${styles.typeChip} ${styles[`type-${t.type}`]}`}>
                      {TRAITE_TYPE_LABEL[t.type as TraiteType]}
                    </span>
                    <span className={`${styles.statutChip} ${styles[`chip-${t.statut}`]}`}>
                      {TRAITE_STATUT_LABEL[t.statut]}
                    </span>
                    {t.date && (
                      <span className={styles.dateChip}>
                        <Calendar size={11} /> {fmtDateFR(t.date)}
                      </span>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => { e.stopPropagation(); handleDelete(t); }}
                      aria-label="Supprimer"
                    ><Trash2 size={13} /></button>
                  </div>
                  <h3>{t.titre}</h3>
                  {t.parties && <div className={styles.parties}>📜 Parties : {t.parties}</div>}
                  {t.contenu && <p className={styles.excerpt}>{t.contenu}</p>}
                  {t.dateExpiration && (
                    <div className={styles.expire}>
                      Expire le {fmtDateFR(t.dateExpiration)}
                    </div>
                  )}
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
              <Button variant="ghost" onClick={() => handleDelete(viewing)}>
                <Trash2 size={14} /> Supprimer
              </Button>
              <Button onClick={() => openEdit(viewing)}>Modifier</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className={styles.viewer}>
            <div className={styles.vMeta}>
              <span className={`${styles.typeChip} ${styles[`type-${viewing.type}`]}`}>
                {TRAITE_TYPE_LABEL[viewing.type as TraiteType]}
              </span>
              <span className={`${styles.statutChip} ${styles[`chip-${viewing.statut}`]}`}>
                {TRAITE_STATUT_LABEL[viewing.statut]}
              </span>
              {viewing.date && <span>📅 Signé le {fmtDateFR(viewing.date)}</span>}
              {viewing.dateExpiration && <span>⏳ Expire le {fmtDateFR(viewing.dateExpiration)}</span>}
            </div>
            {viewing.parties && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Parties signataires</div>
                <div>{viewing.parties}</div>
              </div>
            )}
            {viewing.contenu && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Contenu du traité</div>
                <p className={styles.contenuFull}>{viewing.contenu}</p>
              </div>
            )}
            {viewing.notes && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Notes</div>
                <p>{viewing.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Form */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier le traité' : 'Nouveau traité'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Titre du traité *
            <input type="text" value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus
              placeholder="Ex: Pacte de non-agression Suna-Konoha" />
          </label>
          <div className={styles.row}>
            <label>Type
              <select value={form.type ?? 'paix'}
                onChange={(e) => setForm({ ...form, type: e.target.value as TraiteType })}>
                {(['paix', 'commerce', 'alliance', 'non_agression', 'autre'] as TraiteType[]).map((t) => (
                  <option key={t} value={t}>{TRAITE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label>Statut
              <select value={form.statut ?? 'brouillon'}
                onChange={(e) => setForm({ ...form, statut: e.target.value as TraiteStatut })}>
                {(['brouillon', 'actif', 'expire', 'rompu'] as TraiteStatut[]).map((s) => (
                  <option key={s} value={s}>{TRAITE_STATUT_LABEL[s]}</option>
                ))}
              </select>
            </label>
          </div>
          <label>Parties signataires
            <input type="text" value={form.parties ?? ''}
              onChange={(e) => setForm({ ...form, parties: e.target.value })}
              placeholder="Ex: Sunagakure, Konohagakure" />
          </label>
          <div className={styles.row}>
            <label>Date de signature
              <input type="date" value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>Date d&apos;expiration
              <input type="date" value={form.dateExpiration ?? ''}
                onChange={(e) => setForm({ ...form, dateExpiration: e.target.value })} />
            </label>
          </div>
          <label>Contenu du traité
            <textarea rows={6} value={form.contenu ?? ''}
              onChange={(e) => setForm({ ...form, contenu: e.target.value })}
              placeholder="Article I — Les parties signataires conviennent..." />
          </label>
          <label>Notes
            <textarea rows={2} value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
      </Modal>
    </>
  );
}
