'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page FICHE DOSSIER — Vue détaillée + Édition
 * ════════════════════════════════════════════════════════════════
 *
 * Route : /dossiers/[id]
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Save, Camera,
  User, AlertTriangle, FileText, Coins, Calendar, Skull,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { compressImage } from '@/lib/image';
import {
  type Dossier, type DossierDanger, type DossierStatut,
  DANGER_LABEL, DOSSIER_STATUT_LABEL, fmtMoney, fmtDateFR,
} from '@/types/dossier';

import listStyles from '../page.module.css';
import styles from './page.module.css';

const FB_PATH = 'dossiers';

export default function FicheDossierPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.membreBranche('police');

  const { data, loading } = useFirebaseValue<Dossier[] | null>(FB_PATH);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Dossier>>({});

  const all = useMemo<Dossier[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (d): d is Dossier => d !== null && typeof d === 'object' && !!d.id
    );
  }, [data]);

  const dossier = useMemo(() => all.find((d) => d.id === id) || null, [all, id]);

  function openEdit() {
    if (!dossier) return;
    setForm({ ...dossier });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm({});
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

  async function handleSave() {
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    try {
      const list = [...all];
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) throw new Error('Introuvable');

      const amendePayee = Number(form.amendePayee) || 0;
      const amendeTotal = Number(form.amendeTotal) || 0;
      const amendeImpayee = form.defunt ? 0 : Math.max(0, amendeTotal - amendePayee);

      list[idx] = {
        ...list[idx],
        ...form,
        id,
        amendePayee,
        amendeImpayee,
        amendeTotal,
      } as Dossier;

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'update',
        target: 'dossier',
        targetId: String(id),
        detail: `Modification du dossier de ${form.nom!.trim()}`,
      });

      await dbSet(FB_PATH, list);
      toast.success('Dossier mis à jour');
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete() {
    if (!dossier) return;
    const ok = await confirmAction({
      title: 'Supprimer le dossier',
      message: `Supprimer définitivement le dossier de ${dossier.nom} ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'delete',
        target: 'dossier',
        targetId: String(id),
        detail: `Suppression du dossier de ${dossier.nom}${dossier.infractions ? ` (${dossier.infractions})` : ''}`,
      });

      await dbSet(FB_PATH, all.filter((x) => x.id !== id));
      toast.success('Dossier supprimé');
      router.push('/dossiers');
    } catch {
      toast.error('Erreur');
    }
  }

  if (loading) {
    return <div className={styles.loading}><p>Chargement du dossier…</p></div>;
  }

  if (!dossier) {
    return (
      <div className={styles.notFound}>
        <h2>Dossier introuvable</h2>
        <p>Ce dossier n&apos;existe pas ou a été supprimé.</p>
        <Button onClick={() => router.push('/dossiers')}>
          <ArrowLeft size={14} /> Retour aux dossiers
        </Button>
      </div>
    );
  }

  const dangerClass = `d-${dossier.danger}`;

  return (
    <>
      {/* Barre d'actions sticky */}
      <div className={styles.actionsBar}>
        <button
          className={styles.backBtn}
          onClick={() => router.push('/dossiers')}
        >
          <ArrowLeft size={16} />
          <span className={styles.backLabel}>Retour aux dossiers</span>
          <span className={styles.backLabelMobile}>Retour</span>
        </button>
        {canEdit && (
          <div className={styles.actionsRight}>
            <button className={styles.editBtn} onClick={openEdit}>
              <Pencil size={14} /> Modifier
            </button>
            <button className={styles.delBtn} onClick={handleDelete}>
              <Trash2 size={14} />
              <span className={styles.delLabel}>Supprimer</span>
            </button>
          </div>
        )}
      </div>

      {/* Fiche complète */}
      <article
        className={`${styles.fiche} ${styles[dangerClass]} ${dossier.defunt ? styles.ficheDefunt : ''}`}
      >
        {/* ─── HEADER ─── */}
        <header className={styles.header}>
          {dossier.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dossier.photo} alt={dossier.nom} className={styles.photo} />
          ) : (
            <div className={styles.photoPlaceholder}>
              {dossier.nom[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className={styles.headerInfo}>
            <h1 className={styles.name}>{dossier.nom}</h1>
            <div className={styles.tags}>
              <span className={`${styles.tag} ${styles[`db-${dossier.danger}`]}`}>
                {(dossier.danger === 'critique' || dossier.danger === 'eleve') && (
                  <AlertTriangle size={11} />
                )}
                {DANGER_LABEL[dossier.danger]}
              </span>
              <span className={`${styles.tag} ${styles[`chip-${dossier.statut}`]}`}>
                {DOSSIER_STATUT_LABEL[dossier.statut]}
              </span>
              {dossier.defunt && (
                <span className={`${styles.tag} ${styles.tagDefunt}`}>
                  <Skull size={11} /> Défunt
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ─── SECTIONS ─── */}
        <div className={styles.sections}>
          {/* Infractions */}
          {dossier.infractions && (
            <section className={`${styles.section} ${styles.sectionAlert}`}>
              <h2 className={styles.sectionTitle}>
                <AlertTriangle size={14} /> Infractions reprochées
              </h2>
              <p className={styles.infractionsText}>{dossier.infractions}</p>
            </section>
          )}

          {/* Amendes */}
          {((dossier.amendeTotal && dossier.amendeTotal > 0) ||
            (dossier.amendePayee && dossier.amendePayee > 0) ||
            (dossier.amendeImpayee && dossier.amendeImpayee > 0)) && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Coins size={14} /> Amendes
              </h2>
              <div className={styles.amendesGrid}>
                <div className={styles.amendeCard}>
                  <div className={styles.amendeLabel}>Total</div>
                  <div className={styles.amendeValue}>{fmtMoney(dossier.amendeTotal)} ₽</div>
                </div>
                <div className={`${styles.amendeCard} ${styles.amendePaye}`}>
                  <div className={styles.amendeLabel}>Payé</div>
                  <div className={styles.amendeValue}>{fmtMoney(dossier.amendePayee)} ₽</div>
                </div>
                <div className={`${styles.amendeCard} ${styles.amendeImpaye}`}>
                  <div className={styles.amendeLabel}>Reste à payer</div>
                  <div className={styles.amendeValue}>{fmtMoney(dossier.amendeImpayee)} ₽</div>
                </div>
              </div>
            </section>
          )}

          {/* Notes */}
          {dossier.notes && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FileText size={14} /> Notes & Observations
              </h2>
              <p className={styles.notes}>{dossier.notes}</p>
            </section>
          )}

          {/* Métadonnées */}
          <section className={`${styles.section} ${styles.meta}`}>
            <h2 className={styles.sectionTitle}>
              <Calendar size={14} /> Métadonnées
            </h2>
            <div className={styles.kvGrid}>
              <KV label="Ouvert par" value={dossier.auteur ?? '—'} />
              <KV label="Date d'ouverture" value={fmtDateFR(dossier.date)} />
              <KV label="ID interne" value={String(dossier.id)} mono />
            </div>
          </section>
        </div>
      </article>

      {/* ─── Modale d'édition ─── */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={`Modifier le dossier de ${dossier.nom}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <label>
            Nom complet *
            <input
              type="text"
              value={form.nom ?? ''}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              autoFocus
            />
          </label>

          <div className={listStyles.row}>
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
                onChange={(e) => setForm({ ...form, statut: e.target.value as DossierStatut })}
              >
                {Object.entries(DOSSIER_STATUT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
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
            />
          </label>

          <div className={listStyles.row3}>
            <label>
              Amende totale (₽)
              <input
                type="number"
                value={form.amendeTotal ?? ''}
                onChange={(e) => setForm({ ...form, amendeTotal: e.target.value ? Number(e.target.value) : 0 })}
              />
            </label>
            <label>
              Amende payée (₽)
              <input
                type="number"
                value={form.amendePayee ?? ''}
                onChange={(e) => setForm({ ...form, amendePayee: e.target.value ? Number(e.target.value) : 0 })}
              />
            </label>
            <label>
              <span style={{ visibility: 'hidden' }}>X</span>
              <div className={listStyles.checkboxBox}>
                <input
                  type="checkbox"
                  id="defunt-check-edit"
                  checked={!!form.defunt}
                  onChange={(e) => setForm({ ...form, defunt: e.target.checked })}
                />
                <label htmlFor="defunt-check-edit" style={{ cursor: 'pointer' }}>⚱ Défunt</label>
              </div>
            </label>
          </div>

          <label>
            Notes / Observations
            <textarea
              rows={4}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <label>
            <Camera size={11} style={{ marginRight: 4, display: 'inline' }} />
            Photo (optionnel)
            <div className={listStyles.uploadZone}>
              {form.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photo} alt="Aperçu" className={listStyles.uploadPreview} />
              ) : (
                <div className={listStyles.uploadPlaceholder}>
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
                  className={listStyles.removePhoto}
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

// ─── KV sous-composant ───
function KV({
  label, value, mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  if (value === undefined || value === null || value === '' || value === '—') return null;
  return (
    <div className={styles.kv}>
      <div className={styles.kvLabel}>{label}</div>
      <div className={`${styles.kvValue} ${mono ? styles.kvMono : ''}`}>{value}</div>
    </div>
  );
}
