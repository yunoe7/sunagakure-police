'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page TRIBUNAL — Hub justice (Affaires, Audiences, Jugements)
 * ════════════════════════════════════════════════════════════════
 *
 * Page unique avec 3 onglets internes :
 *   - Affaires (dossiers ouverts par le Tribunal)
 *   - Audiences (planning des séances)
 *   - Jugements (verdicts rendus)
 *
 * Stockage Firebase :
 *   sunagakure/affaires  (TABLEAU)
 *   sunagakure/audiences (TABLEAU)
 *   sunagakure/jugements (TABLEAU)
 *
 * Note design : MVP épuré. Chaque onglet a sa propre liste + bouton créer.
 * Les références croisées (audience ↔ affaire ↔ jugement) sont possibles
 * via les `affaireId` mais pas obligatoires.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Folder,
  Gavel,
  Scale,
  Calendar,
  MapPin,
  User as UserIcon,
  Clock,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Affaire,
  type Audience,
  type Jugement,
  type AffaireStatut,
  type AudienceStatut,
  type JugementVerdict,
  AFFAIRE_STATUT_LABEL,
  AUDIENCE_STATUT_LABEL,
  VERDICT_LABEL,
  nextAffaireRef,
  fmtDateFR,
} from '@/types/tribunal';

import styles from './page.module.css';

type Tab = 'affaires' | 'audiences' | 'jugements';
type EditingType = 'affaire' | 'audience' | 'jugement' | null;

export default function TribunalPage() {
  const { data: affairesData } = useFirebaseValue<Affaire[] | null>('affaires');
  const { data: audiencesData } = useFirebaseValue<Audience[] | null>('audiences');
  const { data: jugementsData } = useFirebaseValue<Jugement[] | null>('jugements');

  const [tab, setTab] = useState<Tab>('affaires');

  // Modale d'édition (uniforme pour les 3 types)
  const [editingType, setEditingType] = useState<EditingType>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<
    Partial<Affaire & Audience & Jugement> & { verdict?: JugementVerdict }
  >({});

  // ─── Normalisation des données ───
  const affaires = useMemo<Affaire[]>(() => normalize<Affaire>(affairesData), [affairesData]);
  const audiences = useMemo<Audience[]>(() => normalize<Audience>(audiencesData), [audiencesData]);
  const jugements = useMemo<Jugement[]>(() => normalize<Jugement>(jugementsData), [jugementsData]);

  // Tri par date la plus récente
  const affairesSorted = useMemo(
    () => [...affaires].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id)),
    [affaires]
  );
  const audiencesSorted = useMemo(
    () =>
      [...audiences].sort((a, b) => {
        // Trier par date d'audience (les plus proches d'abord)
        const da = a.date ? new Date(a.date).getTime() : a.createdAt;
        const db = b.date ? new Date(b.date).getTime() : b.createdAt;
        return db - da;
      }),
    [audiences]
  );
  const jugementsSorted = useMemo(
    () =>
      [...jugements].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : a.createdAt;
        const db = b.date ? new Date(b.date).getTime() : b.createdAt;
        return db - da;
      }),
    [jugements]
  );

  // ─── Handlers création/édition ───
  function openCreate(type: EditingType) {
    setEditingType(type);
    setEditingId(null);
    if (type === 'affaire') setForm({ statut: 'instruction' });
    else if (type === 'audience') setForm({ statut: 'planifiee' });
    else if (type === 'jugement') setForm({ verdict: 'coupable' });
  }

  function openEdit(type: EditingType, item: { id: number }) {
    setEditingType(type);
    setEditingId(item.id);
    setForm(item);
  }

  function closeModal() {
    setEditingType(null);
    setEditingId(null);
    setForm({});
  }

  // ─── Sauvegardes ───
  async function handleSaveAffaire() {
    if (!form.titre?.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }
    try {
      const list = [...affaires];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((a) => a.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Affaire;
      } else {
        const newA: Affaire = {
          id: now,
          ref: nextAffaireRef(list),
          titre: form.titre!.trim(),
          defendeur: form.defendeur?.trim() || undefined,
          accusateur: form.accusateur?.trim() || undefined,
          juge: form.juge?.trim() || undefined,
          avocat: form.avocat?.trim() || undefined,
          statut: (form.statut as AffaireStatut) || 'instruction',
          desc: form.desc?.trim() || undefined,
          createdAt: now,
        };
        list.push(newA);
      }
      await dbSet('affaires', list);
      toast.success(editingId ? 'Affaire mise à jour' : 'Affaire enregistrée');
      closeModal();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleSaveAudience() {
    if (!form.titre?.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }
    try {
      const list = [...audiences];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((a) => a.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Audience;
      } else {
        const newA: Audience = {
          id: now,
          titre: form.titre!.trim(),
          date: form.date || undefined,
          heure: form.heure || undefined,
          lieu: form.lieu?.trim() || undefined,
          juge: form.juge?.trim() || undefined,
          affaireId: form.affaireId || undefined,
          duree: form.duree?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          statut: (form.statut as AudienceStatut) || 'planifiee',
          createdAt: now,
        };
        list.push(newA);
      }
      await dbSet('audiences', list);
      toast.success(editingId ? 'Audience mise à jour' : 'Audience planifiée');
      closeModal();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleSaveJugement() {
    if (!form.titre?.trim()) {
      toast.error("Le titre / l'affaire est obligatoire");
      return;
    }
    try {
      const list = [...jugements];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((j) => j.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Jugement;
      } else {
        const newJ: Jugement = {
          id: now,
          titre: form.titre!.trim(),
          affaireId: form.affaireId || undefined,
          verdict: (form.verdict as JugementVerdict) || 'coupable',
          peine: form.peine?.trim() || undefined,
          juge: form.juge?.trim() || undefined,
          date: form.date || undefined,
          motifs: form.motifs?.trim() || undefined,
          createdAt: now,
        };
        list.push(newJ);
      }
      await dbSet('jugements', list);
      toast.success(editingId ? 'Jugement mis à jour' : 'Jugement rendu');
      closeModal();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  // ─── Suppressions ───
  async function handleDelete(
    type: 'affaire' | 'audience' | 'jugement',
    item: { id: number; titre?: string; ref?: string }
  ) {
    const label = item.ref || item.titre || `#${item.id}`;
    const ok = await confirmAction({
      title: 'Confirmation',
      message: `Supprimer "${label}" ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      if (type === 'affaire') {
        await dbSet('affaires', affaires.filter((a) => a.id !== item.id));
      } else if (type === 'audience') {
        await dbSet('audiences', audiences.filter((a) => a.id !== item.id));
      } else {
        await dbSet('jugements', jugements.filter((j) => j.id !== item.id));
      }
      toast.success('Supprimé');
    } catch {
      toast.error('Erreur');
    }
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Tribunal"
        subtitle="Affaires • Audiences • Jugements"
        actions={
          <Button
            onClick={() =>
              openCreate(
                tab === 'affaires'
                  ? 'affaire'
                  : tab === 'audiences'
                    ? 'audience'
                    : 'jugement'
              )
            }
          >
            <Plus size={14} />
            {tab === 'affaires'
              ? 'Nouvelle affaire'
              : tab === 'audiences'
                ? 'Planifier audience'
                : 'Rendre jugement'}
          </Button>
        }
      >
        {/* Onglets */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'affaires' ? styles.tabActive : ''}`}
            onClick={() => setTab('affaires')}
          >
            <Folder size={14} />
            <span>Affaires</span>
            <span className={styles.tabCount}>{affaires.length}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'audiences' ? styles.tabActive : ''}`}
            onClick={() => setTab('audiences')}
          >
            <Gavel size={14} />
            <span>Audiences</span>
            <span className={styles.tabCount}>{audiences.length}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'jugements' ? styles.tabActive : ''}`}
            onClick={() => setTab('jugements')}
          >
            <Scale size={14} />
            <span>Jugements</span>
            <span className={styles.tabCount}>{jugements.length}</span>
          </button>
        </div>

        {/* AFFAIRES */}
        {tab === 'affaires' && (
          <>
            {affairesSorted.length === 0 ? (
              <div className={styles.empty}>
                <Folder size={32} style={{ opacity: 0.3 }} />
                <p>Aucune affaire en cours. Crée la première !</p>
              </div>
            ) : (
              <div className={styles.list}>
                {affairesSorted.map((a) => (
                  <article
                    key={a.id}
                    className={`${styles.item} ${styles[`aff-${a.statut}`]}`}
                    onClick={() => openEdit('affaire', a)}
                  >
                    <div className={styles.itemHeader}>
                      {a.ref && <span className={styles.refTxt}>{a.ref}</span>}
                      <span className={`${styles.statutChip} ${styles[`chip-aff-${a.statut}`]}`}>
                        {AFFAIRE_STATUT_LABEL[a.statut]}
                      </span>
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete('affaire', a);
                        }}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <h3 className={styles.itemTitle}>{a.titre}</h3>
                    <div className={styles.itemMeta}>
                      {a.defendeur && (
                        <span>
                          <UserIcon size={11} /> Défendeur: <strong>{a.defendeur}</strong>
                        </span>
                      )}
                      {a.accusateur && (
                        <span>
                          <UserIcon size={11} /> Accusateur: <strong>{a.accusateur}</strong>
                        </span>
                      )}
                      {a.juge && <span>👨‍⚖️ Juge: {a.juge}</span>}
                      {a.avocat && <span>⚖️ Avocat: {a.avocat}</span>}
                    </div>
                    {a.desc && <p className={styles.itemDesc}>{a.desc}</p>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {/* AUDIENCES */}
        {tab === 'audiences' && (
          <>
            {audiencesSorted.length === 0 ? (
              <div className={styles.empty}>
                <Gavel size={32} style={{ opacity: 0.3 }} />
                <p>Aucune audience planifiée.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {audiencesSorted.map((a) => (
                  <article
                    key={a.id}
                    className={`${styles.item} ${styles[`aud-${a.statut}`]}`}
                    onClick={() => openEdit('audience', a)}
                  >
                    <div className={styles.itemHeader}>
                      {a.date && (
                        <span className={styles.dateBlock}>
                          <Calendar size={12} /> {fmtDateFR(a.date)}
                          {a.heure && (
                            <>
                              <span style={{ opacity: 0.4, margin: '0 4px' }}>·</span>
                              <Clock size={11} /> {a.heure}
                            </>
                          )}
                        </span>
                      )}
                      <span className={`${styles.statutChip} ${styles[`chip-aud-${a.statut}`]}`}>
                        {AUDIENCE_STATUT_LABEL[a.statut]}
                      </span>
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete('audience', a);
                        }}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <h3 className={styles.itemTitle}>{a.titre}</h3>
                    <div className={styles.itemMeta}>
                      {a.lieu && (
                        <span>
                          <MapPin size={11} /> {a.lieu}
                        </span>
                      )}
                      {a.juge && <span>👨‍⚖️ {a.juge}</span>}
                      {a.duree && <span>⏱ {a.duree}</span>}
                    </div>
                    {a.notes && <p className={styles.itemDesc}>{a.notes}</p>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {/* JUGEMENTS */}
        {tab === 'jugements' && (
          <>
            {jugementsSorted.length === 0 ? (
              <div className={styles.empty}>
                <Scale size={32} style={{ opacity: 0.3 }} />
                <p>Aucun jugement rendu.</p>
              </div>
            ) : (
              <div className={styles.list}>
                {jugementsSorted.map((j) => (
                  <article
                    key={j.id}
                    className={`${styles.item} ${styles[`jug-${j.verdict}`]}`}
                    onClick={() => openEdit('jugement', j)}
                  >
                    <div className={styles.itemHeader}>
                      <span className={`${styles.verdictChip} ${styles[`chip-jug-${j.verdict}`]}`}>
                        {VERDICT_LABEL[j.verdict]}
                      </span>
                      {j.date && (
                        <span className={styles.dateBlock}>
                          <Calendar size={12} /> {fmtDateFR(j.date)}
                        </span>
                      )}
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete('jugement', j);
                        }}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <h3 className={styles.itemTitle}>{j.titre}</h3>
                    <div className={styles.itemMeta}>
                      {j.juge && <span>👨‍⚖️ Juge: {j.juge}</span>}
                      {j.peine && (
                        <span className={styles.peineTag}>Peine: {j.peine}</span>
                      )}
                    </div>
                    {j.motifs && <p className={styles.itemDesc}>{j.motifs}</p>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ─── Modale AFFAIRE ─── */}
      <Modal
        open={editingType === 'affaire'}
        onClose={closeModal}
        title={editingId ? "Modifier l'affaire" : 'Nouvelle affaire'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>
              Annuler
            </Button>
            <Button onClick={handleSaveAffaire}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Titre de l&apos;affaire *
            <input
              type="text"
              value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              autoFocus
              placeholder="Ex: Affaire du vol au marché central"
            />
          </label>
          <div className={styles.row}>
            <label>
              Défendeur (accusé)
              <input
                type="text"
                value={form.defendeur ?? ''}
                onChange={(e) => setForm({ ...form, defendeur: e.target.value })}
              />
            </label>
            <label>
              Accusateur (partie civile)
              <input
                type="text"
                value={form.accusateur ?? ''}
                onChange={(e) => setForm({ ...form, accusateur: e.target.value })}
              />
            </label>
          </div>
          <div className={styles.row}>
            <label>
              Juge
              <input
                type="text"
                value={form.juge ?? ''}
                onChange={(e) => setForm({ ...form, juge: e.target.value })}
              />
            </label>
            <label>
              Avocat de la défense
              <input
                type="text"
                value={form.avocat ?? ''}
                onChange={(e) => setForm({ ...form, avocat: e.target.value })}
              />
            </label>
          </div>
          <label>
            Statut
            <select
              value={form.statut ?? 'instruction'}
              onChange={(e) => setForm({ ...form, statut: e.target.value as AffaireStatut })}
            >
              <option value="instruction">En instruction</option>
              <option value="audience">En audience</option>
              <option value="jugee">Jugée</option>
              <option value="archivee">Archivée</option>
            </select>
          </label>
          <label>
            Description
            <textarea
              rows={4}
              value={form.desc ?? ''}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
            />
          </label>
        </div>
      </Modal>

      {/* ─── Modale AUDIENCE ─── */}
      <Modal
        open={editingType === 'audience'}
        onClose={closeModal}
        title={editingId ? "Modifier l'audience" : 'Planifier une audience'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>
              Annuler
            </Button>
            <Button onClick={handleSaveAudience}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Titre / Objet *
            <input
              type="text"
              value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              autoFocus
              placeholder="Ex: Audience publique, Mise en examen…"
            />
          </label>
          <div className={styles.row}>
            <label>
              Date
              <input
                type="date"
                value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Heure
              <input
                type="time"
                value={form.heure ?? ''}
                onChange={(e) => setForm({ ...form, heure: e.target.value })}
              />
            </label>
          </div>
          <div className={styles.row}>
            <label>
              Lieu
              <input
                type="text"
                value={form.lieu ?? ''}
                onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                placeholder="Ex: Salle d'audience principale"
              />
            </label>
            <label>
              Juge assigné
              <input
                type="text"
                value={form.juge ?? ''}
                onChange={(e) => setForm({ ...form, juge: e.target.value })}
              />
            </label>
          </div>
          <div className={styles.row}>
            <label>
              Affaire associée (optionnel)
              <select
                value={form.affaireId ?? ''}
                onChange={(e) =>
                  setForm({ ...form, affaireId: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">— Aucune —</option>
                {affaires.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ref ? `${a.ref} · ` : ''}{a.titre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Durée prévue
              <input
                type="text"
                value={form.duree ?? ''}
                onChange={(e) => setForm({ ...form, duree: e.target.value })}
                placeholder="Ex: 1h30"
              />
            </label>
          </div>
          <label>
            Statut
            <select
              value={form.statut ?? 'planifiee'}
              onChange={(e) => setForm({ ...form, statut: e.target.value as AudienceStatut })}
            >
              <option value="planifiee">Planifiée</option>
              <option value="tenue">Tenue</option>
              <option value="reportee">Reportée</option>
              <option value="annulee">Annulée</option>
            </select>
          </label>
          <label>
            Notes / Ordre du jour
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
      </Modal>

      {/* ─── Modale JUGEMENT ─── */}
      <Modal
        open={editingType === 'jugement'}
        onClose={closeModal}
        title={editingId ? 'Modifier le jugement' : 'Rendre un jugement'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>
              Annuler
            </Button>
            <Button onClick={handleSaveJugement}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Titre / Affaire *
            <input
              type="text"
              value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              autoFocus
              placeholder="Ex: Affaire X contre Y"
            />
          </label>
          <div className={styles.row}>
            <label>
              Affaire associée
              <select
                value={form.affaireId ?? ''}
                onChange={(e) =>
                  setForm({ ...form, affaireId: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">— Aucune —</option>
                {affaires.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ref ? `${a.ref} · ` : ''}{a.titre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date du verdict
              <input
                type="date"
                value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
          </div>
          <div className={styles.row}>
            <label>
              Verdict *
              <select
                value={form.verdict ?? 'coupable'}
                onChange={(e) => setForm({ ...form, verdict: e.target.value as JugementVerdict })}
              >
                <option value="coupable">⚖️ Coupable</option>
                <option value="non_coupable">✓ Non coupable</option>
                <option value="non_lieu">Non-lieu</option>
                <option value="autre">Autre</option>
              </select>
            </label>
            <label>
              Juge
              <input
                type="text"
                value={form.juge ?? ''}
                onChange={(e) => setForm({ ...form, juge: e.target.value })}
              />
            </label>
          </div>
          <label>
            Peine prononcée
            <input
              type="text"
              value={form.peine ?? ''}
              onChange={(e) => setForm({ ...form, peine: e.target.value })}
              placeholder="Ex: 6 mois de prison + 5000 ryos d'amende"
            />
          </label>
          <label>
            Motifs / Considérants
            <textarea
              rows={4}
              value={form.motifs ?? ''}
              onChange={(e) => setForm({ ...form, motifs: e.target.value })}
              placeholder="Justification du verdict, attendus, références au Code Pénal…"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}

// ─── Helper de normalisation ───
function normalize<T extends { id: number }>(data: T[] | Record<string, T> | null): T[] {
  if (!data) return [];
  return (Array.isArray(data) ? data : Object.values(data)).filter(
    (x): x is T => x !== null && typeof x === 'object' && !!x.id
  );
}
