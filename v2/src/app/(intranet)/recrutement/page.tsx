'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page RECRUTEMENT — Candidatures pour rejoindre la Police
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/candidatures (TABLEAU)
 *
 * Workflow : En attente → Acceptée / Refusée
 * Permet de gérer les candidatures avec motif, expérience et casier.
 *
 * 🔍 AUDIT LOG (Phase 2) :
 *   - create sur police:candidature       (nouvelle candidature)
 *   - update sur police:candidature       (modif fiche)
 *   - update sur police:candidature:statut (décision : accepté/refusé)
 *   - delete sur police:candidature       (suppression)
 *   Le changement de statut a son propre target dédié car c'est
 *   la décision métier la plus significative de cette page.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Award, CheckCircle2, XCircle,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Candidature, type CandidatureStatut,
  CANDIDATURE_STATUT_LABEL, fmtDateFR,
} from '@/types/police-rh';

import styles from './page.module.css';

const FB_PATH = 'candidatures';

type Tab = 'all' | CandidatureStatut;

export default function RecrutementPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const CURRENT_USER_ID = u.id;

  const { data, loading } = useFirebaseValue<Candidature[] | null>(FB_PATH);

  const [tab, setTab] = useState<Tab>('en_attente');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Candidature>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);

  const all = useMemo<Candidature[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (c): c is Candidature => c !== null && typeof c === 'object' && !!c.id
    ),
    [data]
  );

  const counts = useMemo(() => {
    const c = { all: all.length, en_attente: 0, acceptee: 0, refusee: 0 };
    for (const x of all) c[x.statut as keyof typeof c]++;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (tab !== 'all') list = list.filter((c) => c.statut === tab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) =>
      ((c.nom || '') + ' ' + (c.discord || '') + ' ' + (c.motif || '') + ' ' + (c.section || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      const da = typeof a.date === 'number' ? a.date : new Date(a.date || 0).getTime();
      const db_ = typeof b.date === 'number' ? b.date : new Date(b.date || 0).getTime();
      return db_ - da;
    });
  }, [all, tab, search]);

  const viewing = viewingId ? all.find((c) => c.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({ statut: 'en_attente', section: 'Police' });
    setShowForm(true);
  }
  function openEdit(c: Candidature) {
    setEditingId(c.id); setForm(c); setShowForm(true); setViewingId(null);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      let savedC: Candidature;
      let oldC: Candidature | undefined;

      if (editingId) {
        const idx = list.findIndex((c) => c.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        oldC = list[idx];
        list[idx] = { ...list[idx], ...form, id: editingId } as Candidature;
        savedC = list[idx];
      } else {
        savedC = {
          id: now,
          nom: form.nom!.trim(),
          age: form.age || undefined,
          discord: form.discord?.trim() || undefined,
          motif: form.motif?.trim() || undefined,
          exp: form.exp?.trim() || undefined,
          section: form.section?.trim() || 'Police',
          genre: form.genre?.trim() || undefined,
          gradeShinobi: form.gradeShinobi?.trim() || undefined,
          sectionActuelle: form.sectionActuelle?.trim() || undefined,
          casier: form.casier?.trim() || undefined,
          statut: form.statut || 'en_attente',
          date: now,
        };
        list.push(savedC);
      }
      await dbSet(FB_PATH, list);

      // 🔍 Audit log
      if (editingId && oldC) {
        // Si le statut a changé via le formulaire, on logge DEUX events :
        // l'update général + un event statut dédié (cf. setStatut)
        const statutChanged = oldC.statut !== savedC.statut;
        const changes: string[] = [];
        if (statutChanged) changes.push(`statut ${oldC.statut} → ${savedC.statut}`);
        if ((oldC.section || '') !== (savedC.section || '')) changes.push(`section ${oldC.section || '?'} → ${savedC.section || '?'}`);
        if ((oldC.motif || '') !== (savedC.motif || '')) changes.push('motif');
        if ((oldC.exp || '') !== (savedC.exp || '')) changes.push('expérience');
        if ((oldC.casier || '') !== (savedC.casier || '')) changes.push('casier');
        const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : ' (aucun changement détecté)';

        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'update',
          target: 'police:candidature',
          targetId: String(savedC.id),
          detail: `Recrutement — Modification candidature de ${savedC.nom}${changeSummary}`,
        });

        if (statutChanged) {
          logAction({
            who: CURRENT_USER,
            whoId: CURRENT_USER_ID,
            action: 'update',
            target: 'police:candidature:statut',
            targetId: String(savedC.id),
            detail: `Recrutement — Décision sur candidature de ${savedC.nom} : ` +
              `${CANDIDATURE_STATUT_LABEL[oldC.statut]} → ${CANDIDATURE_STATUT_LABEL[savedC.statut]}`,
          });
        }
      } else {
        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'create',
          target: 'police:candidature',
          targetId: String(savedC.id),
          detail: `Recrutement — Nouvelle candidature de ${savedC.nom}` +
            (savedC.section ? ` (section visée : ${savedC.section})` : '') +
            (savedC.gradeShinobi ? `, grade ${savedC.gradeShinobi}` : ''),
        });
      }

      toast.success(editingId ? 'Candidature mise à jour' : 'Candidature enregistrée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(c: Candidature) {
    const ok = await confirmAction({
      title: 'Supprimer la candidature',
      message: `Supprimer la candidature de ${c.nom} ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== c.id));

      // 🔍 Audit log
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'delete',
        target: 'police:candidature',
        targetId: String(c.id),
        detail: `Recrutement — Suppression candidature de ${c.nom} ` +
          `(statut au moment : ${CANDIDATURE_STATUT_LABEL[c.statut]}` +
          (c.section ? `, section ${c.section}` : '') + ')',
      });

      toast.success('Supprimée');
      if (viewingId === c.id) setViewingId(null);
    } catch { toast.error('Erreur'); }
  }

  async function setStatut(c: Candidature, statut: CandidatureStatut) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === c.id);
      if (idx === -1) return;
      const oldStatut = list[idx].statut;
      list[idx] = { ...list[idx], statut };
      await dbSet(FB_PATH, list);

      // 🔍 Audit log — décision métier importante (acceptation/refus)
      if (oldStatut !== statut) {
        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'update',
          target: 'police:candidature:statut',
          targetId: String(c.id),
          detail: `Recrutement — Décision sur candidature de ${c.nom} : ` +
            `${CANDIDATURE_STATUT_LABEL[oldStatut]} → ${CANDIDATURE_STATUT_LABEL[statut]}`,
        });
      }

      toast.success(`Candidature → ${CANDIDATURE_STATUT_LABEL[statut]}`);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Recrutement"
        subtitle="Candidatures pour rejoindre la Police de Sunagakure"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvelle candidature</Button>}
      >
        <div className={styles.tabs}>
          {(['en_attente', 'acceptee', 'refusee', 'all'] as Tab[]).map((t) => (
            <button key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              <span>{t === 'all' ? 'Toutes' : CANDIDATURE_STATUT_LABEL[t as CandidatureStatut]}</span>
              <span className={styles.tabCount}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Nom, Discord, motif, section…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Award size={32} style={{ opacity: 0.3 }} />
              <p>Aucune candidature pour ces critères.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visible.map((c) => (
                <article key={c.id} className={`${styles.cand} ${styles[`st-${c.statut}`]}`}>
                  <div className={styles.cHeader}>
                    <span className={`${styles.statutChip} ${styles[`chip-${c.statut}`]}`}>
                      {CANDIDATURE_STATUT_LABEL[c.statut]}
                    </span>
                    {c.section && (
                      <span className={styles.sectionChip}>📍 {c.section}</span>
                    )}
                    {c.date && (
                      <span className={styles.dateChip}>{fmtDateFR(c.date)}</span>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(c)}
                      aria-label="Supprimer"
                    ><Trash2 size={13} /></button>
                  </div>

                  <div className={styles.cBody} onClick={() => setViewingId(c.id)}>
                    <h3>{c.nom}</h3>
                    <div className={styles.meta}>
                      {c.age && <span>{c.age} ans</span>}
                      {c.gradeShinobi && <span>· {c.gradeShinobi}</span>}
                      {c.sectionActuelle && <span>· {c.sectionActuelle}</span>}
                    </div>
                    {c.discord && <div className={styles.discord}>💬 {c.discord}</div>}
                    {c.motif && <p className={styles.motif}>{c.motif}</p>}
                  </div>

                  {c.statut === 'en_attente' && (
                    <div className={styles.actions}>
                      <Button size="sm" onClick={() => setStatut(c, 'acceptee')}>
                        <CheckCircle2 size={12} /> Accepter
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatut(c, 'refusee')}>
                        <XCircle size={12} /> Refuser
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
      </Card>

      {/* Viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)}
        title={viewing ? `Candidature de ${viewing.nom}` : ''}
        size="lg"
        footer={
          viewing && (
            <>
              <Button variant="ghost" onClick={() => handleDelete(viewing)}><Trash2 size={14} /> Supprimer</Button>
              {viewing.statut === 'en_attente' && (
                <>
                  <Button variant="outline" onClick={() => setStatut(viewing, 'refusee')}>
                    <XCircle size={14} /> Refuser
                  </Button>
                  <Button onClick={() => setStatut(viewing, 'acceptee')}>
                    <CheckCircle2 size={14} /> Accepter
                  </Button>
                </>
              )}
              <Button onClick={() => openEdit(viewing)}>Modifier</Button>
            </>
          )
        }
      >
        {viewing && (
          <div className={styles.viewer}>
            <div className={styles.vMeta}>
              <span className={`${styles.statutChip} ${styles[`chip-${viewing.statut}`]}`}>
                {CANDIDATURE_STATUT_LABEL[viewing.statut]}
              </span>
              {viewing.date && <span>📅 {fmtDateFR(viewing.date)}</span>}
            </div>

            <div className={styles.viewerRow}>
              {viewing.age && (
                <div>
                  <div className={styles.fieldLabel}>Âge</div>
                  <strong>{viewing.age} ans</strong>
                </div>
              )}
              {viewing.genre && (
                <div>
                  <div className={styles.fieldLabel}>Genre</div>
                  <strong>{viewing.genre}</strong>
                </div>
              )}
              {viewing.gradeShinobi && (
                <div>
                  <div className={styles.fieldLabel}>Grade shinobi</div>
                  <strong>{viewing.gradeShinobi}</strong>
                </div>
              )}
              {viewing.discord && (
                <div>
                  <div className={styles.fieldLabel}>Discord</div>
                  <strong>{viewing.discord}</strong>
                </div>
              )}
            </div>

            {viewing.section && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Section visée</div>
                <p>{viewing.section}</p>
              </div>
            )}
            {viewing.sectionActuelle && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Section actuelle</div>
                <p>{viewing.sectionActuelle}</p>
              </div>
            )}
            {viewing.motif && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Motif de la candidature</div>
                <p className={styles.bigText}>{viewing.motif}</p>
              </div>
            )}
            {viewing.exp && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Expérience</div>
                <p className={styles.bigText}>{viewing.exp}</p>
              </div>
            )}
            {viewing.casier && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Casier judiciaire</div>
                <p>{viewing.casier}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Formulaire */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier la candidature' : 'Nouvelle candidature'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Nom complet *
              <input type="text" value={form.nom ?? ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus />
            </label>
            <label>Discord
              <input type="text" value={form.discord ?? ''}
                onChange={(e) => setForm({ ...form, discord: e.target.value })}
                placeholder="@username" />
            </label>
          </div>

          <div className={styles.row3}>
            <label>Âge
              <input type="text" value={form.age ?? ''}
                onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </label>
            <label>Genre
              <input type="text" value={form.genre ?? ''}
                onChange={(e) => setForm({ ...form, genre: e.target.value })} />
            </label>
            <label>Grade shinobi
              <input type="text" value={form.gradeShinobi ?? ''}
                onChange={(e) => setForm({ ...form, gradeShinobi: e.target.value })}
                placeholder="Genin, Chunin..." />
            </label>
          </div>

          <div className={styles.row}>
            <label>Section visée
              <input type="text" value={form.section ?? ''}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                placeholder="Ex: Police, Médical, Diplo..." />
            </label>
            <label>Section actuelle
              <input type="text" value={form.sectionActuelle ?? ''}
                onChange={(e) => setForm({ ...form, sectionActuelle: e.target.value })} />
            </label>
          </div>

          <label>Motif de la candidature
            <textarea rows={3} value={form.motif ?? ''}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              placeholder="Pourquoi rejoindre la Police ?" />
          </label>

          <label>Expérience
            <textarea rows={3} value={form.exp ?? ''}
              onChange={(e) => setForm({ ...form, exp: e.target.value })}
              placeholder="Missions passées, compétences..." />
          </label>

          <label>Casier judiciaire
            <input type="text" value={form.casier ?? ''}
              onChange={(e) => setForm({ ...form, casier: e.target.value })}
              placeholder="Vierge / Antécédents..." />
          </label>

          <label>Statut
            <select value={form.statut ?? 'en_attente'}
              onChange={(e) => setForm({ ...form, statut: e.target.value as CandidatureStatut })}>
              {(['en_attente', 'acceptee', 'refusee'] as CandidatureStatut[]).map((s) => (
                <option key={s} value={s}>{CANDIDATURE_STATUT_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
    </>
  );
}
