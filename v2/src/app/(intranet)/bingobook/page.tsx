'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page BINGO BOOK — registre officiel des fugitifs
 * ════════════════════════════════════════════════════════════════
 *
 * Lit/écrit `sunagakure/bingobook` (préfixe ajouté auto par db.ts).
 *
 * Structure de données : Firebase stocke un objet { id1: ninja1, id2: ninja2 }
 * et non un tableau (RTDB ne supporte pas bien les arrays).
 *
 * Pattern similaire à Patients (dbPush / dbUpdate / dbRemove par ID).
 * Mais ici l'ID est le `id` numérique du ninja (Date.now()), pas un push key.
 * On utilise donc dbSet(`bingobook/${id}`, ninja) pour respecter le format
 * de l'ancien intranet.
 *
 * Permissions :
 * - Voir / chercher / filtrer : tout le monde (connecté)
 * - Créer / modifier / supprimer : TOUS LES MEMBRES POLICE + Admin
 *   (action opérationnelle, pas réservée aux Gérants)
 *
 * 🔍 AUDIT LOG (Phase 2) :
 *   - create sur police:bingobook (nouvelle fiche)
 *   - update sur police:bingobook (modif fiche)
 *   - delete sur police:bingobook (retrait fiche)
 *   Note importante : si le statut passe à "tue" ou "capture", c'est tracé
 *   dans le diff de l'update — utile pour audit des neutralisations.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Skull, AlertTriangle } from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { RequireMembreBranche } from '@/components/Require';
import { dbSet, dbRemove } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type NinjaFiche,
  type DangerLevel,
  type NinjaStatus,
  type NinjaGrade,
  NINJA_GRADES,
  STATUS_LABEL,
} from '@/types/bingobook';

import styles from './page.module.css';

const FB_PATH = 'bingobook';
type DangerFilter = 'all' | DangerLevel;

export default function BingoBookPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const CURRENT_USER_ID = u.id;
  const { can } = u;

  // ─── Lecture temps réel ───
  const { data, loading } = useFirebaseValue<Record<string, NinjaFiche>>(FB_PATH);

  // ─── État local ───
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DangerFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<NinjaFiche>>({});

  // Permission : TOUS les membres Police (opérationnel)
  const canEdit = can.membreBranche('police');

  // ─── Liste filtrée ───
  const fiches = useMemo(() => {
    if (!data) return [];
    const arr = Object.values(data).filter(
      (f): f is NinjaFiche => f !== null && typeof f === 'object' && !!f.id
    );
    const q = search.trim().toLowerCase();
    return arr
      .filter((f) => {
        if (filter !== 'all' && f.danger !== filter) return false;
        if (!q) return true;
        const s = (
          (f.nom || '') +
          ' ' +
          (f.prenom || '') +
          ' ' +
          (f.grade || '') +
          ' ' +
          (f.village || '') +
          ' ' +
          (f.desc || '')
        ).toLowerCase();
        return s.includes(q);
      })
      .sort((a, b) => {
        // Tri : danger élevé d'abord, puis par date de création (récent en premier)
        const dangerOrder = { eleve: 0, moyen: 1, faible: 2 };
        const dA = dangerOrder[a.danger] ?? 3;
        const dB = dangerOrder[b.danger] ?? 3;
        if (dA !== dB) return dA - dB;
        return (b.createdAt ?? b.id ?? 0) - (a.createdAt ?? a.id ?? 0);
      });
  }, [data, search, filter]);

  // ─── Handlers ───
  function openCreate() {
    setEditingId(null);
    setForm({
      grade: 'Inconnu',
      danger: 'moyen',
      status: 'actif',
    });
    setShowForm(true);
  }

  function openEdit(f: NinjaFiche) {
    setEditingId(f.id);
    setForm(f);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  }

  // Helper : retrouve la fiche d'origine (pour le diff de l'update)
  function findOriginal(id: number): NinjaFiche | undefined {
    if (!data) return undefined;
    return Object.values(data).find((f): f is NinjaFiche => !!f && f.id === id);
  }

  async function handleSave() {
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    if (!form.danger) {
      toast.error('Le niveau de danger est obligatoire');
      return;
    }

    try {
      const now = Date.now();
      const oldFiche = editingId ? findOriginal(editingId) : undefined;

      const ficheToSave: NinjaFiche = {
        id: editingId ?? now,
        nom: form.nom!.trim(),
        prenom: form.prenom?.trim() || undefined,
        grade: form.grade || 'Inconnu',
        danger: form.danger,
        reward: form.reward,
        village: form.village?.trim() || undefined,
        status: form.status || 'actif',
        portrait: form.portrait,
        vu: form.vu?.trim() || undefined,
        desc: form.desc?.trim() || undefined,
        createdAt: editingId ? (form.createdAt ?? now) : now,
        updatedAt: now,
      };

      // Firebase clés ne peuvent pas contenir certains caractères, l'id étant
      // numérique on est tranquille.
      await dbSet(`${FB_PATH}/${ficheToSave.id}`, ficheToSave);

      // 🔍 Audit log
      const fullName = `${ficheToSave.prenom ? ficheToSave.prenom + ' ' : ''}${ficheToSave.nom}`;
      const dangerLbl = ficheToSave.danger.toUpperCase();
      const statusLbl = STATUS_LABEL[ficheToSave.status] || ficheToSave.status;

      if (editingId && oldFiche) {
        const changes: string[] = [];
        if (oldFiche.danger !== ficheToSave.danger) changes.push(`danger ${oldFiche.danger} → ${ficheToSave.danger}`);
        if (oldFiche.status !== ficheToSave.status) changes.push(`statut ${oldFiche.status} → ${ficheToSave.status}`);
        if ((oldFiche.reward || 0) !== (ficheToSave.reward || 0)) changes.push(`récompense ${oldFiche.reward || 0} → ${ficheToSave.reward || 0} ₽`);
        if (oldFiche.grade !== ficheToSave.grade) changes.push(`grade ${oldFiche.grade} → ${ficheToSave.grade}`);
        if ((oldFiche.desc || '') !== (ficheToSave.desc || '')) changes.push('description');
        if ((oldFiche.portrait || '') !== (ficheToSave.portrait || '')) changes.push('portrait');
        const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : ' (aucun changement détecté)';
        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'update',
          target: 'police:bingobook',
          targetId: String(ficheToSave.id),
          detail: `Bingo Book — Modification fiche ${fullName} (${dangerLbl}, ${statusLbl})${changeSummary}`,
        });
      } else {
        logAction({
          who: CURRENT_USER,
          whoId: CURRENT_USER_ID,
          action: 'create',
          target: 'police:bingobook',
          targetId: String(ficheToSave.id),
          detail: `Bingo Book — Nouvelle fiche ${fullName} — Danger ${dangerLbl}` +
            (ficheToSave.reward ? `, récompense ${ficheToSave.reward.toLocaleString('fr-FR')} ₽` : '') +
            (ficheToSave.village ? `, origine ${ficheToSave.village}` : ''),
        });
      }

      toast.success(editingId ? 'Fiche mise à jour' : 'Fiche créée');
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(f: NinjaFiche) {
    const ok = await confirmAction({
      title: 'Supprimer la fiche',
      message: `Retirer ${f.prenom ? f.prenom + ' ' : ''}${f.nom} du Bingo Book ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await dbRemove(`${FB_PATH}/${f.id}`);

      // 🔍 Audit log
      const fullName = `${f.prenom ? f.prenom + ' ' : ''}${f.nom}`;
      logAction({
        who: CURRENT_USER,
        whoId: CURRENT_USER_ID,
        action: 'delete',
        target: 'police:bingobook',
        targetId: String(f.id),
        detail: `Bingo Book — Suppression fiche ${fullName} ` +
          `(danger ${f.danger.toUpperCase()}, statut ${STATUS_LABEL[f.status] || f.status}` +
          (f.reward ? `, récompense ${f.reward.toLocaleString('fr-FR')} ₽` : '') + ')',
      });

      toast.success('Fiche supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  // ─── Upload portrait (compressé en base64) ───
  async function handlePortraitUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error("Le fichier n'est pas une image");
      return;
    }
    try {
      const dataUrl = await compressImage(file, 400, 0.75);
      setForm({ ...form, portrait: dataUrl });
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger l'image");
    }
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Bingo Book"
        subtitle="Registre officiel des fugitifs recherchés"
        actions={
          <RequireMembreBranche branche="police">
            <Button onClick={openCreate}>
              <Plus size={14} /> Ajouter une fiche
            </Button>
          </RequireMembreBranche>
        }
      >
        {/* Barre d'outils : recherche + filtres */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Rechercher un ninja…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.filters}>
            <button
              className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('all')}
            >
              Toutes
            </button>
            <button
              className={`${styles.fbtn} ${styles.fbtnEleve} ${filter === 'eleve' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('eleve')}
            >
              ⚠ Élevé
            </button>
            <button
              className={`${styles.fbtn} ${styles.fbtnMoyen} ${filter === 'moyen' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('moyen')}
            >
              ◆ Moyen
            </button>
            <button
              className={`${styles.fbtn} ${styles.fbtnFaible} ${filter === 'faible' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('faible')}
            >
              ▸ Faible
            </button>
          </div>
        </div>

        {/* Grille des fiches */}
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : fiches.length === 0 ? (
          <p className={styles.empty}>
            {search || filter !== 'all'
              ? 'Aucune fiche pour ces critères.'
              : "Aucune fiche dans le registre."}
          </p>
        ) : (
          <div className={styles.grid}>
            {fiches.map((f) => (
              <article
                key={f.id}
                className={`${styles.fiche} ${styles[`d-${f.danger}`]} ${f.status === 'tue' ? styles.dead : ''}`}
                onClick={() => canEdit && openEdit(f)}
                style={{ cursor: canEdit ? 'pointer' : 'default' }}
              >
                <div className={styles.ficheHeader}>
                  <span className={`${styles.dangerBadge} ${styles[`db-${f.danger}`]}`}>
                    {f.danger === 'eleve' && <AlertTriangle size={11} />}
                    {f.danger === 'eleve' ? 'ÉLEVÉ' : f.danger === 'moyen' ? 'MOYEN' : 'FAIBLE'}
                  </span>
                  {f.status === 'tue' && (
                    <span className={styles.deadBadge}>
                      <Skull size={11} /> NEUTRALISÉ
                    </span>
                  )}
                  {f.status === 'capture' && (
                    <span className={styles.capturedBadge}>CAPTURÉ</span>
                  )}
                  {f.status === 'evade' && (
                    <span className={styles.evadedBadge}>ÉVADÉ</span>
                  )}
                  <RequireMembreBranche branche="police">
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(f);
                      }}
                      aria-label="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </RequireMembreBranche>
                </div>

                <div className={styles.portrait}>
                  {f.portrait ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.portrait} alt={`Portrait de ${f.nom}`} />
                  ) : (
                    <div className={styles.portraitPlaceholder}>?</div>
                  )}
                </div>

                <div className={styles.identity}>
                  <h3>
                    {f.prenom && <span className={styles.prenom}>{f.prenom}</span>}
                    {f.nom}
                  </h3>
                  <div className={styles.subline}>
                    <span>{f.grade || 'Inconnu'}</span>
                    {f.village && (
                      <>
                        <span className={styles.sep}>•</span>
                        <span>{f.village}</span>
                      </>
                    )}
                  </div>
                </div>

                {typeof f.reward === 'number' && f.reward > 0 && (
                  <div className={styles.reward}>
                    <span className={styles.rewardLabel}>RÉCOMPENSE</span>
                    <span className={styles.rewardValue}>
                      {f.reward.toLocaleString('fr-FR')} ₽
                    </span>
                  </div>
                )}

                {f.desc && <p className={styles.desc}>{f.desc}</p>}
              </article>
            ))}
          </div>
        )}
      </Card>

      {/* Modale de création/édition */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier la fiche' : 'Nouvelle fiche ninja'}
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
          <div className={styles.row}>
            <label>
              Nom *
              <input
                type="text"
                value={form.nom ?? ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                autoFocus
                placeholder="Ex: Nagasawa"
              />
            </label>
            <label>
              Prénom
              <input
                type="text"
                value={form.prenom ?? ''}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                placeholder="Ex: Tsurizao"
              />
            </label>
          </div>

          <div className={styles.row3}>
            <label>
              Grade
              <select
                value={form.grade ?? 'Inconnu'}
                onChange={(e) =>
                  setForm({ ...form, grade: e.target.value as NinjaGrade })
                }
              >
                {NINJA_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Niveau de danger
              <select
                value={form.danger ?? 'moyen'}
                onChange={(e) =>
                  setForm({ ...form, danger: e.target.value as DangerLevel })
                }
              >
                <option value="eleve">⚠ Danger élevé</option>
                <option value="moyen">◆ Danger moyen</option>
                <option value="faible">▸ Danger faible</option>
              </select>
            </label>
            <label>
              Récompense (Ryos)
              <input
                type="number"
                value={form.reward ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    reward: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="25000"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              Village d&apos;origine
              <input
                type="text"
                value={form.village ?? ''}
                onChange={(e) => setForm({ ...form, village: e.target.value })}
                placeholder="Ex: Suna"
              />
            </label>
            <label>
              Statut actuel
              <select
                value={form.status ?? 'actif'}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as NinjaStatus })
                }
              >
                {(Object.entries(STATUS_LABEL) as [NinjaStatus, string][]).map(
                  ([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          <label>
            Portrait
            <div className={styles.uploadZone}>
              {form.portrait ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.portrait}
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
                  if (f) handlePortraitUpload(f);
                }}
              />
              {form.portrait && (
                <button
                  type="button"
                  className={styles.removePortrait}
                  onClick={(e) => {
                    e.preventDefault();
                    setForm({ ...form, portrait: undefined });
                  }}
                >
                  Retirer
                </button>
              )}
            </div>
          </label>

          <label>
            Vu pour la dernière fois
            <input
              type="text"
              value={form.vu ?? ''}
              onChange={(e) => setForm({ ...form, vu: e.target.value })}
              placeholder="Ex: Forêt interdite, secteur nord…"
            />
          </label>

          <label>
            Description / Rapport de signalement
            <textarea
              rows={4}
              value={form.desc ?? ''}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="Décris l'individu, ses techniques, ses crimes…"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}

// ─── Helpers ───

/**
 * Compresse une image avant upload (max 400px, qualité 0.75, WebP si supporté).
 * Évite de stocker des fichiers de 1+ Mo dans Firebase.
 */
function compressImage(
  file: File,
  maxSize: number,
  quality: number
): Promise<string> {
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

        // Essaie webp puis fallback jpeg
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
