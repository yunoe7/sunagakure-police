'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page FICHE RECENSÉ — Vue détaillée + Édition
 * ════════════════════════════════════════════════════════════════
 *
 * Route : /recensement/[id]
 *
 * Affiche une fiche complète en plein écran (lecture par défaut).
 * Bouton "Modifier" pour passer en mode édition (modale).
 * Bouton "Retour" pour revenir à la liste.
 *
 * 📱 Responsive mobile-friendly.
 * 🖨️ Idéal pour screenshot/print/RP.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Save, Camera,
  User, Briefcase, Sparkles, FileText, Calendar,
  AlertTriangle, Skull,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { compressImage } from '@/lib/image';
import {
  type Recense, type DefuntStatut,
  NATURES_CHAKRA, RANGS, SEXES, DEFUNT_STATUT_LABEL,
  fmtDateFR, isDefunt, isCriminel,
} from '@/types/recense';

import listStyles from '../page.module.css';
import styles from './page.module.css';

const FB_PATH = 'recenses';

export default function FicheRecensePage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const CURRENT_USER = useCurrentUser().displayName;

  const { data, loading } = useFirebaseValue<Recense[] | null>(FB_PATH);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Recense>>({});

  const all = useMemo<Recense[]>(
    () =>
      (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
        (r): r is Recense => r !== null && typeof r === 'object' && !!r.id
      ),
    [data]
  );

  const recense = useMemo(() => all.find((r) => r.id === id) || null, [all, id]);

  function openEdit() {
    if (!recense) return;
    setForm({ ...recense, natures: recense.natures || [] });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm({});
  }

  function toggleNature(n: string) {
    const current = form.natures || [];
    if (current.includes(n)) {
      setForm({ ...form, natures: current.filter((x) => x !== n) });
    } else {
      setForm({ ...form, natures: [...current, n] });
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

  async function handleSave() {
    if (!form.prenom?.trim() || !form.nom?.trim()) {
      toast.error('Prénom et nom sont obligatoires');
      return;
    }
    try {
      const list = [...all];
      const idx = list.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error('Introuvable');
      list[idx] = { ...list[idx], ...form, id } as Recense;
      await dbSet(FB_PATH, list);
      toast.success('Fiche mise à jour');
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete() {
    if (!recense) return;
    const ok = await confirmAction({
      title: 'Supprimer la fiche',
      message: `Supprimer définitivement la fiche de ${recense.prenom} ${recense.nom} ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== id));
      toast.success('Fiche supprimée');
      router.push('/recensement');
    } catch {
      toast.error('Erreur');
    }
  }

  // ─── États de chargement / introuvable ───
  if (loading) {
    return (
      <div className={styles.loading}>
        <p>Chargement de la fiche…</p>
      </div>
    );
  }

  if (!recense) {
    return (
      <div className={styles.notFound}>
        <h2>Fiche introuvable</h2>
        <p>La fiche demandée n&apos;existe pas ou a été supprimée.</p>
        <Button onClick={() => router.push('/recensement')}>
          <ArrowLeft size={14} /> Retour au recensement
        </Button>
      </div>
    );
  }

  const defunt = isDefunt(recense);
  const criminel = isCriminel(recense);

  return (
    <>
      {/* Barre d'actions sticky */}
      <div className={styles.actionsBar}>
        <button
          className={styles.backBtn}
          onClick={() => router.push('/recensement')}
        >
          <ArrowLeft size={16} />
          <span className={styles.backLabel}>Retour au recensement</span>
          <span className={styles.backLabelMobile}>Retour</span>
        </button>
        <div className={styles.actionsRight}>
          <button className={styles.editBtn} onClick={openEdit}>
            <Pencil size={14} /> Modifier
          </button>
          <button className={styles.delBtn} onClick={handleDelete}>
            <Trash2 size={14} />
            <span className={styles.delLabel}>Supprimer</span>
          </button>
        </div>
      </div>

      {/* Fiche complète */}
      <article
        className={`${styles.fiche} ${defunt ? styles.ficheDefunt : ''} ${criminel ? styles.ficheCriminel : ''}`}
      >
        {/* ─── HEADER ─── */}
        <header className={styles.header}>
          {recense.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={recense.photo} alt={`${recense.prenom} ${recense.nom}`} className={styles.photo} />
          ) : (
            <div className={styles.photoPlaceholder}>
              {(recense.prenom?.[0] || '?').toUpperCase()}
            </div>
          )}
          <div className={styles.headerInfo}>
            <h1 className={styles.name}>
              {recense.prenom} <strong>{recense.nom}</strong>
            </h1>
            {recense.titre && (
              <div className={styles.titre}>« {recense.titre} »</div>
            )}
            <div className={styles.tags}>
              {recense.rang && (
                <span className={`${styles.tag} ${styles.tagRang}`}>{recense.rang}</span>
              )}
              {recense.faction && (
                <span className={`${styles.tag} ${styles.tagFaction}`}>{recense.faction}</span>
              )}
              {recense.clan && (
                <span className={`${styles.tag} ${styles.tagClan}`}>{recense.clan}</span>
              )}
              {criminel && (
                <span className={`${styles.tag} ${styles.tagDanger}`}>
                  <AlertTriangle size={11} /> Criminel
                </span>
              )}
              {defunt && (
                <span className={`${styles.tag} ${styles.tagDefunt}`}>
                  <Skull size={11} /> {DEFUNT_STATUT_LABEL[recense.defuntStatut || '']}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ─── SECTIONS ─── */}
        <div className={styles.sections}>
          {/* État civil */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <User size={14} /> État civil
            </h2>
            <div className={styles.kvGrid}>
              <KV label="Prénom" value={recense.prenom} />
              <KV label="Nom" value={recense.nom} />
              <KV label="Âge" value={recense.age} />
              <KV label="Sexe" value={recense.sexe} />
              <KV label="Faction" value={recense.faction} />
              <KV label="Rang" value={recense.rang} />
              <KV label="Clan" value={recense.clan} />
              <KV label="Titre / Surnom" value={recense.titre} />
            </div>
          </section>

          {/* Profession */}
          {(recense.metier || recense.competences) && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Briefcase size={14} /> Profession & Compétences
              </h2>
              <div className={styles.kvGrid}>
                <KV label="Métier" value={recense.metier} fullWidth />
                <KV label="Compétences principales" value={recense.competences} fullWidth />
              </div>
            </section>
          )}

          {/* Natures de chakra */}
          {recense.natures && recense.natures.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Sparkles size={14} /> Natures de chakra & Maîtrises
              </h2>
              <div className={styles.naturesList}>
                {recense.natures.map((n) => (
                  <span key={n} className={styles.natureBadge}>{n}</span>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          {recense.notes && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FileText size={14} /> Notes & Observations
              </h2>
              <p className={styles.notes}>{recense.notes}</p>
            </section>
          )}

          {/* Métadonnées */}
          <section className={`${styles.section} ${styles.meta}`}>
            <h2 className={styles.sectionTitle}>
              <Calendar size={14} /> Métadonnées
            </h2>
            <div className={styles.kvGrid}>
              <KV label="Recensé par" value={recense.auteur ?? '—'} />
              <KV label="Date d'enregistrement" value={fmtDateFR(recense.date)} />
              <KV label="ID interne" value={String(recense.id)} mono />
              <KV label="Statut" value={DEFUNT_STATUT_LABEL[recense.defuntStatut || '']} />
            </div>
          </section>
        </div>
      </article>

      {/* ─── Modale d'édition ─── */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={`Modifier la fiche de ${recense.prenom} ${recense.nom}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <div className={listStyles.row}>
            <label>
              Prénom *
              <input
                type="text"
                value={form.prenom ?? ''}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              Nom *
              <input
                type="text"
                value={form.nom ?? ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </label>
          </div>

          <div className={listStyles.row3}>
            <label>
              Âge
              <input
                type="text"
                value={form.age ?? ''}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />
            </label>
            <label>
              Sexe
              <select
                value={form.sexe ?? 'Masculin'}
                onChange={(e) => setForm({ ...form, sexe: e.target.value })}
              >
                {SEXES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Rang
              <select
                value={form.rang ?? 'Genin'}
                onChange={(e) => setForm({ ...form, rang: e.target.value })}
              >
                {RANGS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={listStyles.row}>
            <label>
              Faction / Affiliation
              <input
                type="text"
                value={form.faction ?? ''}
                onChange={(e) => setForm({ ...form, faction: e.target.value })}
              />
            </label>
            <label>
              Titre / Surnom
              <input
                type="text"
                value={form.titre ?? ''}
                onChange={(e) => setForm({ ...form, titre: e.target.value })}
              />
            </label>
          </div>

          <div className={listStyles.row}>
            <label>
              Métier
              <input
                type="text"
                value={form.metier ?? ''}
                onChange={(e) => setForm({ ...form, metier: e.target.value })}
              />
            </label>
            <label>
              Clan
              <input
                type="text"
                value={form.clan ?? ''}
                onChange={(e) => setForm({ ...form, clan: e.target.value })}
              />
            </label>
          </div>

          <label>
            Compétences principales
            <input
              type="text"
              value={form.competences ?? ''}
              onChange={(e) => setForm({ ...form, competences: e.target.value })}
            />
          </label>

          <div>
            <div className={listStyles.naturesLabel}>
              Natures de chakra & Maîtrises
              <small> — cochez tout ce qui s&apos;applique</small>
            </div>
            <div className={listStyles.naturesGrid}>
              {NATURES_CHAKRA.map((n) => {
                const checked = (form.natures || []).includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    className={`${listStyles.natureBtn} ${checked ? listStyles.natureBtnOn : ''}`}
                    onClick={() => toggleNature(n)}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <label>
            Statut de vie
            <select
              value={form.defuntStatut ?? ''}
              onChange={(e) => setForm({ ...form, defuntStatut: e.target.value as DefuntStatut })}
            >
              {(Object.keys(DEFUNT_STATUT_LABEL) as DefuntStatut[]).map((s) => (
                <option key={s} value={s}>{DEFUNT_STATUT_LABEL[s]}</option>
              ))}
            </select>
          </label>

          <label>
            Notes / Observations
            <textarea
              rows={3}
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

// ─── Sous-composant clé-valeur ───
function KV({
  label,
  value,
  fullWidth,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
  mono?: boolean;
}) {
  if (value === undefined || value === null || value === '' || value === '—') return null;
  return (
    <div className={`${styles.kv} ${fullWidth ? styles.kvFull : ''}`}>
      <div className={styles.kvLabel}>{label}</div>
      <div className={`${styles.kvValue} ${mono ? styles.kvMono : ''}`}>{value}</div>
    </div>
  );
}
