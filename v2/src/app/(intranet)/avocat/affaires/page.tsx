'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page AFFAIRES — Dossiers traités par l'avocat
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/avocat_affaires (TABLEAU)
 *
 * Référence un client via clientId (depuis sunagakure/avocat_clients).
 * Workflow : Préparation → En cours → Jugement attendu → Gagnée/Perdue/Classée
 * Numéro auto : AFF-AVO-2026-XXX
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Folder, Calendar, Coins, Scale,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Affaire, type AffaireType, type AffaireStatut,
  AFFAIRE_TYPE_LABEL, AFFAIRE_STATUT_LABEL,
  fmtDateFR, fmtMoney, nextAffaireRef,
} from '@/types/avocat';
import type { ClientAvocat } from '@/types/avocat';

import styles from './page.module.css';

const FB_PATH = 'avocat_affaires';

type Tab = 'actives' | 'closes' | 'all';

export default function AffairesPage() {
  const { data, loading } = useFirebaseValue<Affaire[] | null>(FB_PATH);
  const { data: clientsData } = useFirebaseValue<ClientAvocat[] | null>('avocat_clients');

  const [tab, setTab] = useState<Tab>('actives');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Affaire>>({});

  const all = useMemo<Affaire[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (a): a is Affaire => a !== null && typeof a === 'object' && !!a.id
    ),
    [data]
  );

  const clients = useMemo<ClientAvocat[]>(
    () => (Array.isArray(clientsData) ? clientsData : clientsData ? Object.values(clientsData) : []).filter(
      (c): c is ClientAvocat => c !== null && typeof c === 'object' && !!c.id
    ),
    [clientsData]
  );

  const counts = useMemo(() => {
    const actives = all.filter((a) =>
      ['preparation', 'en_cours', 'jugement_attendu'].includes(a.statut)
    ).length;
    const closes = all.filter((a) =>
      ['gagnee', 'perdue', 'classee'].includes(a.statut)
    ).length;
    return { actives, closes, total: all.length };
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (tab === 'actives') {
      list = list.filter((a) => ['preparation', 'en_cours', 'jugement_attendu'].includes(a.statut));
    } else if (tab === 'closes') {
      list = list.filter((a) => ['gagnee', 'perdue', 'classee'].includes(a.statut));
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) =>
      ((a.titre || '') + ' ' + (a.ref || '') + ' ' + (a.clientNom || '') + ' ' + (a.description || '') + ' ' + (a.partieAdverse || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id));
  }, [all, tab, search]);

  function openCreate() {
    setEditingId(null);
    setForm({
      type: 'penal',
      statut: 'preparation',
      dateOuverture: new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  }
  function openEdit(a: Affaire) { setEditingId(a.id); setForm(a); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  function selectClient(id: number) {
    const c = clients.find((x) => x.id === id);
    if (c) {
      setForm({
        ...form,
        clientId: id,
        clientNom: `${c.prenom || ''} ${c.nom}`.trim(),
      });
    }
  }

  async function handleSave() {
    if (!form.titre?.trim()) { toast.error('Le titre est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((a) => a.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Affaire;
      } else {
        list.push({
          id: now,
          ref: nextAffaireRef(list),
          titre: form.titre!.trim(),
          clientId: form.clientId,
          clientNom: form.clientNom,
          type: form.type || 'penal',
          statut: form.statut || 'preparation',
          description: form.description?.trim() || undefined,
          partieAdverse: form.partieAdverse?.trim() || undefined,
          dateOuverture: form.dateOuverture || undefined,
          dateAudience: form.dateAudience || undefined,
          honoraires: form.honoraires ? Number(form.honoraires) : undefined,
          notes: form.notes?.trim() || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Affaire mise à jour' : 'Affaire enregistrée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(a: Affaire) {
    const ok = await confirmAction({
      title: "Supprimer l'affaire",
      message: `Supprimer l'affaire "${a.titre}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== a.id)); toast.success('Supprimée'); }
    catch { toast.error('Erreur'); }
  }

  async function setStatut(a: Affaire, statut: AffaireStatut) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === a.id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], statut };
      await dbSet(FB_PATH, list);
      toast.success(`Affaire → ${AFFAIRE_STATUT_LABEL[statut]}`);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Affaires en cours"
        subtitle="Dossiers que vous traitez actuellement"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvelle affaire</Button>}
      >
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'actives' ? styles.tabActive : ''}`} onClick={() => setTab('actives')}>
            <span>Actives</span>
            <span className={styles.tabCount}>{counts.actives}</span>
          </button>
          <button className={`${styles.tab} ${tab === 'closes' ? styles.tabActive : ''}`} onClick={() => setTab('closes')}>
            <span>Closes</span>
            <span className={styles.tabCount}>{counts.closes}</span>
          </button>
          <button className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`} onClick={() => setTab('all')}>
            <span>Toutes</span>
            <span className={styles.tabCount}>{counts.total}</span>
          </button>
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Titre, client, référence…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Folder size={32} style={{ opacity: 0.3 }} />
              <p>Aucune affaire pour ces critères.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((a) => (
                <article key={a.id} className={`${styles.affaire} ${styles[`st-${a.statut}`]}`}>
                  <div className={styles.aHeader}>
                    {a.ref && <span className={styles.ref}>{a.ref}</span>}
                    <span className={`${styles.typeChip} ${styles[`type-${a.type}`]}`}>
                      {AFFAIRE_TYPE_LABEL[a.type]}
                    </span>
                    <span className={`${styles.statutChip} ${styles[`chip-${a.statut}`]}`}>
                      {AFFAIRE_STATUT_LABEL[a.statut]}
                    </span>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(a)}
                      aria-label="Supprimer"
                    ><Trash2 size={13} /></button>
                  </div>

                  <div className={styles.aBody} onClick={() => openEdit(a)}>
                    <h3>{a.titre}</h3>
                    {a.clientNom && (
                      <div className={styles.client}>
                        👤 Client : <strong>{a.clientNom}</strong>
                      </div>
                    )}
                    {a.partieAdverse && (
                      <div className={styles.adverse}>
                        ⚖ Partie adverse : <strong>{a.partieAdverse}</strong>
                      </div>
                    )}
                    {a.description && <p className={styles.desc}>{a.description}</p>}
                    <div className={styles.aMeta}>
                      {a.dateOuverture && (
                        <span><Calendar size={11} /> Ouverture : {fmtDateFR(a.dateOuverture)}</span>
                      )}
                      {a.dateAudience && (
                        <span><Scale size={11} /> Audience : {fmtDateFR(a.dateAudience)}</span>
                      )}
                      {a.honoraires && a.honoraires > 0 && (
                        <span><Coins size={11} /> {fmtMoney(a.honoraires)} ₽</span>
                      )}
                    </div>
                  </div>

                  {['preparation', 'en_cours', 'jugement_attendu'].includes(a.statut) && (
                    <div className={styles.actions}>
                      {a.statut === 'preparation' && (
                        <Button size="sm" onClick={() => setStatut(a, 'en_cours')}>
                          Démarrer
                        </Button>
                      )}
                      {a.statut === 'en_cours' && (
                        <Button size="sm" onClick={() => setStatut(a, 'jugement_attendu')}>
                          Attendre jugement
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setStatut(a, 'gagnee')}>
                        ✓ Gagnée
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatut(a, 'perdue')}>
                        ✗ Perdue
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
      </Card>

      <Modal open={showForm} onClose={closeForm}
        title={editingId ? "Modifier l'affaire" : 'Nouvelle affaire'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Titre de l&apos;affaire *
            <input type="text" value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus
              placeholder="Ex: Affaire des trafics au marché" />
          </label>

          <div className={styles.row}>
            <label>Type
              <select value={form.type ?? 'penal'}
                onChange={(e) => setForm({ ...form, type: e.target.value as AffaireType })}>
                {(['penal', 'civil', 'famille', 'commercial', 'autre'] as AffaireType[]).map((t) => (
                  <option key={t} value={t}>{AFFAIRE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label>Statut
              <select value={form.statut ?? 'preparation'}
                onChange={(e) => setForm({ ...form, statut: e.target.value as AffaireStatut })}>
                {(['preparation', 'en_cours', 'jugement_attendu', 'gagnee', 'perdue', 'classee'] as AffaireStatut[]).map((s) => (
                  <option key={s} value={s}>{AFFAIRE_STATUT_LABEL[s]}</option>
                ))}
              </select>
            </label>
          </div>

          <label>Client (depuis vos clients enregistrés)
            <select value={form.clientId ?? ''}
              onChange={(e) => e.target.value ? selectClient(Number(e.target.value)) : setForm({ ...form, clientId: undefined, clientNom: undefined })}>
              <option value="">— Aucun (à saisir manuellement) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
              ))}
            </select>
          </label>

          {!form.clientId && (
            <label>Nom du client (saisie libre)
              <input type="text" value={form.clientNom ?? ''}
                onChange={(e) => setForm({ ...form, clientNom: e.target.value })} />
            </label>
          )}

          <label>Partie adverse
            <input type="text" value={form.partieAdverse ?? ''}
              onChange={(e) => setForm({ ...form, partieAdverse: e.target.value })}
              placeholder="Nom de la partie adverse ou de son avocat" />
          </label>

          <label>Description / Contexte
            <textarea rows={3} value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description du dossier..." />
          </label>

          <div className={styles.row3}>
            <label>Date d&apos;ouverture
              <input type="date" value={form.dateOuverture ?? ''}
                onChange={(e) => setForm({ ...form, dateOuverture: e.target.value })} />
            </label>
            <label>Date d&apos;audience
              <input type="date" value={form.dateAudience ?? ''}
                onChange={(e) => setForm({ ...form, dateAudience: e.target.value })} />
            </label>
            <label>Honoraires (₽)
              <input type="number" min="0" value={form.honoraires ?? ''}
                onChange={(e) => setForm({ ...form, honoraires: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
          </div>

          <label>Notes
            <textarea rows={3} value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
      </Modal>
    </>
  );
}
