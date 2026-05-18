'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, MessageSquare, AlertTriangle } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Communication, type CommType,
  COMM_TYPE_LABEL, fmtDateFR,
} from '@/types/diplo';
import styles from './page.module.css';

const FB_PATH = 'diplo_communications';
const CURRENT_USER = 'Ninja';

type Filter = 'all' | CommType | 'urgent';

export default function CommunicationsPage() {
  const { data, loading } = useFirebaseValue<Communication[] | null>(FB_PATH);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Communication>>({});

  const all = useMemo<Communication[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (c): c is Communication => c !== null && typeof c === 'object' && !!c.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    if (filter === 'urgent') list = list.filter((c) => c.urgent || c.type === 'urgence');
    else if (filter !== 'all') list = list.filter((c) => c.type === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) =>
      ((c.expediteur || '') + ' ' + (c.destinataire || '') + ' ' + (c.sujet || '') + ' ' + (c.message || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      // Urgences en premier, puis par date
      const ua = (a.urgent || a.type === 'urgence') ? 1 : 0;
      const ub = (b.urgent || b.type === 'urgence') ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return (b.createdAt ?? b.id) - (a.createdAt ?? a.id);
    });
  }, [all, filter, search]);

  const viewing = viewingId ? all.find((c) => c.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({
      type: 'message',
      expediteur: CURRENT_USER,
      date: new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  }
  function openEdit(c: Communication) {
    setEditingId(c.id); setForm(c); setShowForm(true); setViewingId(null);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.expediteur?.trim() || !form.destinataire?.trim()) {
      toast.error('Expéditeur et destinataire sont obligatoires'); return;
    }
    if (!form.sujet?.trim() || !form.message?.trim()) {
      toast.error('Sujet et message sont obligatoires'); return;
    }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((c) => c.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Communication;
      } else {
        list.push({
          id: now,
          expediteur: form.expediteur!.trim(),
          destinataire: form.destinataire!.trim(),
          sujet: form.sujet!.trim(),
          message: form.message!.trim(),
          type: form.type || 'message',
          urgent: !!form.urgent,
          date: form.date || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Mis à jour' : 'Communication envoyée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(c: Communication) {
    const ok = await confirmAction({
      title: 'Supprimer la communication',
      message: `Supprimer "${c.sujet}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== c.id));
      toast.success('Supprimée');
      if (viewingId === c.id) setViewingId(null);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Communications"
        subtitle="Messages et rapports diplomatiques"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvelle communication</Button>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Expéditeur, destinataire, sujet…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.filters}>
            <button className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`} onClick={() => setFilter('all')}>Toutes</button>
            <button
              className={`${styles.fbtn} ${styles.fbtnUrgent} ${filter === 'urgent' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('urgent')}
            >
              <AlertTriangle size={11} /> Urgences
            </button>
            {(['message', 'rapport', 'note'] as CommType[]).map((t) => (
              <button key={t} className={`${styles.fbtn} ${filter === t ? styles.fbtnOn : ''}`} onClick={() => setFilter(t)}>
                {COMM_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <MessageSquare size={32} style={{ opacity: 0.3 }} />
              <p>Aucune communication.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((c) => {
                const isUrgent = c.urgent || c.type === 'urgence';
                return (
                  <article key={c.id}
                    className={`${styles.comm} ${isUrgent ? styles.urgent : ''}`}
                    onClick={() => setViewingId(c.id)}
                  >
                    <div className={styles.cHeader}>
                      <span className={`${styles.typeChip} ${styles[`type-${c.type}`]}`}>
                        {isUrgent && <AlertTriangle size={11} />}
                        {COMM_TYPE_LABEL[c.type]}
                      </span>
                      {c.date && <span className={styles.dateChip}>{fmtDateFR(c.date)}</span>}
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
                        aria-label="Supprimer"
                      ><Trash2 size={13} /></button>
                    </div>

                    <h3>{c.sujet}</h3>
                    <div className={styles.parties}>
                      <span><strong>{c.expediteur}</strong></span>
                      <span className={styles.arrow}>→</span>
                      <span><strong>{c.destinataire}</strong></span>
                    </div>
                    <p className={styles.preview}>{c.message}</p>
                  </article>
                );
              })}
            </div>
          )}
      </Card>

      {/* Viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)}
        title={viewing?.sujet || ''} size="lg"
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
              <span className={`${styles.typeChip} ${styles[`type-${viewing.type}`]}`}>
                {(viewing.urgent || viewing.type === 'urgence') && <AlertTriangle size={11} />}
                {COMM_TYPE_LABEL[viewing.type]}
              </span>
              {viewing.date && <span>📅 {fmtDateFR(viewing.date)}</span>}
            </div>
            <div className={styles.partiesViewer}>
              <div>
                <div className={styles.fieldLabel}>Expéditeur</div>
                <strong>{viewing.expediteur}</strong>
              </div>
              <div className={styles.arrow}>→</div>
              <div>
                <div className={styles.fieldLabel}>Destinataire</div>
                <strong>{viewing.destinataire}</strong>
              </div>
            </div>
            <div>
              <div className={styles.fieldLabel}>Message</div>
              <p className={styles.messageFull}>{viewing.message}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Form */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier la communication' : 'Nouvelle communication'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Envoyer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Expéditeur *
              <input type="text" value={form.expediteur ?? ''}
                onChange={(e) => setForm({ ...form, expediteur: e.target.value })} autoFocus />
            </label>
            <label>Destinataire *
              <input type="text" value={form.destinataire ?? ''}
                onChange={(e) => setForm({ ...form, destinataire: e.target.value })} />
            </label>
          </div>
          <label>Sujet *
            <input type="text" value={form.sujet ?? ''}
              onChange={(e) => setForm({ ...form, sujet: e.target.value })} />
          </label>
          <div className={styles.row}>
            <label>Type
              <select value={form.type ?? 'message'}
                onChange={(e) => setForm({ ...form, type: e.target.value as CommType })}>
                {(['message', 'rapport', 'note', 'urgence'] as CommType[]).map((t) => (
                  <option key={t} value={t}>{COMM_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label>
              Date d&apos;envoi
              <input type="date" value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
          </div>
          <label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!form.urgent}
                onChange={(e) => setForm({ ...form, urgent: e.target.checked })}
                style={{ width: 14, height: 14 }} />
              Marquer comme urgent
            </span>
          </label>
          <label>Message *
            <textarea rows={6} value={form.message ?? ''}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Rédigez votre message..." />
          </label>
        </div>
      </Modal>
    </>
  );
}
