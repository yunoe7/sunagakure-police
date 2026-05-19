'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page CLIENTS — Personnes représentées par l'avocat
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/avocat_clients (TABLEAU)
 *
 * Liste des clients du cabinet avec contact, faction et notes.
 * Photo optionnelle, recherche full-text.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, UserSquare, Camera } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { compressImage } from '@/lib/image';
import type { ClientAvocat } from '@/types/avocat';
import type { Affaire } from '@/types/avocat';

import styles from './page.module.css';

const FB_PATH = 'avocat_clients';

export default function ClientsPage() {
  const { data, loading } = useFirebaseValue<ClientAvocat[] | null>(FB_PATH);
  const { data: affairesData } = useFirebaseValue<Affaire[] | null>('avocat_affaires');

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<ClientAvocat>>({});

  const all = useMemo<ClientAvocat[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (c): c is ClientAvocat => c !== null && typeof c === 'object' && !!c.id
    ),
    [data]
  );

  const affaires = useMemo<Affaire[]>(
    () => (Array.isArray(affairesData) ? affairesData : affairesData ? Object.values(affairesData) : []).filter(
      (a): a is Affaire => a !== null && typeof a === 'object' && !!a.id
    ),
    [affairesData]
  );

  // Compteurs d'affaires par client
  const affairesByClient = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of affaires) {
      if (a.clientId) m.set(a.clientId, (m.get(a.clientId) || 0) + 1);
    }
    return m;
  }, [affaires]);

  const visible = useMemo(() => {
    let list = all;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) =>
      ((c.nom || '') + ' ' + (c.prenom || '') + ' ' + (c.contact || '') + ' ' + (c.faction || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  }, [all, search]);

  function openCreate() {
    setEditingId(null);
    setForm({});
    setShowForm(true);
  }
  function openEdit(c: ClientAvocat) { setEditingId(c.id); setForm(c); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith('image/')) { toast.error("Ce n'est pas une image"); return; }
    try {
      const dataUrl = await compressImage(file, 400, 0.75);
      setForm({ ...form, photo: dataUrl });
    } catch { toast.error("Impossible de charger l'image"); }
  }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((c) => c.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as ClientAvocat;
      } else {
        list.push({
          id: now,
          nom: form.nom!.trim(),
          prenom: form.prenom?.trim() || undefined,
          contact: form.contact?.trim() || undefined,
          faction: form.faction?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          photo: form.photo || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Client mis à jour' : 'Client enregistré');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(c: ClientAvocat) {
    const ok = await confirmAction({
      title: 'Supprimer le client',
      message: `Retirer ${c.prenom || ''} ${c.nom} de votre liste de clients ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== c.id)); toast.success('Supprimé'); }
    catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Mes clients"
        subtitle="Personnes que vous représentez en justice"
        actions={<Button onClick={openCreate}><Plus size={14} /> Ajouter un client</Button>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Nom, contact, faction…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.totalChip}>
            {all.length} client{all.length > 1 ? 's' : ''}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <UserSquare size={32} style={{ opacity: 0.3 }} />
              <p>Aucun client. Ajoute le premier !</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {visible.map((c) => {
                const nbAffaires = affairesByClient.get(c.id) || 0;
                return (
                  <article key={c.id} className={styles.client} onClick={() => openEdit(c)}>
                    {c.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photo} alt={c.nom} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        {(c.prenom?.[0] || c.nom?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <div className={styles.clientBody}>
                      <h3>{c.prenom} {c.nom}</h3>
                      {c.faction && <div className={styles.faction}>{c.faction}</div>}
                      {c.contact && <div className={styles.contact}>{c.contact}</div>}
                      {c.notes && <p className={styles.notes}>{c.notes}</p>}
                      {nbAffaires > 0 && (
                        <div className={styles.affairesBadge}>
                          📁 {nbAffaires} affaire{nbAffaires > 1 ? 's' : ''} en cours
                        </div>
                      )}
                    </div>
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
                      aria-label="Supprimer"
                    ><Trash2 size={13} /></button>
                  </article>
                );
              })}
            </div>
          )}
      </Card>

      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier le client' : 'Nouveau client'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Prénom
              <input type="text" value={form.prenom ?? ''}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
            </label>
            <label>Nom *
              <input type="text" value={form.nom ?? ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus />
            </label>
          </div>
          <div className={styles.row}>
            <label>Contact
              <input type="text" value={form.contact ?? ''}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="Discord, tél, adresse…" />
            </label>
            <label>Faction
              <input type="text" value={form.faction ?? ''}
                onChange={(e) => setForm({ ...form, faction: e.target.value })} />
            </label>
          </div>
          <label>Notes
            <textarea rows={3} value={form.notes ?? ''}
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
                <div className={styles.uploadPlaceholder}>📷 Cliquer pour choisir une image</div>
              )}
              <input type="file" accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
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
