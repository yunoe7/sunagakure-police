'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page DOSSIERS — Dossiers criminels de la police
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/dossiers (TABLEAU, format legacy)
 *
 * Un dossier = fiche officielle ouverte sur une personne suspectée
 * ou condamnée. Contient identité, infractions, amendes, photo.
 *
 * Filtres : par danger, par statut. Recherche full-text.
 * Tri : par date d'ouverture (plus récent en premier).
 *
 * Permissions :
 * - Voir / chercher / filtrer : tout le monde (connecté)
 * - Créer / modifier / supprimer : TOUS LES MEMBRES POLICE + Admin
 *   (action opérationnelle, pas réservée aux Gérants)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Search,
  Camera,
  Skull,
  Folder,
  AlertTriangle,
  Coins,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { RequireMembreBranche } from '@/components/Require';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { compressImage } from '@/lib/image';
import {
  type Dossier,
  type DossierDanger,
  type DossierStatut,
  DANGER_LABEL,
  DOSSIER_STATUT_LABEL,
  fmtMoney,
  fmtDateFR,
} from '@/types/dossier';

import styles from './page.module.css';

const FB_PATH = 'dossiers';
type DangerFilter = 'all' | DossierDanger;
type StatutFilter = 'all' | DossierStatut;

export default function DossiersPage() {
  const { displayName: CURRENT_USER, can } = useCurrentUser();
  const { data, loading } = useFirebaseValue<Dossier[] | null>(FB_PATH);

  const [search, setSearch] = useState('');
  const [dangerFilter, setDangerFilter] = useState<DangerFilter>('all');
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Dossier>>({});

  // Permission : TOUS les membres Police (opérationnel)
  const canEdit = can.membreBranche('police');

  // ─── Données normalisées ───
  const all = useMemo<Dossier[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (d): d is Dossier => d !== null && typeof d === 'object' && !!d.id
    );
  }, [data]);

  const visible = useMemo(() => {
    let list = all;
    if (dangerFilter !== 'all') list = list.filter((d) => d.danger === dangerFilter);
    if (statutFilter !== 'all') list = list.filter((d) => d.statut === statutFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        ((d.nom || '') + ' ' + (d.notes || '') + ' ' + (d.infractions || '') + ' ' + (d.auteur || ''))
          .toLowerCase()
          .includes(q)
      );
    }
    return [...list].sort((a, b) => (b.date ?? b.id) - (a.date ?? a.id));
  }, [all, search, dangerFilter, statutFilter]);

  // Stats hero
  const stats = useMemo(() => {
    const total = all.length;
    const recherches = all.filter((d) => d.statut === 'recherche').length;
    const gardeVue = all.filter((d) => d.statut === 'garde_vue').length;
    const totalAmendeImpayee = all.reduce((s, d) => s + (d.amendeImpayee || 0), 0);
    return { total, recherches, gardeVue, totalAmendeImpayee };
  }, [all]);

  // ─── Handlers ───
  function openCreate() {
    setEditingId(null);
    setForm({ danger: 'moyen', statut: 'ouvert', defunt: false });
    setShowForm(true);
  }

  function openEdit(d: Dossier) {
    setEditingId(d.id);
    setForm(d);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  }

  async function handleSave() {
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    try {
      const list = [...all];
      const now = Date.now();
      const amendePayee = Number(form.amendePayee) || 0;
      const amendeTotal = Number(form.amendeTotal) || 0;
      const amendeImpayee = form.defunt ? 0 : Math.max(0, amendeTotal - amendePayee);

      if (editingId) {
        const idx = list.findIndex((d) => d.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = {
          ...list[idx],
          ...form,
          id: editingId,
          amendePayee,
          amendeImpayee,
          amendeTotal,
        } as Dossier;
      } else {
        list.push({
          id: now,
          nom: form.nom!.trim(),
          danger: form.danger || 'moyen',
          statut: form.statut || 'ouvert',
          notes: form.notes?.trim() || undefined,
          photo: form.photo || undefined,
          defunt: !!form.defunt,
          auteur: CURRENT_USER,
          date: now,
          infractions: form.infractions?.trim() || undefined,
          amendePayee,
          amendeImpayee,
          amendeTotal,
        } as Dossier);
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Dossier mis à jour' : 'Dossier ouvert');
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(d: Dossier) {
    const ok = await confirmAction({
      title: 'Supprimer le dossier',
      message: `Supprimer définitivement le dossier de ${d.nom} ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== d.id));
      toast.success('Dossier supprimé');
    } catch {
      toast.error('Erreur');
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error("Ce n'est pas une image");
      return;
    }
    try {
      const dataUrl = await compressImage(file, 400, 0.75);
      setForm({ ...form, photo: dataUrl });
    } catch {
      toast.error("Impossible de charger l'image");
    }
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Dossiers criminels"
        subtitle="Registre officiel de la Police de Suna"
        actions={
          <RequireMembreBranche branche="police">
            <Button onClick={openCreate}>
              <Plus size={14} /> Ouvrir un dossier
            </Button>
          </RequireMembreBranche>
        }
      >
        {/* Stats hero */}
        <div className={styles.statGrid}>
          <StatCard label="Total dossiers" value={stats.total} variant="default" />
          <StatCard label="Recherchés" value={stats.recherches} variant="danger" />
          <StatCard label="En garde à vue" value={stats.gardeVue} variant="warning" />
          <StatCard
            label="Amendes impayées"
            value={`${fmtMoney(stats.totalAmendeImpayee)} ₽`}
            variant="gold"
          />
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Nom, infractions, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={dangerFilter}
            onChange={(e) => setDangerFilter(e.target.value as DangerFilter)}
          >
            <option value="all">Tous niveaux de danger</option>
            <option value="faible">Faible</option>
            <option value="moyen">Moyen</option>
            <option value="eleve">Élevé</option>
            <option value="critique">Critique</option>
          </select>
          <select
            className={styles.filterSelect}
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutFilter)}
          >
            <option value="all">Tous statuts</option>
            {Object.entries(DOSSIER_STATUT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Liste */}
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Folder size={32} style={{ opacity: 0.3 }} />
            <p>
              {search || dangerFilter !== 'all' || statutFilter !== 'all'
                ? 'Aucun dossier pour ces critères.'
                : 'Aucun dossier criminel ouvert.'}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visible.map((d) => (
              <article
                key={d.id}
                className={`${styles.dossier} ${styles[`d-${d.danger}`]} ${d.defunt ? styles.defunt : ''}`}
                onClick={() => canEdit && openEdit(d)}
                style={{ cursor: canEdit ? 'pointer' : 'default' }}
              >
                <div className={styles.header}>
                  <span className={`${styles.dangerBadge} ${styles[`db-${d.danger}`]}`}>
                    {d.danger === 'critique' || d.danger === 'eleve' ? (
                      <AlertTriangle size={11} />
                    ) : null}
                    {DANGER_LABEL[d.danger]}
                  </span>
                  <span className={`${styles.statutChip} ${styles[`chip-${d.statut}`]}`}>
                    {DOSSIER_STATUT_LABEL[d.statut]}
                  </span>
                  {d.defunt && (
                    <span className={styles.defuntBadge}>
                      <Skull size={11} /> Défunt
                    </span>
                  )}
                  <RequireMembreBranche branche="police">
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(d);
                      }}
                      aria-label="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </RequireMembreBranche>
                </div>

                <div className={styles.body}>
                  <div className={styles.identity}>
                    {d.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.photo} alt={d.nom} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        {d.nom[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className={styles.identityInfo}>
                      <h3>{d.nom}</h3>
                      <div className={styles.subline}>
                        {d.auteur && <span>Par {d.auteur}</span>}
                        {d.date && (
                          <>
                            <span className={styles.sep}>·</span>
                            <span>{fmtDateFR(d.date)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {d.infractions && (
                    <div className={styles.infractions}>
                      <span className={styles.infractionsLabel}>Infractions</span>
                      <p>{d.infractions}</p>
                    </div>
                  )}

                  {d.notes && <p className={styles.notes}>{d.notes}</p>}

                  {((d.amendePayee && d.amendePayee > 0) ||
                    (d.amendeImpayee && d.amendeImpayee > 0)) && (
                    <div className={styles.amendes}>
                      {d.amendePayee && d.amendePayee > 0 && (
                        <div className={styles.amendeTag}>
                          <span>Payé</span>
                          <strong>{fmtMoney(d.amendePayee)} ₽</strong>
                        </div>
                      )}
                      {d.amendeImpayee && d.amendeImpayee > 0 && (
                        <div className={`${styles.amendeTag} ${styles.amendeTagImpaye}`}>
                          <span>Impayé</span>
                          <strong>{fmtMoney(d.amendeImpayee)} ₽</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      {/* Modale */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier le dossier' : 'Nouveau dossier criminel'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>
              Annuler
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Nom complet *
            <input
              type="text"
              value={form.nom ?? ''}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              autoFocus
              placeholder="Prénom et nom de la personne"
            />
          </label>

          <div className={styles.row}>
            <label>
              Niveau de danger
              <select
                value={form.danger ?? 'moyen'}
                onChange={(e) => setForm({ ...form, danger: e.target.value as DossierDanger })}
              >
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="eleve">Élevé</option>
                <option value="critique">Critique</option>
              </select>
            </label>
            <label>
              Statut
              <select
                value={form.statut ?? 'ouvert'}
                onChange={(e) =>
                  setForm({ ...form, statut: e.target.value as DossierStatut })
                }
              >
                {Object.entries(DOSSIER_STATUT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Infractions reprochées
            <input
              type="text"
              value={form.infractions ?? ''}
              onChange={(e) => setForm({ ...form, infractions: e.target.value })}
              placeholder="Vol, agression, trahison… (séparer par des virgules)"
            />
          </label>

          <div className={styles.row3}>
            <label>
              Amende totale (₽)
              <input
                type="number"
                value={form.amendeTotal ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amendeTotal: e.target.value ? Number(e.target.value) : 0,
                  })
                }
              />
            </label>
            <label>
              Amende payée (₽)
              <input
                type="number"
                value={form.amendePayee ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amendePayee: e.target.value ? Number(e.target.value) : 0,
                  })
                }
              />
            </label>
            <label>
              <span style={{ visibility: 'hidden' }}>X</span>
              <div className={styles.checkboxBox}>
                <input
                  type="checkbox"
                  id="defunt-check"
                  checked={!!form.defunt}
                  onChange={(e) => setForm({ ...form, defunt: e.target.checked })}
                />
                <label htmlFor="defunt-check" style={{ cursor: 'pointer' }}>
                  ⚱ Défunt
                </label>
              </div>
            </label>
          </div>

          <label>
            Notes / Observations
            <textarea
              rows={4}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Antécédents, circonstances, témoins…"
            />
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
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoUpload(f);
                }}
              />
              {form.photo && (
                <button
                  type="button"
                  className={styles.removePhoto}
                  onClick={(e) => {
                    e.preventDefault();
                    setForm({ ...form, photo: undefined });
                  }}
                >
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

// ─── Stat card sous-composant ───
function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant: 'default' | 'danger' | 'warning' | 'gold';
}) {
  return (
    <div className={`${styles.statCard} ${styles[`sv-${variant}`]}`}>
      <div className={styles.statVal}>
        {variant === 'gold' && (
          <Coins size={18} style={{ marginRight: 4, display: 'inline', verticalAlign: 'middle' }} />
        )}
        {value}
      </div>
      <div className={styles.statLbl}>{label}</div>
    </div>
  );
}
