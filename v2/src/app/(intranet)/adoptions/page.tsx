'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ADOPTIONS — Registre officiel des adoptions
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/adoptions (TABLEAU)
 *
 * Chaque adoption a un numéro officiel auto (AD-2026-XXX) et
 * conserve les noms de l'adoptant, l'adopté, le clan, les témoins,
 * la raison et une photo optionnelle.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Baby, Calendar, Camera } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { compressImage } from '@/lib/image';
import {
  type Adoption, nextAdoptionNumero, fmtDateFR,
} from '@/types/fiscal';

import styles from './page.module.css';

const FB_PATH = 'adoptions';
const CURRENT_USER = 'Ninja';

export default function AdoptionsPage() {
  const { data, loading } = useFirebaseValue<Adoption[] | null>(FB_PATH);

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Adoption>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);

  const all = useMemo<Adoption[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (a): a is Adoption => a !== null && typeof a === 'object' && !!a.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) =>
      ((a.numero || '') + ' ' + (a.adoptant || '') + ' ' + (a.adopte || '') + ' ' + (a.clan || '') + ' ' + (a.raison || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [all, search]);

  const viewing = viewingId ? all.find((a) => a.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({ date: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  }
  function openEdit(a: Adoption) {
    setEditingId(a.id);
    setForm(a);
    setShowForm(true);
    setViewingId(null);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith('image/')) { toast.error("Ce n'est pas une image"); return; }
    try {
      const dataUrl = await compressImage(file, 400, 0.75);
      setForm({ ...form, photo: dataUrl });
    } catch { toast.error("Impossible de charger l'image"); }
  }

  async function handleSave() {
    if (!form.adoptant?.trim() || !form.adopte?.trim()) {
      toast.error("Adoptant et adopté sont obligatoires"); return;
    }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((a) => a.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = {
          ...list[idx],
          ...form,
          id: editingId,
          editedAt: now,
        } as Adoption;
      } else {
        list.push({
          id: now,
          numero: nextAdoptionNumero(list),
          adoptant: form.adoptant!.trim(),
          adopte: form.adopte!.trim(),
          clan: form.clan?.trim() || undefined,
          date: form.date || undefined,
          temoins: form.temoins?.trim() || undefined,
          raison: form.raison?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          photo: form.photo || undefined,
          auteur: CURRENT_USER,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Adoption mise à jour' : 'Adoption enregistrée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(a: Adoption) {
    const ok = await confirmAction({
      title: "Supprimer l'adoption",
      message: `Supprimer définitivement l'adoption ${a.numero || '#' + a.id} (${a.adopte}) ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== a.id));
      toast.success('Supprimée');
      if (viewingId === a.id) setViewingId(null);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Adoptions"
        subtitle="Registre officiel des adoptions"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvelle adoption</Button>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Numéro, adoptant, adopté, clan…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.totalChip}>
            {all.length} adoption{all.length > 1 ? 's' : ''} enregistrée{all.length > 1 ? 's' : ''}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Baby size={32} style={{ opacity: 0.3 }} />
              <p>Aucune adoption enregistrée.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {visible.map((a) => (
                <article key={a.id} className={styles.card} onClick={() => setViewingId(a.id)}>
                  <div className={styles.cardLeft}>
                    {a.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photo} alt={a.adopte} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        <Baby size={28} />
                      </div>
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardHeader}>
                      {a.numero && <span className={styles.numero}>{a.numero}</span>}
                      {a.date && (
                        <span className={styles.dateChip}>
                          <Calendar size={11} /> {fmtDateFR(a.date)}
                        </span>
                      )}
                    </div>
                    <h3>{a.adopte}</h3>
                    <div className={styles.adoptant}>
                      Adopté(e) par <strong>{a.adoptant}</strong>
                    </div>
                    {a.clan && (
                      <div className={styles.clan}>
                        Clan : <strong>{a.clan}</strong>
                      </div>
                    )}
                    {a.raison && <p className={styles.raison}>{a.raison}</p>}
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); handleDelete(a); }}
                    aria-label="Supprimer"
                  ><Trash2 size={13} /></button>
                </article>
              ))}
            </div>
          )}
      </Card>

      {/* Viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)}
        title={viewing ? `Adoption ${viewing.numero || '#' + viewing.id}` : ''}
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
            {viewing.photo && (
              <div className={styles.viewerPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewing.photo} alt={viewing.adopte} />
              </div>
            )}
            <div className={styles.viewerRow}>
              <div>
                <div className={styles.fieldLabel}>Adopté(e)</div>
                <strong>{viewing.adopte}</strong>
              </div>
              <div>
                <div className={styles.fieldLabel}>Adoptant</div>
                <strong>{viewing.adoptant}</strong>
              </div>
              {viewing.clan && (
                <div>
                  <div className={styles.fieldLabel}>Clan</div>
                  <strong>{viewing.clan}</strong>
                </div>
              )}
              {viewing.date && (
                <div>
                  <div className={styles.fieldLabel}>Date</div>
                  <strong>{fmtDateFR(viewing.date)}</strong>
                </div>
              )}
            </div>
            {viewing.temoins && (
              <div className={styles.viewerField}>
                <div className={styles.fieldLabel}>Témoins</div>
                <p>{viewing.temoins}</p>
              </div>
            )}
            {viewing.raison && (
              <div className={styles.viewerField}>
                <div className={styles.fieldLabel}>Raison de l&apos;adoption</div>
                <p>{viewing.raison}</p>
              </div>
            )}
            {viewing.notes && (
              <div className={styles.viewerField}>
                <div className={styles.fieldLabel}>Notes</div>
                <p>{viewing.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Formulaire */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? "Modifier l'adoption" : 'Nouvelle adoption'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Adoptant *
              <input type="text" value={form.adoptant ?? ''}
                onChange={(e) => setForm({ ...form, adoptant: e.target.value })} autoFocus
                placeholder="Nom complet de l'adoptant" />
            </label>
            <label>Adopté(e) *
              <input type="text" value={form.adopte ?? ''}
                onChange={(e) => setForm({ ...form, adopte: e.target.value })}
                placeholder="Nom complet de l'adopté" />
            </label>
          </div>
          <div className={styles.row}>
            <label>Clan
              <input type="text" value={form.clan ?? ''}
                onChange={(e) => setForm({ ...form, clan: e.target.value })}
                placeholder="Ex: Sabaku, Hyuga..." />
            </label>
            <label>Date officielle
              <input type="date" value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
          </div>
          <label>Témoins
            <input type="text" value={form.temoins ?? ''}
              onChange={(e) => setForm({ ...form, temoins: e.target.value })}
              placeholder="Noms des témoins présents" />
          </label>
          <label>Raison de l&apos;adoption
            <textarea rows={3} value={form.raison ?? ''}
              onChange={(e) => setForm({ ...form, raison: e.target.value })}
              placeholder="Circonstances de l'adoption..." />
          </label>
          <label>Notes complémentaires
            <textarea rows={2} value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>

          <label>
            <Camera size={11} style={{ marginRight: 4, display: 'inline' }} />
            Photo (optionnel)
            <div className={styles.uploadZone}>
              {form.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photo} alt="Aperçu" className={styles.uploadPreview} />
              ) : (
                <div className={styles.uploadPlaceholder}>
                  📷 Cliquer pour choisir une image
                </div>
              )}
              <input type="file" accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoUpload(f);
                }}
              />
              {form.photo && (
                <button type="button" className={styles.removePhoto}
                  onClick={(e) => { e.preventDefault(); setForm({ ...form, photo: undefined }); }}>
                  Retirer
                </button>
              )}
            </div>
          </label>
        </div>
      </Modal>
    </>
  );
}
