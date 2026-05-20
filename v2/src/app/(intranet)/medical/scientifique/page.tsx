'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page SALON SCIENTIFIQUE — Rapports d'études et recherches
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/hospital_scientifique (TABLEAU)
 *
 * Rapports scientifiques avec workflow : En cours → Publié → Archivé.
 * Click sur un rapport ouvre une modale viewer avec contenu complet.
 *
 * ⚠️ Accessible uniquement aux Gérants Scientifique
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, FlaskConical, Calendar,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type RapportSci, type SciStatut, type SciType,
  SCI_STATUT_LABEL, SCI_TYPE_LABEL, fmtDateFR,
} from '@/types/scientifique';

import styles from './page.module.css';

const FB_PATH = 'hospital_scientifique';
type Tab = 'all' | SciStatut;

export default function ScientifiquePage() {
  const { can, displayName } = useCurrentUser();
  const canEdit = can.adminBranche('scientifique');
  const CURRENT_USER = displayName;

  const { data, loading } = useFirebaseValue<RapportSci[] | null>(FB_PATH);
  const [tab, setTab] = useState<Tab>('encours');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<RapportSci>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);

  const all = useMemo<RapportSci[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (r): r is RapportSci => r !== null && typeof r === 'object' && !!r.id
    ),
    [data]
  );

  const counts = useMemo(() => {
    const c = { all: all.length, encours: 0, publie: 0, archive: 0 };
    for (const x of all) c[x.statut as keyof typeof c]++;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (tab !== 'all') list = list.filter((r) => r.statut === tab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) =>
      ((r.titre || '') + ' ' + (r.scientifique || '') + ' ' + (r.sujet || '') + ' ' + (r.resultats || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id));
  }, [all, tab, search]);

  const viewing = viewingId ? all.find((r) => r.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({ type: 'etude', statut: 'encours', scientifique: CURRENT_USER });
    setShowForm(true);
  }
  function openEdit(r: RapportSci) {
    if (!canEdit) return;
    setEditingId(r.id); setForm(r); setShowForm(true); setViewingId(null);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.titre?.trim()) { toast.error('Le titre est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((r) => r.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as RapportSci;
      } else {
        list.push({
          id: now,
          titre: form.titre!.trim(),
          scientifique: form.scientifique?.trim() || CURRENT_USER,
          type: form.type || 'etude',
          statut: form.statut || 'encours',
          sujet: form.sujet?.trim() || undefined,
          methodologie: form.methodologie?.trim() || undefined,
          resultats: form.resultats?.trim() || undefined,
          conclusion: form.conclusion?.trim() || undefined,
          date: form.date || undefined,
          datePublication: form.datePublication || undefined,
          collaborateurs: form.collaborateurs?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Rapport mis à jour' : 'Rapport enregistré');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(r: RapportSci) {
    const ok = await confirmAction({
      title: 'Supprimer le rapport',
      message: `Supprimer "${r.titre}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== r.id));
      toast.success('Supprimé');
      if (viewingId === r.id) setViewingId(null);
    } catch { toast.error('Erreur'); }
  }

  async function setStatut(r: RapportSci, statut: SciStatut) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === r.id);
      if (idx === -1) return;
      const update: Partial<RapportSci> = { statut };
      if (statut === 'publie' && !r.datePublication) {
        update.datePublication = new Date().toISOString().slice(0, 10);
      }
      list[idx] = { ...list[idx], ...update };
      await dbSet(FB_PATH, list);
      toast.success(`Rapport → ${SCI_STATUT_LABEL[statut]}`);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Salon scientifique"
        subtitle="Rapports d'études, analyses et recherches"
        actions={
          <RequireBranche branche="scientifique">
            <Button onClick={openCreate}><Plus size={14} /> Nouveau rapport</Button>
          </RequireBranche>
        }
      >
        <div className={styles.tabs}>
          {(['encours', 'publie', 'archive', 'all'] as Tab[]).map((t) => (
            <button key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              <span>{t === 'all' ? 'Tous' : SCI_STATUT_LABEL[t as SciStatut]}</span>
              <span className={styles.tabCount}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Titre, scientifique, sujet…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <FlaskConical size={32} style={{ opacity: 0.3 }} />
              <p>Aucun rapport pour ces critères.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((r) => (
                <article key={r.id} className={`${styles.rapport} ${styles[`st-${r.statut}`]}`}
                  onClick={() => setViewingId(r.id)}
                >
                  <div className={styles.rHeader}>
                    <span className={`${styles.typeChip} ${styles[`type-${r.type}`]}`}>
                      {SCI_TYPE_LABEL[r.type]}
                    </span>
                    <span className={`${styles.statutChip} ${styles[`chip-${r.statut}`]}`}>
                      {SCI_STATUT_LABEL[r.statut]}
                    </span>
                    {r.date && (
                      <span className={styles.dateChip}>
                        <Calendar size={11} /> {fmtDateFR(r.date)}
                      </span>
                    )}
                    {canEdit && (
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
                        aria-label="Supprimer"
                      ><Trash2 size={13} /></button>
                    )}
                  </div>
                  <h3>{r.titre}</h3>
                  <div className={styles.scientifique}>
                    🧪 {r.scientifique || '—'}
                  </div>
                  {r.sujet && <p className={styles.sujet}>{r.sujet}</p>}
                </article>
              ))}
            </div>
          )}
      </Card>

      {/* Viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)}
        title={viewing?.titre || ''} size="lg"
        footer={
          viewing && canEdit && (
            <>
              <Button variant="ghost" onClick={() => handleDelete(viewing)}><Trash2 size={14} /> Supprimer</Button>
              {viewing.statut === 'encours' && (
                <Button variant="outline" onClick={() => setStatut(viewing, 'publie')}>
                  ✅ Publier
                </Button>
              )}
              {viewing.statut === 'publie' && (
                <Button variant="outline" onClick={() => setStatut(viewing, 'archive')}>
                  📦 Archiver
                </Button>
              )}
              <Button onClick={() => openEdit(viewing)}>Modifier</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className={styles.viewer}>
            <div className={styles.vMeta}>
              <span className={`${styles.typeChip} ${styles[`type-${viewing.type}`]}`}>
                {SCI_TYPE_LABEL[viewing.type]}
              </span>
              <span className={`${styles.statutChip} ${styles[`chip-${viewing.statut}`]}`}>
                {SCI_STATUT_LABEL[viewing.statut]}
              </span>
              <span>🧪 {viewing.scientifique}</span>
              {viewing.date && <span>📅 {fmtDateFR(viewing.date)}</span>}
              {viewing.datePublication && <span>📰 Publié {fmtDateFR(viewing.datePublication)}</span>}
            </div>

            {viewing.sujet && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Sujet d&apos;étude</div>
                <p>{viewing.sujet}</p>
              </div>
            )}
            {viewing.methodologie && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Méthodologie</div>
                <p className={styles.bigText}>{viewing.methodologie}</p>
              </div>
            )}
            {viewing.resultats && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Résultats</div>
                <p className={styles.bigText}>{viewing.resultats}</p>
              </div>
            )}
            {viewing.conclusion && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Conclusion</div>
                <p className={styles.conclusion}>{viewing.conclusion}</p>
              </div>
            )}
            {viewing.collaborateurs && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Collaborateurs</div>
                <p>{viewing.collaborateurs}</p>
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

      {/* Formulaire */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier le rapport' : 'Nouveau rapport scientifique'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Titre du rapport *
            <input type="text" value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus
              placeholder="Ex: Étude sur les propriétés du chakra de sable" />
          </label>

          <div className={styles.row3}>
            <label>Type
              <select value={form.type ?? 'etude'}
                onChange={(e) => setForm({ ...form, type: e.target.value as SciType })}>
                {(['etude', 'analyse', 'experimentation', 'recherche', 'autre'] as SciType[]).map((t) => (
                  <option key={t} value={t}>{SCI_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label>Statut
              <select value={form.statut ?? 'encours'}
                onChange={(e) => setForm({ ...form, statut: e.target.value as SciStatut })}>
                {(['encours', 'publie', 'archive'] as SciStatut[]).map((s) => (
                  <option key={s} value={s}>{SCI_STATUT_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>Scientifique
              <input type="text" value={form.scientifique ?? ''}
                onChange={(e) => setForm({ ...form, scientifique: e.target.value })} />
            </label>
          </div>

          <label>Sujet d&apos;étude
            <input type="text" value={form.sujet ?? ''}
              onChange={(e) => setForm({ ...form, sujet: e.target.value })}
              placeholder="Description courte du sujet" />
          </label>

          <label>Méthodologie
            <textarea rows={3} value={form.methodologie ?? ''}
              onChange={(e) => setForm({ ...form, methodologie: e.target.value })}
              placeholder="Comment l'étude est-elle menée ?" />
          </label>

          <label>Résultats
            <textarea rows={4} value={form.resultats ?? ''}
              onChange={(e) => setForm({ ...form, resultats: e.target.value })}
              placeholder="Données, observations, mesures..." />
          </label>

          <label>Conclusion
            <textarea rows={3} value={form.conclusion ?? ''}
              onChange={(e) => setForm({ ...form, conclusion: e.target.value })} />
          </label>

          <div className={styles.row}>
            <label>Date de début
              <input type="date" value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>Date de publication
              <input type="date" value={form.datePublication ?? ''}
                onChange={(e) => setForm({ ...form, datePublication: e.target.value })} />
            </label>
          </div>

          <label>Collaborateurs
            <input type="text" value={form.collaborateurs ?? ''}
              onChange={(e) => setForm({ ...form, collaborateurs: e.target.value })} />
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
