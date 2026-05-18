'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page PLAINTES — Registre des plaintes citoyennes
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/plaintes (TABLEAU)
 *
 * Page avec onglets par statut :
 *   - Ouvertes (à traiter)
 *   - En cours (assignées à un agent)
 *   - Fermées (résolues)
 *   - Transmises (au Tribunal)
 *
 * Actions :
 *   - Déposer une plainte (formulaire complet)
 *   - Prendre en charge (ouverte → en_cours)
 *   - Clôturer (en_cours → fermee)
 *   - Transmettre au Tribunal (ouverte/en_cours → transmise_tribunal)
 *   - Voir détails (modale en lecture seule, sauf admin)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Search,
  FileText,
  AlertCircle,
  CheckCircle2,
  Scale,
  User as UserIcon,
  Calendar,
  Camera,
  Eye,
  ShieldAlert,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Plainte,
  type PlainteStatut,
  type PlainteType,
  type PlainteCible,
  PLAINTE_TYPES,
  PLAINTE_STATUT_LABEL,
  nextPlainteRef,
} from '@/types/plainte';

import styles from './page.module.css';

const FB_PATH = 'plaintes';
const CURRENT_USER = 'Ninja';

type Tab = PlainteStatut | 'all';

export default function PlaintesPage() {
  const { data, loading } = useFirebaseValue<Plainte[] | null>(FB_PATH);

  const [tab, setTab] = useState<Tab>('ouverte');
  const [search, setSearch] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Plainte>>({});

  // Viewer state
  const [viewingId, setViewingId] = useState<number | null>(null);

  // ─── Données normalisées ───
  const allPlaintes = useMemo<Plainte[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (p): p is Plainte => p !== null && typeof p === 'object' && !!p.id
    );
  }, [data]);

  // Compteurs par statut pour les onglets
  const counts = useMemo(() => {
    const c = { all: 0, ouverte: 0, en_cours: 0, fermee: 0, transmise_tribunal: 0 };
    for (const p of allPlaintes) {
      c.all++;
      if (p.statut in c) c[p.statut as keyof typeof c]++;
    }
    return c;
  }, [allPlaintes]);

  // Liste filtrée selon onglet + recherche
  const visiblePlaintes = useMemo(() => {
    let list = allPlaintes;
    if (tab !== 'all') list = list.filter((p) => p.statut === tab);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const s = (
          (p.ref || '') +
          ' ' +
          (p.plaignant || '') +
          ' ' +
          (p.accuse || '') +
          ' ' +
          (p.type || '') +
          ' ' +
          (p.desc || '')
        ).toLowerCase();
        return s.includes(q);
      });
    }

    return [...list].sort((a, b) => (b.date ?? b.id) - (a.date ?? a.id));
  }, [allPlaintes, tab, search]);

  const viewing = viewingId ? allPlaintes.find((p) => p.id === viewingId) : null;

  // ─── Helpers ───
  function getCurrentList(): Plainte[] {
    return allPlaintes.map((p) => ({ ...p }));
  }

  async function persistAll(list: Plainte[]) {
    await dbSet(FB_PATH, list);
  }

  // ─── Handlers CRUD ───
  function openCreate() {
    setEditingId(null);
    setForm({
      type: 'Vol',
      cible: 'Citoyen',
      statut: 'ouverte',
    });
    setShowForm(true);
  }

  function openEdit(p: Plainte) {
    setEditingId(p.id);
    setForm(p);
    setShowForm(true);
    setViewingId(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  }

  async function handleSave() {
    if (!form.plaignant?.trim() || !form.accuse?.trim() || !form.desc?.trim()) {
      toast.error('Plaignant, accusé et description sont obligatoires');
      return;
    }

    try {
      const list = getCurrentList();
      const now = Date.now();

      if (editingId) {
        const idx = list.findIndex((p) => p.id === editingId);
        if (idx === -1) throw new Error('Plainte introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Plainte;
        await persistAll(list);
        toast.success('Plainte mise à jour');
      } else {
        const newPlainte: Plainte = {
          id: now,
          ref: nextPlainteRef(list),
          plaignant: form.plaignant!.trim(),
          accuse: form.accuse!.trim(),
          type: form.type || 'Autre',
          desc: form.desc!.trim(),
          dateFaits: form.dateFaits || undefined,
          cible: (form.cible as PlainteCible) || 'Citoyen',
          statut: 'ouverte',
          auteur: CURRENT_USER,
          date: now,
          photoAccuse: form.photoAccuse || undefined,
        };
        list.push(newPlainte);
        await persistAll(list);
        toast.success(`Plainte ${newPlainte.ref} enregistrée`);
      }
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(p: Plainte) {
    const ok = await confirmAction({
      title: 'Supprimer la plainte',
      message: `Supprimer la plainte ${p.ref || '#' + p.id} ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const list = getCurrentList().filter((x) => x.id !== p.id);
      await persistAll(list);
      toast.success('Plainte supprimée');
      if (viewingId === p.id) setViewingId(null);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  // ─── Workflow ───
  async function setStatut(p: Plainte, newStatut: PlainteStatut) {
    try {
      const list = getCurrentList();
      const idx = list.findIndex((x) => x.id === p.id);
      if (idx === -1) return;

      const updated: Plainte = { ...list[idx], statut: newStatut };

      // Auto-assignation quand on prend en charge
      if (newStatut === 'en_cours' && !updated.agent) {
        updated.agent = CURRENT_USER;
      }
      if (newStatut === 'fermee') {
        updated.agentCloture = CURRENT_USER;
      }

      list[idx] = updated;
      await persistAll(list);

      const messages: Record<PlainteStatut, string> = {
        ouverte: 'Plainte rouverte',
        en_cours: "Plainte prise en charge",
        fermee: 'Plainte clôturée',
        transmise_tribunal: 'Plainte transmise au Tribunal',
      };
      toast.success(messages[newStatut]);
    } catch {
      toast.error('Erreur');
    }
  }

  // ─── Upload photo accusé ───
  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error("Le fichier n'est pas une image");
      return;
    }
    try {
      const dataUrl = await compressImage(file, 400, 0.75);
      setForm({ ...form, photoAccuse: dataUrl });
    } catch {
      toast.error('Impossible de charger l\'image');
    }
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Plaintes"
        subtitle="Registre des plaintes citoyennes"
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> Déposer une plainte
          </Button>
        }
      >
        {/* Onglets par statut */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'ouverte' ? styles.tabActive : ''}`}
            onClick={() => setTab('ouverte')}
          >
            <AlertCircle size={14} />
            <span>Ouvertes</span>
            <span className={styles.tabCount}>{counts.ouverte}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'en_cours' ? styles.tabActive : ''}`}
            onClick={() => setTab('en_cours')}
          >
            <ShieldAlert size={14} />
            <span>En cours</span>
            <span className={styles.tabCount}>{counts.en_cours}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'fermee' ? styles.tabActive : ''}`}
            onClick={() => setTab('fermee')}
          >
            <CheckCircle2 size={14} />
            <span>Fermées</span>
            <span className={styles.tabCount}>{counts.fermee}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'transmise_tribunal' ? styles.tabActive : ''}`}
            onClick={() => setTab('transmise_tribunal')}
          >
            <Scale size={14} />
            <span>Tribunal</span>
            <span className={styles.tabCount}>{counts.transmise_tribunal}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
            onClick={() => setTab('all')}
          >
            <FileText size={14} />
            <span>Toutes</span>
            <span className={styles.tabCount}>{counts.all}</span>
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchBox}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Rechercher par ref, plaignant, accusé, type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Liste */}
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visiblePlaintes.length === 0 ? (
          <div className={styles.empty}>
            <FileText size={32} style={{ opacity: 0.3 }} />
            <p>
              {search
                ? 'Aucune plainte pour cette recherche.'
                : tab === 'ouverte'
                  ? 'Aucune plainte ouverte.'
                  : tab === 'en_cours'
                    ? 'Aucune plainte en cours d\'enquête.'
                    : tab === 'fermee'
                      ? 'Aucune plainte fermée.'
                      : tab === 'transmise_tribunal'
                        ? 'Aucune plainte transmise au Tribunal.'
                        : 'Aucune plainte enregistrée.'}
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {visiblePlaintes.map((p) => (
              <article
                key={p.id}
                className={`${styles.plainte} ${styles[`st-${p.statut}`]}`}
                onClick={() => setViewingId(p.id)}
              >
                <div className={styles.plainteRef}>
                  <span className={styles.refTxt}>{p.ref || `#${p.id}`}</span>
                  <span className={`${styles.statutChip} ${styles[`chip-${p.statut}`]}`}>
                    {PLAINTE_STATUT_LABEL[p.statut]}
                  </span>
                </div>

                <div className={styles.plainteBody}>
                  <div className={styles.parties}>
                    <div className={styles.party}>
                      <span className={styles.partyLabel}>Plaignant</span>
                      <strong>{p.plaignant}</strong>
                    </div>
                    <div className={styles.partyArrow}>vs</div>
                    <div className={styles.party}>
                      <span className={styles.partyLabel}>Accusé</span>
                      <strong>{p.accuse}</strong>
                    </div>
                  </div>

                  <div className={styles.plainteInfo}>
                    <span className={styles.typeChip}>{p.type}</span>
                    {p.dateFaits && (
                      <span className={styles.metaTxt}>
                        <Calendar size={11} /> Faits : {fmtDateFR(p.dateFaits)}
                      </span>
                    )}
                    {p.agent && (
                      <span className={styles.metaTxt}>
                        <UserIcon size={11} /> Agent : {p.agent}
                      </span>
                    )}
                  </div>

                  {p.desc && <p className={styles.plainteDesc}>{p.desc}</p>}
                </div>

                <button
                  className={styles.eyeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingId(p.id);
                  }}
                  aria-label="Voir détails"
                >
                  <Eye size={14} />
                </button>
              </article>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Modale de LECTURE ─── */}
      <Modal
        open={!!viewing}
        onClose={() => setViewingId(null)}
        title={viewing ? `Plainte ${viewing.ref || '#' + viewing.id}` : ''}
        size="lg"
        footer={
          viewing && (
            <>
              <Button variant="ghost" onClick={() => handleDelete(viewing)}>
                <Trash2 size={14} /> Supprimer
              </Button>
              <Button variant="outline" onClick={() => openEdit(viewing)}>
                Modifier
              </Button>
              <div style={{ flex: 1 }} />
              {viewing.statut === 'ouverte' && (
                <Button onClick={() => setStatut(viewing, 'en_cours')}>
                  Prendre en charge
                </Button>
              )}
              {viewing.statut === 'en_cours' && (
                <Button onClick={() => setStatut(viewing, 'fermee')}>
                  <CheckCircle2 size={14} /> Clôturer
                </Button>
              )}
              {(viewing.statut === 'ouverte' || viewing.statut === 'en_cours') && (
                <Button variant="secondary" onClick={() => setStatut(viewing, 'transmise_tribunal')}>
                  <Scale size={14} /> Tribunal
                </Button>
              )}
            </>
          )
        }
      >
        {viewing && (
          <div className={styles.viewer}>
            {viewing.photoAccuse && (
              <div className={styles.viewerPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewing.photoAccuse} alt="Photo de l'accusé" />
                <div className={styles.viewerPhotoLabel}>Photo de l&apos;accusé</div>
              </div>
            )}

            <div className={styles.viewerGrid}>
              <Field label="Plaignant" value={viewing.plaignant} />
              <Field label="Accusé" value={viewing.accuse} />
              <Field label="Type" value={viewing.type} />
              <Field
                label="Date des faits"
                value={viewing.dateFaits ? fmtDateFR(viewing.dateFaits) : '—'}
              />
              <Field
                label="Statut"
                value={
                  <span
                    className={`${styles.statutChip} ${styles[`chip-${viewing.statut}`]}`}
                  >
                    {PLAINTE_STATUT_LABEL[viewing.statut]}
                  </span>
                }
              />
              <Field label="Cible" value={viewing.cible || '—'} />
              <Field label="Déposée par" value={viewing.auteur || '—'} />
              <Field
                label="Agent en charge"
                value={
                  viewing.agent ? (
                    <span style={{ color: 'var(--green)' }}>{viewing.agent}</span>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>Non assigné</span>
                  )
                }
              />
            </div>

            <div className={styles.viewerDesc}>
              <div className={styles.fieldLabel}>Description des faits</div>
              <p>{viewing.desc}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Modale FORMULAIRE ─── */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier la plainte' : 'Déposer une plainte'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>
              Annuler
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Enregistrer la plainte
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>
              Plaignant *
              <input
                type="text"
                value={form.plaignant ?? ''}
                onChange={(e) => setForm({ ...form, plaignant: e.target.value })}
                autoFocus
                placeholder="Nom du plaignant"
              />
            </label>
            <label>
              Accusé *
              <input
                type="text"
                value={form.accuse ?? ''}
                onChange={(e) => setForm({ ...form, accuse: e.target.value })}
                placeholder="Nom de l'accusé"
              />
            </label>
          </div>

          <div className={styles.row3}>
            <label>
              Type d&apos;infraction
              <select
                value={form.type ?? 'Vol'}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as PlainteType })
                }
              >
                {PLAINTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cible
              <select
                value={form.cible ?? 'Citoyen'}
                onChange={(e) =>
                  setForm({ ...form, cible: e.target.value as PlainteCible })
                }
              >
                <option value="Citoyen">Citoyen</option>
                <option value="Agent">Agent</option>
                <option value="Inconnu">Inconnu</option>
              </select>
            </label>
            <label>
              Date des faits
              <input
                type="date"
                value={form.dateFaits ?? ''}
                onChange={(e) => setForm({ ...form, dateFaits: e.target.value })}
              />
            </label>
          </div>

          <label>
            Description détaillée *
            <textarea
              rows={5}
              value={form.desc ?? ''}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="Décris les faits avec précision (lieu, témoins, déroulement…)"
            />
          </label>

          <label>
            <Camera size={11} style={{ marginRight: 4, display: 'inline' }} />
            Photo de l&apos;accusé (optionnel)
            <div className={styles.uploadZone}>
              {form.photoAccuse ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.photoAccuse}
                  alt="Aperçu"
                  className={styles.uploadPreview}
                />
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
              {form.photoAccuse && (
                <button
                  type="button"
                  className={styles.removePhoto}
                  onClick={(e) => {
                    e.preventDefault();
                    setForm({ ...form, photoAccuse: undefined });
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

// ─── Sous-composants ───
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className={styles.fieldLabel}>{label}</div>
      <div className={styles.fieldValue}>{value}</div>
    </div>
  );
}

// ─── Helpers ───
function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas non supporté'));
        ctx.drawImage(img, 0, 0, width, height);
        let url = canvas.toDataURL('image/webp', quality);
        if (!url.startsWith('data:image/webp')) {
          url = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(url);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
