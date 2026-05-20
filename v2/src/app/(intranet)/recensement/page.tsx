'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page RECENSEMENT — Registre officiel des habitants
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/recenses (TABLEAU, format legacy)
 *
 * ✨ Pattern "vue détaillée" :
 *   - Clic sur une fiche → navigation vers /recensement/[id]
 *   - Bouton "Recenser" → modale de création rapide
 *   - Suppression → directement depuis la card (avec confirm)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Save, Search, Camera, Skull, Scroll,
  AlertTriangle, Users,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { compressImage } from '@/lib/image';
import {
  type Recense, type DefuntStatut,
  NATURES_CHAKRA, RANGS, SEXES, DEFUNT_STATUT_LABEL,
  isDefunt, isCriminel,
} from '@/types/recense';

import styles from './page.module.css';

const FB_PATH = 'recenses';
type ViewFilter = 'all' | 'vivants' | 'defunts' | 'criminels';

export default function RecensementPage() {
  const router = useRouter();
  const CURRENT_USER = useCurrentUser().displayName;
  const { data, loading } = useFirebaseValue<Recense[] | null>(FB_PATH);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ViewFilter>('all');
  const [rangFilter, setRangFilter] = useState<string>('all');

  // Modale uniquement pour la CRÉATION (l'édition se fait sur la page dédiée)
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Recense>>({});

  const all = useMemo<Recense[]>(
    () =>
      (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
        (r): r is Recense => r !== null && typeof r === 'object' && !!r.id
      ),
    [data]
  );

  const stats = useMemo(() => {
    const total = all.length;
    const factions = new Set(all.map((r) => (r.faction || '').trim()).filter(Boolean)).size;
    const criminels = all.filter(isCriminel).length;
    const defunts = all.filter(isDefunt).length;
    return { total, factions, criminels, defunts };
  }, [all]);

  const visible = useMemo(() => {
    let list = all;

    if (filter === 'vivants') list = list.filter((r) => !isDefunt(r));
    else if (filter === 'defunts') list = list.filter(isDefunt);
    else if (filter === 'criminels') list = list.filter(isCriminel);

    if (rangFilter !== 'all') list = list.filter((r) => r.rang === rangFilter);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (
          (r.prenom || '') + ' ' +
          (r.nom || '') + ' ' +
          (r.faction || '') + ' ' +
          (r.rang || '') + ' ' +
          (r.competences || '') + ' ' +
          (r.metier || '') + ' ' +
          (r.clan || '') + ' ' +
          (r.titre || '') + ' ' +
          (r.notes || '') + ' ' +
          (r.natures || []).join(' ')
        ).toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      const da = isDefunt(a) ? 1 : 0;
      const db = isDefunt(b) ? 1 : 0;
      if (da !== db) return da - db;
      return (a.nom || '').localeCompare(b.nom || '');
    });
  }, [all, search, filter, rangFilter]);

  function openCreate() {
    setForm({ sexe: 'Masculin', rang: 'Genin', natures: [], defuntStatut: '' });
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

    const key = (form.prenom + '|' + form.nom).toLowerCase().trim();
    const dup = all.some(
      (r) => ((r.prenom || '') + '|' + (r.nom || '')).toLowerCase().trim() === key
    );
    if (dup) {
      const ok = await confirmAction({
        title: 'Doublon détecté',
        message: `Une fiche existe déjà au nom de "${form.prenom} ${form.nom}". Voulez-vous quand même créer une nouvelle fiche ?`,
        confirmLabel: 'Créer quand même',
      });
      if (!ok) return;
    }

    try {
      const now = Date.now();
      const newRecense: Recense = {
        id: now,
        prenom: form.prenom!.trim(),
        nom: form.nom!.trim(),
        age: form.age || undefined,
        sexe: form.sexe || 'Masculin',
        faction: form.faction?.trim() || undefined,
        rang: form.rang || 'Inconnu',
        competences: form.competences?.trim() || undefined,
        natures: form.natures && form.natures.length > 0 ? form.natures : undefined,
        notes: form.notes?.trim() || undefined,
        photo: form.photo || undefined,
        titre: form.titre?.trim() || undefined,
        metier: form.metier?.trim() || undefined,
        clan: form.clan?.trim() || undefined,
        defuntStatut: form.defuntStatut || '',
        auteur: CURRENT_USER,
        date: now,
      };

      await dbSet(FB_PATH, [...all, newRecense]);
      toast.success('Personne recensée');
      closeForm();
      // Navigation immédiate vers la fiche créée
      router.push(`/recensement/${now}`);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(r: Recense, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirmAction({
      title: 'Supprimer la fiche',
      message: `Supprimer définitivement la fiche de ${r.prenom} ${r.nom} ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== r.id));
      toast.success('Fiche supprimée');
    } catch {
      toast.error('Erreur');
    }
  }

  function openFiche(r: Recense) {
    router.push(`/recensement/${r.id}`);
  }

  return (
    <>
      <Card
        title="Recensement"
        subtitle="Registre officiel des habitants de Sunagakure"
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> Recenser une personne
          </Button>
        }
      >
        {/* Stats hero */}
        <div className={styles.statGrid}>
          <div className={`${styles.statCard} ${styles.scPurple}`}>
            <Users size={16} />
            <div className={styles.statVal}>{stats.total}</div>
            <div className={styles.statLbl}>Total recensés</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Scroll size={16} />
            <div className={styles.statVal}>{stats.factions}</div>
            <div className={styles.statLbl}>Factions</div>
          </div>
          <div className={`${styles.statCard} ${styles.scDanger}`}>
            <AlertTriangle size={16} />
            <div className={styles.statVal}>{stats.criminels}</div>
            <div className={styles.statLbl}>Criminels</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGray}`}>
            <Skull size={16} />
            <div className={styles.statVal}>{stats.defunts}</div>
            <div className={styles.statLbl}>Défunts/Disparus</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Nom, faction, métier, nature, clan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.filters}>
            <button
              className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('all')}
            >
              Tous
            </button>
            <button
              className={`${styles.fbtn} ${styles.fbVivants} ${filter === 'vivants' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('vivants')}
            >
              🟢 Vivants
            </button>
            <button
              className={`${styles.fbtn} ${styles.fbDefunts} ${filter === 'defunts' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('defunts')}
            >
              ⚱ Défunts
            </button>
            <button
              className={`${styles.fbtn} ${styles.fbCriminels} ${filter === 'criminels' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('criminels')}
            >
              ⚠ Criminels
            </button>
          </div>
          <select
            className={styles.filterSelect}
            value={rangFilter}
            onChange={(e) => setRangFilter(e.target.value)}
          >
            <option value="all">Tous rangs</option>
            {RANGS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className={styles.resultCount}>
          {visible.length} résultat{visible.length > 1 ? 's' : ''}
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Users size={32} style={{ opacity: 0.3 }} />
            <p>
              {search || filter !== 'all' || rangFilter !== 'all'
                ? 'Aucun recensé pour ces critères.'
                : 'Aucun recensé. Ajoute la première fiche !'}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visible.map((r) => {
              const defunt = isDefunt(r);
              const criminel = isCriminel(r);
              return (
                <article
                  key={r.id}
                  className={`${styles.fiche} ${defunt ? styles.ficheDefunt : ''} ${criminel ? styles.ficheCriminel : ''}`}
                  onClick={() => openFiche(r)}
                >
                  <div className={styles.ficheTop}>
                    {r.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photo} alt={`${r.prenom} ${r.nom}`} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        {(r.prenom?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(r, e)}
                      aria-label="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className={styles.ficheBody}>
                    <h3>
                      {r.prenom} <strong>{r.nom}</strong>
                    </h3>
                    {r.titre && <div className={styles.titre}>« {r.titre} »</div>}

                    <div className={styles.tags}>
                      {r.rang && (
                        <span className={`${styles.tag} ${styles.tagRang}`}>{r.rang}</span>
                      )}
                      {r.faction && (
                        <span className={`${styles.tag} ${styles.tagFaction}`}>{r.faction}</span>
                      )}
                      {r.clan && (
                        <span className={`${styles.tag} ${styles.tagClan}`}>{r.clan}</span>
                      )}
                    </div>

                    {r.metier && <div className={styles.metier}>💼 {r.metier}</div>}

                    {r.natures && r.natures.length > 0 && (
                      <div className={styles.natures}>
                        {r.natures.slice(0, 4).map((n) => (
                          <span key={n} className={styles.natureChip}>{n}</span>
                        ))}
                        {r.natures.length > 4 && (
                          <span className={styles.natureChipMore}>+{r.natures.length - 4}</span>
                        )}
                      </div>
                    )}

                    {r.competences && (
                      <p className={styles.competences}>{r.competences}</p>
                    )}

                    {defunt && r.defuntStatut && (
                      <div className={styles.defuntBadge}>
                        {DEFUNT_STATUT_LABEL[r.defuntStatut]}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modale de CRÉATION uniquement (édition sur page dédiée) */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title="Recenser une personne"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
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

          <div className={styles.row3}>
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

          <div className={styles.row}>
            <label>
              Faction / Affiliation
              <input
                type="text"
                value={form.faction ?? ''}
                onChange={(e) => setForm({ ...form, faction: e.target.value })}
                placeholder="Sunagakure, Akatsuki, déserteur, civil…"
              />
            </label>
            <label>
              Titre / Surnom
              <input
                type="text"
                value={form.titre ?? ''}
                onChange={(e) => setForm({ ...form, titre: e.target.value })}
                placeholder="Ex: La Lame de Suna"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              Métier
              <input
                type="text"
                value={form.metier ?? ''}
                onChange={(e) => setForm({ ...form, metier: e.target.value })}
                placeholder="Forgeron, médecin, marchand…"
              />
            </label>
            <label>
              Clan
              <input
                type="text"
                value={form.clan ?? ''}
                onChange={(e) => setForm({ ...form, clan: e.target.value })}
                placeholder="Ex: Sabaku, Kazekage…"
              />
            </label>
          </div>

          <label>
            Compétences principales
            <input
              type="text"
              value={form.competences ?? ''}
              onChange={(e) => setForm({ ...form, competences: e.target.value })}
              placeholder="Combat rapproché, Infiltration, Médecine ninja…"
            />
          </label>

          <div>
            <div className={styles.naturesLabel}>
              Natures de chakra & Maîtrises
              <small> — cochez tout ce qui s&apos;applique</small>
            </div>
            <div className={styles.naturesGrid}>
              {NATURES_CHAKRA.map((n) => {
                const checked = (form.natures || []).includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.natureBtn} ${checked ? styles.natureBtnOn : ''}`}
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
              placeholder="Antécédents, comportement, missions notables…"
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
