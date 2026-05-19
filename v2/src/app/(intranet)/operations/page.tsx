'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page OPÉRATIONS — Opérations de police actives
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/operations (TABLEAU)
 *
 * 6 types : patrouille, arrestation, enquête, protection, infiltration, autre
 * 4 statuts : Préparation → Active → Terminée / Annulée
 *
 * Permissions (Phase C) :
 * - Voir / chercher / filtrer : tout le monde (connecté)
 * - Créer / modifier / supprimer / changer statut : Gérants Police + Admin
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Siren, Calendar, User as UserIcon,
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
import OpsMap from '@/components/operations/OpsMap';
import {
  type Operation, type OperationStatut, type OperationType,
  OPERATION_STATUT_LABEL, OPERATION_TYPE_LABEL, fmtDateFR,
} from '@/types/police-rh';

import styles from './page.module.css';

const FB_PATH = 'operations';

type Tab = 'all' | OperationStatut;

export default function OperationsPage() {
  const { can } = useCurrentUser();
  const { data, loading } = useFirebaseValue<Operation[] | null>(FB_PATH);

  const [tab, setTab] = useState<Tab>('Active');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Operation>>({});

  // Permission centralisée pour cette page
  const canEdit = can.adminBranche('police');

  const all = useMemo<Operation[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (o): o is Operation => o !== null && typeof o === 'object' && !!o.id
    ),
    [data]
  );

  const counts = useMemo(() => {
    const c = { all: all.length, Active: 0, Préparation: 0, Terminée: 0, Annulée: 0 };
    for (const x of all) c[x.statut as keyof typeof c]++;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (tab !== 'all') list = list.filter((o) => o.statut === tab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((o) =>
      ((o.nom || '') + ' ' + (o.resp || '') + ' ' + (o.desc || '') + ' ' + (o.type || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      const da = typeof a.date === 'number' ? a.date : new Date(a.date || 0).getTime();
      const db_ = typeof b.date === 'number' ? b.date : new Date(b.date || 0).getTime();
      return db_ - da;
    });
  }, [all, tab, search]);

  function openCreate() {
    setEditingId(null);
    setForm({
      type: 'patrouille',
      statut: 'Préparation',
      dateOp: new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  }
  function openEdit(o: Operation) { setEditingId(o.id); setForm(o); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error("Le nom de l'opération est obligatoire"); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((o) => o.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Operation;
      } else {
        list.push({
          id: now,
          nom: form.nom!.trim(),
          type: form.type || 'patrouille',
          statut: form.statut || 'Préparation',
          resp: form.resp?.trim() || undefined,
          dateOp: form.dateOp || undefined,
          desc: form.desc?.trim() || undefined,
          date: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Opération mise à jour' : 'Opération créée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(o: Operation) {
    const ok = await confirmAction({
      title: "Supprimer l'opération",
      message: `Supprimer "${o.nom}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== o.id)); toast.success('Supprimée'); }
    catch { toast.error('Erreur'); }
  }

  async function setStatut(o: Operation, statut: OperationStatut) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === o.id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], statut };
      await dbSet(FB_PATH, list);
      toast.success(`Statut → ${OPERATION_STATUT_LABEL[statut]}`);
    } catch { toast.error('Erreur'); }
  }

  /**
   * Met à jour la position d'une opération sur la carte (mode placement).
   * Appelé par <OpsMap onUpdatePosition>.
   */
  async function handleMapPlace(op: Operation, mapX: number, mapY: number) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === op.id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], mapX, mapY };
      await dbSet(FB_PATH, list);
      toast.success(`📍 "${op.nom}" placée sur la carte`);
    } catch { toast.error('Erreur de placement'); }
  }

  return (
    <>
      {/* Carte tactique interactive */}
      <OpsMap operations={all} onUpdatePosition={canEdit ? handleMapPlace : undefined} />

      <Card
        title="Opérations"
        subtitle="Opérations de police en cours et planifiées"
        actions={
          <RequireBranche branche="police">
            <Button onClick={openCreate}><Plus size={14} /> Nouvelle opération</Button>
          </RequireBranche>
        }
      >
        <div className={styles.tabs}>
          {(['Active', 'Préparation', 'Terminée', 'Annulée', 'all'] as Tab[]).map((t) => (
            <button key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              <span>{t === 'all' ? 'Toutes' : OPERATION_STATUT_LABEL[t as OperationStatut]}</span>
              <span className={styles.tabCount}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Nom, responsable, description…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Siren size={32} style={{ opacity: 0.3 }} />
              <p>Aucune opération pour ces critères.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((o) => (
                <article key={o.id} className={`${styles.op} ${styles[`st-${o.statut}`]}`}>
                  <div className={styles.opHeader}>
                    <span className={`${styles.typeChip} ${styles[`type-${o.type}`]}`}>
                      {OPERATION_TYPE_LABEL[o.type]}
                    </span>
                    <span className={`${styles.statutChip} ${styles[`chip-${o.statut}`]}`}>
                      {OPERATION_STATUT_LABEL[o.statut]}
                    </span>
                    {o.dateOp && (
                      <span className={styles.dateChip}>
                        <Calendar size={11} /> {fmtDateFR(o.dateOp)}
                      </span>
                    )}
                    <RequireBranche branche="police">
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(o)}
                        aria-label="Supprimer"
                      ><Trash2 size={13} /></button>
                    </RequireBranche>
                  </div>

                  <div
                    className={styles.opBody}
                    onClick={() => canEdit && openEdit(o)}
                    style={{ cursor: canEdit ? 'pointer' : 'default' }}
                  >
                    <h3>{o.nom}</h3>
                    {o.resp && (
                      <div className={styles.resp}>
                        <UserIcon size={11} /> Responsable : <strong>{o.resp}</strong>
                      </div>
                    )}
                    {o.desc && <p className={styles.desc}>{o.desc}</p>}
                  </div>

                  {(o.statut === 'Préparation' || o.statut === 'Active') && (
                    <RequireBranche branche="police">
                      <div className={styles.actions}>
                        {o.statut === 'Préparation' && (
                          <Button size="sm" onClick={() => setStatut(o, 'Active')}>
                            🚨 Lancer
                          </Button>
                        )}
                        {o.statut === 'Active' && (
                          <Button size="sm" onClick={() => setStatut(o, 'Terminée')}>
                            ✅ Terminer
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setStatut(o, 'Annulée')}>
                          ❌ Annuler
                        </Button>
                      </div>
                    </RequireBranche>
                  )}
                </article>
              ))}
            </div>
          )}
      </Card>

      <Modal open={showForm} onClose={closeForm}
        title={editingId ? "Modifier l'opération" : 'Nouvelle opération'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Nom de l&apos;opération *
            <input type="text" value={form.nom ?? ''}
              onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus
              placeholder="Ex: Opération Tempête de sable" />
          </label>

          <div className={styles.row3}>
            <label>Type
              <select value={form.type ?? 'patrouille'}
                onChange={(e) => setForm({ ...form, type: e.target.value as OperationType })}>
                {(['patrouille', 'arrestation', 'enquete', 'protection', 'infiltration', 'autre'] as OperationType[]).map((t) => (
                  <option key={t} value={t}>{OPERATION_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label>Statut
              <select value={form.statut ?? 'Préparation'}
                onChange={(e) => setForm({ ...form, statut: e.target.value as OperationStatut })}>
                {(['Préparation', 'Active', 'Terminée', 'Annulée'] as OperationStatut[]).map((s) => (
                  <option key={s} value={s}>{OPERATION_STATUT_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>Date d&apos;opération
              <input type="date" value={form.dateOp ?? ''}
                onChange={(e) => setForm({ ...form, dateOp: e.target.value })} />
            </label>
          </div>

          <label>Responsable
            <input type="text" value={form.resp ?? ''}
              onChange={(e) => setForm({ ...form, resp: e.target.value })}
              placeholder="Nom du responsable" />
          </label>

          <label>Description
            <textarea rows={5} value={form.desc ?? ''}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="Détails de l'opération, objectifs, zone, effectifs..." />
          </label>
        </div>
      </Modal>
    </>
  );
}
