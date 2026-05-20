'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Ticket, Calendar, Infinity as InfinityIcon } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { RequireMembreBranche } from '@/components/Require';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type LaissezPasse, type LpStatut,
  LP_STATUT_LABEL, fmtDateFR, nextLpNumero,
} from '@/types/diplo';
import styles from './page.module.css';

const FB_PATH = 'laissezPasse';
type Filter = 'all' | LpStatut;

export default function LaissezPassePage() {
  const { displayName: CURRENT_USER, can } = useCurrentUser();
  const canEdit = can.membreBranche('diplomate');
  const { data, loading } = useFirebaseValue<LaissezPasse[] | null>(FB_PATH);
  const [filter, setFilter] = useState<Filter>('valide');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<LaissezPasse>>({});

  const all = useMemo<LaissezPasse[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (l): l is LaissezPasse => l !== null && typeof l === 'object' && !!l.id
    ),
    [data]
  );

  const counts = useMemo(() => {
    const c = { all: all.length, valide: 0, expire: 0, revoque: 0, utilise: 0 };
    for (const x of all) c[x.statut as keyof typeof c]++;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (filter !== 'all') list = list.filter((l) => l.statut === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((l) =>
      ((l.numero || '') + ' ' + (l.porteur || '') + ' ' + (l.villages || '') + ' ' + (l.motif || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id));
  }, [all, filter, search]);

  function openCreate() {
    setEditingId(null);
    setForm({
      statut: 'valide',
      emetteur: CURRENT_USER,
      dateEmission: new Date().toISOString().slice(0, 10),
      permanent: false,
    });
    setShowForm(true);
  }
  function openEdit(l: LaissezPasse) { setEditingId(l.id); setForm(l); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.porteur?.trim()) { toast.error('Le nom du porteur est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((l) => l.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as LaissezPasse;
      } else {
        list.push({
          id: now,
          numero: form.numero || nextLpNumero(list),
          porteur: form.porteur!.trim(),
          dateEmission: form.dateEmission || undefined,
          dateExpiration: form.permanent ? undefined : (form.dateExpiration || undefined),
          permanent: !!form.permanent,
          villages: form.villages?.trim() || undefined,
          motif: form.motif?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          statut: form.statut || 'valide',
          emetteur: form.emetteur?.trim() || CURRENT_USER,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Laissez-passer mis à jour' : 'Laissez-passer délivré');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(l: LaissezPasse) {
    const ok = await confirmAction({
      title: 'Supprimer le laissez-passer',
      message: `Supprimer le laissez-passer ${l.numero || '#' + l.id} (${l.porteur}) ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== l.id)); toast.success('Supprimé'); }
    catch { toast.error('Erreur'); }
  }

  async function revoke(l: LaissezPasse) {
    const ok = await confirmAction({
      title: 'Révoquer ce laissez-passer ?',
      message: `Le laissez-passer ${l.numero} ne sera plus valide.`,
      confirmLabel: 'Révoquer', variant: 'danger',
    });
    if (!ok) return;
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === l.id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], statut: 'revoque' };
      await dbSet(FB_PATH, list);
      toast.success('Révoqué');
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Laissez-passer"
        subtitle="Autorisations de circulation inter-villages"
        actions={
          <RequireMembreBranche branche="diplomate">
            <Button onClick={openCreate}><Plus size={14} /> Délivrer un laissez-passer</Button>
          </RequireMembreBranche>
        }
      >
        <div className={styles.tabs}>
          {(['valide', 'expire', 'utilise', 'revoque', 'all'] as Filter[]).map((t) => (
            <button key={t}
              className={`${styles.tab} ${filter === t ? styles.tabActive : ''}`}
              onClick={() => setFilter(t)}
            >
              <span>{t === 'all' ? 'Tous' : LP_STATUT_LABEL[t as LpStatut]}</span>
              <span className={styles.tabCount}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Numéro, porteur, villages, motif…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Ticket size={32} style={{ opacity: 0.3 }} />
              <p>Aucun laissez-passer pour ces critères.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((l) => (
                <article key={l.id} className={`${styles.lp} ${styles[`st-${l.statut}`]}`}>
                  <div className={styles.lpHeader}>
                    {l.numero && <span className={styles.numero}>{l.numero}</span>}
                    <span className={`${styles.statutChip} ${styles[`chip-${l.statut}`]}`}>
                      {LP_STATUT_LABEL[l.statut]}
                    </span>
                    {l.permanent && (
                      <span className={styles.permanentChip}>
                        <InfinityIcon size={11} /> Permanent
                      </span>
                    )}
                    <RequireMembreBranche branche="diplomate">
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(l)}
                        aria-label="Supprimer"
                      ><Trash2 size={13} /></button>
                    </RequireMembreBranche>
                  </div>

                  <div
                    className={styles.lpBody}
                    onClick={() => canEdit && openEdit(l)}
                    style={{ cursor: canEdit ? 'pointer' : 'default' }}
                  >
                    <h3>{l.porteur}</h3>
                    {l.villages && <div className={styles.villages}>🌍 {l.villages}</div>}
                    {l.motif && <p className={styles.motif}>{l.motif}</p>}
                    <div className={styles.lpMeta}>
                      {l.dateEmission && (
                        <span>
                          <Calendar size={11} /> Émis : {fmtDateFR(l.dateEmission)}
                        </span>
                      )}
                      {!l.permanent && l.dateExpiration && (
                        <span>
                          ⏳ Expire : {fmtDateFR(l.dateExpiration)}
                        </span>
                      )}
                      {l.emetteur && <span>✍ {l.emetteur}</span>}
                    </div>
                  </div>

                  {l.statut === 'valide' && (
                    <RequireMembreBranche branche="diplomate">
                      <div className={styles.actions}>
                        <Button size="sm" variant="outline" onClick={() => revoke(l)}>
                          Révoquer
                        </Button>
                      </div>
                    </RequireMembreBranche>
                  )}
                </article>
              ))}
            </div>
          )}
      </Card>

      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier le laissez-passer' : 'Nouveau laissez-passer'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Délivrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Porteur (nom complet) *
              <input type="text" value={form.porteur ?? ''}
                onChange={(e) => setForm({ ...form, porteur: e.target.value })} autoFocus />
            </label>
            <label>Émetteur
              <input type="text" value={form.emetteur ?? ''}
                onChange={(e) => setForm({ ...form, emetteur: e.target.value })} />
            </label>
          </div>
          <label>Villages autorisés
            <input type="text" value={form.villages ?? ''}
              onChange={(e) => setForm({ ...form, villages: e.target.value })}
              placeholder="Ex: Konoha, Kiri, Iwa" />
          </label>
          <label>Motif du déplacement
            <input type="text" value={form.motif ?? ''}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              placeholder="Ex: Mission diplomatique, négociation..." />
          </label>
          <div className={styles.row}>
            <label>Date d&apos;émission
              <input type="date" value={form.dateEmission ?? ''}
                onChange={(e) => setForm({ ...form, dateEmission: e.target.value })} />
            </label>
            <label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!form.permanent}
                  onChange={(e) => setForm({ ...form, permanent: e.target.checked })}
                  style={{ width: 14, height: 14 }} />
                Laissez-passer permanent
              </span>
            </label>
          </div>
          {!form.permanent && (
            <label>Date d&apos;expiration
              <input type="date" value={form.dateExpiration ?? ''}
                onChange={(e) => setForm({ ...form, dateExpiration: e.target.value })} />
            </label>
          )}
          <label>Statut
            <select value={form.statut ?? 'valide'}
              onChange={(e) => setForm({ ...form, statut: e.target.value as LpStatut })}>
              {(['valide', 'expire', 'utilise', 'revoque'] as LpStatut[]).map((s) => (
                <option key={s} value={s}>{LP_STATUT_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label>Notes
            <textarea rows={3} value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
      </Modal>
    </>
  );
}
