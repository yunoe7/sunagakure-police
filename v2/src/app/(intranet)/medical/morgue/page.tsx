'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page MORGUE — Registre des défunts et autopsies
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/hospital_morgue (TABLEAU)
 *
 * Workflow : Autopsie en cours → Clos → Restitué à la famille
 * Données sensibles, à manipuler avec respect.
 *
 * ⚠️ Accessible aux Gérants Médecin OU Scientifique
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Skull, Calendar, Camera,
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
import { compressImage } from '@/lib/image';
import {
  type Defunt, type MorgueStatut, type CauseDeces,
  MORGUE_STATUT_LABEL, CAUSE_DECES_LABEL, fmtDateFR,
} from '@/types/scientifique';

import styles from './page.module.css';

const FB_PATH = 'hospital_morgue';
type Tab = 'all' | MorgueStatut;

// Branches autorisées pour gérer la morgue
const MORGUE_BRANCHES = ['medecin', 'scientifique'];

export default function MorguePage() {
  const { can, displayName } = useCurrentUser();
  const canEdit = can.adminBranche(MORGUE_BRANCHES);
  const CURRENT_USER = displayName;

  const { data, loading } = useFirebaseValue<Defunt[] | null>(FB_PATH);
  const [tab, setTab] = useState<Tab>('autopsie');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Defunt>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);

  const all = useMemo<Defunt[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (d): d is Defunt => d !== null && typeof d === 'object' && !!d.id
    ),
    [data]
  );

  const counts = useMemo(() => {
    const c = { all: all.length, autopsie: 0, clos: 0, restitue: 0 };
    for (const x of all) c[x.statut as keyof typeof c]++;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (tab !== 'all') list = list.filter((d) => d.statut === tab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) =>
      ((d.nom || '') + ' ' + (d.prenom || '') + ' ' + (d.legiste || '') + ' ' + (d.cause || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id));
  }, [all, tab, search]);

  const viewing = viewingId ? all.find((d) => d.id === viewingId) : null;

  function openCreate() {
    setEditingId(null);
    setForm({ statut: 'autopsie', cause: 'inconnue', legiste: CURRENT_USER });
    setShowForm(true);
  }
  function openEdit(d: Defunt) {
    if (!canEdit) return;
    setEditingId(d.id); setForm(d); setShowForm(true); setViewingId(null);
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
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((d) => d.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Defunt;
      } else {
        list.push({
          id: now,
          nom: form.nom!.trim(),
          prenom: form.prenom?.trim() || undefined,
          age: form.age ? Number(form.age) : undefined,
          faction: form.faction?.trim() || undefined,
          cause: form.cause || 'inconnue',
          statut: form.statut || 'autopsie',
          dateDeces: form.dateDeces || undefined,
          dateAutopsie: form.dateAutopsie || undefined,
          legiste: form.legiste?.trim() || CURRENT_USER,
          rapportAutopsie: form.rapportAutopsie?.trim() || undefined,
          observations: form.observations?.trim() || undefined,
          familleContactee: !!form.familleContactee,
          dateRestitution: form.dateRestitution || undefined,
          notes: form.notes?.trim() || undefined,
          photo: form.photo || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Fiche mise à jour' : 'Défunt enregistré');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(d: Defunt) {
    const ok = await confirmAction({
      title: 'Supprimer la fiche',
      message: `Supprimer définitivement la fiche de ${d.prenom || ''} ${d.nom} ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== d.id));
      toast.success('Supprimée');
      if (viewingId === d.id) setViewingId(null);
    } catch { toast.error('Erreur'); }
  }

  async function setStatut(d: Defunt, statut: MorgueStatut) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === d.id);
      if (idx === -1) return;
      const update: Partial<Defunt> = { statut };
      if (statut === 'restitue' && !d.dateRestitution) {
        update.dateRestitution = new Date().toISOString().slice(0, 10);
        update.familleContactee = true;
      }
      list[idx] = { ...list[idx], ...update };
      await dbSet(FB_PATH, list);
      toast.success(`Statut → ${MORGUE_STATUT_LABEL[statut]}`);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Morgue"
        subtitle="Registre des défunts et autopsies — données confidentielles"
        actions={
          <RequireBranche branche={MORGUE_BRANCHES}>
            <Button onClick={openCreate}><Plus size={14} /> Nouveau défunt</Button>
          </RequireBranche>
        }
      >
        <div className={styles.tabs}>
          {(['autopsie', 'clos', 'restitue', 'all'] as Tab[]).map((t) => (
            <button key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              <span>{t === 'all' ? 'Tous' : MORGUE_STATUT_LABEL[t as MorgueStatut]}</span>
              <span className={styles.tabCount}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text" placeholder="Nom, légiste, cause…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Skull size={32} style={{ opacity: 0.3 }} />
              <p>Aucun défunt pour ces critères.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {visible.map((d) => (
                <article key={d.id} className={`${styles.defunt} ${styles[`st-${d.statut}`]}`}
                  onClick={() => setViewingId(d.id)}
                >
                  <div className={styles.dHeader}>
                    <span className={`${styles.statutChip} ${styles[`chip-${d.statut}`]}`}>
                      {MORGUE_STATUT_LABEL[d.statut]}
                    </span>
                    {canEdit && (
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => { e.stopPropagation(); handleDelete(d); }}
                        aria-label="Supprimer"
                      ><Trash2 size={13} /></button>
                    )}
                  </div>

                  <div className={styles.dBody}>
                    {d.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.photo} alt={d.nom} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        <Skull size={28} />
                      </div>
                    )}
                    <div className={styles.dInfo}>
                      <h3>{d.prenom} {d.nom}</h3>
                      <div className={styles.cause}>
                        ⚠ {CAUSE_DECES_LABEL[d.cause]}
                      </div>
                      <div className={styles.meta}>
                        {d.age && <span>{d.age} ans</span>}
                        {d.faction && <span>· {d.faction}</span>}
                      </div>
                      {d.dateDeces && (
                        <div className={styles.dateDeces}>
                          <Calendar size={11} /> Décès : {fmtDateFR(d.dateDeces)}
                        </div>
                      )}
                      {d.legiste && (
                        <div className={styles.legiste}>
                          🔬 {d.legiste}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
      </Card>

      {/* Viewer */}
      <Modal open={!!viewing} onClose={() => setViewingId(null)}
        title={viewing ? `${viewing.prenom || ''} ${viewing.nom}` : ''}
        size="lg"
        footer={
          viewing && canEdit && (
            <>
              <Button variant="ghost" onClick={() => handleDelete(viewing)}><Trash2 size={14} /> Supprimer</Button>
              {viewing.statut === 'autopsie' && (
                <Button variant="outline" onClick={() => setStatut(viewing, 'clos')}>
                  📁 Clore le dossier
                </Button>
              )}
              {viewing.statut === 'clos' && (
                <Button variant="outline" onClick={() => setStatut(viewing, 'restitue')}>
                  ⚱️ Restituer à la famille
                </Button>
              )}
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
                <img src={viewing.photo} alt={viewing.nom} />
              </div>
            )}

            <div className={styles.vMeta}>
              <span className={`${styles.statutChip} ${styles[`chip-${viewing.statut}`]}`}>
                {MORGUE_STATUT_LABEL[viewing.statut]}
              </span>
              <span>⚠ {CAUSE_DECES_LABEL[viewing.cause]}</span>
              {viewing.age && <span>{viewing.age} ans</span>}
              {viewing.faction && <span>· {viewing.faction}</span>}
            </div>

            <div className={styles.viewerRow}>
              {viewing.dateDeces && (
                <div>
                  <div className={styles.fieldLabel}>Date du décès</div>
                  <strong>{fmtDateFR(viewing.dateDeces)}</strong>
                </div>
              )}
              {viewing.dateAutopsie && (
                <div>
                  <div className={styles.fieldLabel}>Date de l&apos;autopsie</div>
                  <strong>{fmtDateFR(viewing.dateAutopsie)}</strong>
                </div>
              )}
              {viewing.legiste && (
                <div>
                  <div className={styles.fieldLabel}>Médecin légiste</div>
                  <strong>{viewing.legiste}</strong>
                </div>
              )}
              {viewing.dateRestitution && (
                <div>
                  <div className={styles.fieldLabel}>Restitué le</div>
                  <strong>{fmtDateFR(viewing.dateRestitution)}</strong>
                </div>
              )}
            </div>

            {viewing.rapportAutopsie && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>📋 Rapport d&apos;autopsie</div>
                <p className={styles.bigText}>{viewing.rapportAutopsie}</p>
              </div>
            )}
            {viewing.observations && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Observations</div>
                <p>{viewing.observations}</p>
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
        title={editingId ? 'Modifier la fiche' : 'Enregistrer un défunt'} size="lg"
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

          <div className={styles.row3}>
            <label>Âge
              <input type="number" min="0" value={form.age ?? ''}
                onChange={(e) => setForm({ ...form, age: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
            <label>Faction
              <input type="text" value={form.faction ?? ''}
                onChange={(e) => setForm({ ...form, faction: e.target.value })} />
            </label>
            <label>Légiste
              <input type="text" value={form.legiste ?? ''}
                onChange={(e) => setForm({ ...form, legiste: e.target.value })} />
            </label>
          </div>

          <div className={styles.row}>
            <label>Cause du décès
              <select value={form.cause ?? 'inconnue'}
                onChange={(e) => setForm({ ...form, cause: e.target.value as CauseDeces })}>
                {(['mission', 'combat', 'maladie', 'naturelle', 'execution', 'accident', 'inconnue', 'autre'] as CauseDeces[]).map((c) => (
                  <option key={c} value={c}>{CAUSE_DECES_LABEL[c]}</option>
                ))}
              </select>
            </label>
            <label>Statut
              <select value={form.statut ?? 'autopsie'}
                onChange={(e) => setForm({ ...form, statut: e.target.value as MorgueStatut })}>
                {(['autopsie', 'clos', 'restitue'] as MorgueStatut[]).map((s) => (
                  <option key={s} value={s}>{MORGUE_STATUT_LABEL[s]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.row3}>
            <label>Date du décès
              <input type="date" value={form.dateDeces ?? ''}
                onChange={(e) => setForm({ ...form, dateDeces: e.target.value })} />
            </label>
            <label>Date de l&apos;autopsie
              <input type="date" value={form.dateAutopsie ?? ''}
                onChange={(e) => setForm({ ...form, dateAutopsie: e.target.value })} />
            </label>
            <label>Date de restitution
              <input type="date" value={form.dateRestitution ?? ''}
                onChange={(e) => setForm({ ...form, dateRestitution: e.target.value })} />
            </label>
          </div>

          <label>Rapport d&apos;autopsie
            <textarea rows={5} value={form.rapportAutopsie ?? ''}
              onChange={(e) => setForm({ ...form, rapportAutopsie: e.target.value })}
              placeholder="Observations cliniques, causes du décès, lésions..." />
          </label>

          <label>Observations complémentaires
            <textarea rows={3} value={form.observations ?? ''}
              onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </label>

          <label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!form.familleContactee}
                onChange={(e) => setForm({ ...form, familleContactee: e.target.checked })}
                style={{ width: 14, height: 14 }} />
              Famille contactée
            </span>
          </label>

          <label>Notes
            <textarea rows={2} value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>

          <label>
            <Camera size={11} style={{ marginRight: 4, display: 'inline' }} />
            Photo (optionnel - portrait du défunt)
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
