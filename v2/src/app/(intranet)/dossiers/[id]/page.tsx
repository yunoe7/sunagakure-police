'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page FICHE DOSSIER — Vue détaillée
 * ════════════════════════════════════════════════════════════════
 *
 * Route : /dossiers/[id]
 *
 * ✨ NOUVEAUTÉS :
 * - Casier criminel = liste structurée d'infractions
 * - Modale "Ajouter infraction" avec autocomplétion Code Pénal
 * - Migration auto de l'ancien champ "infractions" (string)
 * - Style "rapport police vintage" (sépia, rouille)
 * ════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Save, Camera, Plus,
  User, AlertTriangle, FileText, Coins, Calendar, Skull,
  ScrollText, Scale, Search, X, BookOpen,
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
  type Dossier, type DossierDanger, type DossierStatut, type DossierInfraction,
  type InfractionStatut,
  DANGER_LABEL, DOSSIER_STATUT_LABEL, INFRACTION_STATUT_LABEL,
  fmtMoney, fmtDateFR, computeAmendeTotals, migrateInfractionsString, catToGravite,
} from '@/types/dossier';
import { type Infraction, INFRACTION_CAT_LABEL } from '@/types/infraction';

import listStyles from '../page.module.css';
import styles from './page.module.css';

const FB_PATH = 'dossiers';
const FB_INFRACTIONS_PATH = 'infractions'; // Code Pénal

// ─── Fuzzy match helper (ignore accents + casse) ───
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // retire les diacritiques
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalize(needle.trim());
  if (!n) return false;
  const h = normalize(haystack);
  // Match si tous les mots du needle sont présents dans haystack
  const words = n.split(/\s+/).filter(Boolean);
  return words.every((w) => h.includes(w));
}

// ─── Parse l'amende string du Code Pénal (ex: "500 ryos") ───
function parseAmende(amendeStr?: string): number {
  if (!amendeStr) return 0;
  const match = amendeStr.match(/[\d\s,]+/);
  if (!match) return 0;
  return parseInt(match[0].replace(/[\s,]/g, ''), 10) || 0;
}

export default function FicheDossierPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.membreBranche('police');

  const { data, loading } = useFirebaseValue<Dossier[] | null>(FB_PATH);
  const { data: codePenalData } = useFirebaseValue<Infraction[] | null>(FB_INFRACTIONS_PATH);

  // Modales
  const [showEdit, setShowEdit] = useState(false);
  const [showInfraction, setShowInfraction] = useState(false);
  const [editingInfractionId, setEditingInfractionId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Dossier>>({});
  const [infrForm, setInfrForm] = useState<Partial<DossierInfraction>>({});

  const all = useMemo<Dossier[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (d): d is Dossier => d !== null && typeof d === 'object' && !!d.id
    );
  }, [data]);

  const dossier = useMemo(() => all.find((d) => d.id === id) || null, [all, id]);

  const codePenal = useMemo<Infraction[]>(() => {
    if (!codePenalData) return [];
    return (Array.isArray(codePenalData) ? codePenalData : Object.values(codePenalData)).filter(
      (i): i is Infraction => i !== null && typeof i === 'object' && !!i.id
    );
  }, [codePenalData]);

  // ─── Migration auto à l'ouverture de la fiche ───
  useEffect(() => {
    if (!dossier) return;
    if (dossier.infractionsList && dossier.infractionsList.length > 0) return;
    if (!dossier.infractions?.trim()) return;
    // On a une ancienne string mais pas de liste : on migre auto
    migrateThisDossier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier?.id]);

  async function migrateThisDossier() {
    if (!dossier) return;
    try {
      const migrated = migrateInfractionsString(
        dossier.infractions,
        dossier.danger,
        dossier.amendeTotal,
      );
      if (migrated.length === 0) return;

      const list = [...all];
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) return;
      list[idx] = {
        ...list[idx],
        infractionsList: migrated,
        // On peut garder infractions string en backup ou la vider
      };
      await dbSet(FB_PATH, list);
      console.log('[Dossier] Migration auto effectuée pour', dossier.numeroDossier || dossier.id);
    } catch (err) {
      console.error('[Dossier] Erreur migration :', err);
    }
  }

  // ─── Suggestions pour l'autocomplétion ───
  const suggestions = useMemo<Infraction[]>(() => {
    const q = (infrForm.nom || '').trim();
    if (q.length < 2) return [];
    return codePenal
      .filter((i) => fuzzyMatch(q, i.nom))
      .slice(0, 8);
  }, [infrForm.nom, codePenal]);

  // ─── HANDLERS : ÉDITION DU DOSSIER ───
  function openEdit() {
    if (!dossier) return;
    setEditForm({ ...dossier });
    setShowEdit(true);
  }

  function closeEdit() {
    setShowEdit(false);
    setEditForm({});
  }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error("Ce n'est pas une image");
      return;
    }
    try {
      const dataUrl = await compressImage(file, 400, 0.75);
      setEditForm({ ...editForm, photo: dataUrl });
    } catch {
      toast.error("Impossible de charger l'image");
    }
  }

  async function handleSaveEdit() {
    if (!editForm.nom?.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    try {
      const list = [...all];
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) throw new Error('Introuvable');

      list[idx] = {
        ...list[idx],
        ...editForm,
        id,
      } as Dossier;

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'update',
        target: 'dossier',
        targetId: String(id),
        detail: `Modification du dossier ${dossier?.numeroDossier || id} de ${editForm.nom!.trim()}`,
      });

      await dbSet(FB_PATH, list);
      toast.success('Dossier mis à jour');
      closeEdit();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete() {
    if (!dossier) return;
    const ok = await confirmAction({
      title: 'Supprimer le dossier',
      message: `Supprimer définitivement le dossier ${dossier.numeroDossier || ''} de ${dossier.nom} ? Cette action est irréversible.`,
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
        detail: `Suppression du dossier ${dossier.numeroDossier || id} de ${dossier.nom}`,
      });

      await dbSet(FB_PATH, all.filter((x) => x.id !== id));
      toast.success('Dossier supprimé');
      router.push('/dossiers');
    } catch {
      toast.error('Erreur');
    }
  }

  // ─── HANDLERS : INFRACTIONS ───
  function openAddInfraction() {
    setEditingInfractionId(null);
    setInfrForm({
      gravite: dossier?.danger || 'moyen',
      date: Date.now(),
      statut: 'impunie',
    });
    setShowInfraction(true);
  }

  function openEditInfraction(inf: DossierInfraction) {
    setEditingInfractionId(inf.id);
    setInfrForm({ ...inf });
    setShowInfraction(true);
  }

  function closeInfraction() {
    setShowInfraction(false);
    setEditingInfractionId(null);
    setInfrForm({});
  }

  function pickFromCodePenal(cp: Infraction) {
    setInfrForm({
      ...infrForm,
      codePenalId: cp.id,
      cat: (cp.cat as 'violet' | 'vert' | 'rouge' | 'noir'),
      nom: cp.nom,
      gravite: catToGravite(cp.cat),
      amende: parseAmende(cp.amende),
      prison: cp.prison === 'Oui' ? (cp.duree || 'Oui') : undefined,
      notes: cp.notes || infrForm.notes,
    });
    toast.success(`Infraction "${cp.nom}" pré-remplie`);
  }

  async function handleSaveInfraction() {
    if (!dossier) return;
    if (!infrForm.nom?.trim()) {
      toast.error("L'intitulé de l'infraction est obligatoire");
      return;
    }
    try {
      const list = [...all];
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) throw new Error('Introuvable');

      const current = list[idx];
      const currentInfractions = current.infractionsList || [];
      let newInfractions: DossierInfraction[];

      if (editingInfractionId) {
        newInfractions = currentInfractions.map((i) =>
          i.id === editingInfractionId
            ? ({ ...i, ...infrForm, id: editingInfractionId } as DossierInfraction)
            : i,
        );
      } else {
        newInfractions = [
          ...currentInfractions,
          {
            id: Date.now(),
            nom: infrForm.nom!.trim(),
            codePenalId: infrForm.codePenalId,
            cat: infrForm.cat,
            gravite: infrForm.gravite || 'moyen',
            date: infrForm.date || Date.now(),
            amende: Number(infrForm.amende) || 0,
            amendePayee: Number(infrForm.amendePayee) || 0,
            prison: infrForm.prison?.trim() || undefined,
            statut: infrForm.statut || 'impunie',
            notes: infrForm.notes?.trim() || undefined,
          },
        ];
      }

      // Recalcule les totaux
      const totals = computeAmendeTotals(newInfractions);

      list[idx] = {
        ...current,
        infractionsList: newInfractions,
        amendeTotal: totals.total,
        amendePayee: totals.payee,
        amendeImpayee: totals.impayee,
      };

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: editingInfractionId ? 'update' : 'create',
        target: 'dossier_infraction',
        targetId: String(editingInfractionId ?? Date.now()),
        detail: editingInfractionId
          ? `Modification d'une infraction sur le dossier ${current.numeroDossier || id} : ${infrForm.nom}`
          : `Ajout d'une infraction au dossier ${current.numeroDossier || id} : ${infrForm.nom}`,
      });

      await dbSet(FB_PATH, list);
      toast.success(editingInfractionId ? 'Infraction modifiée' : 'Infraction ajoutée');
      closeInfraction();
    } catch (err) {
      console.error(err);
      toast.error('Erreur');
    }
  }

  async function handleDeleteInfraction(inf: DossierInfraction) {
    if (!dossier) return;
    const ok = await confirmAction({
      title: "Retirer l'infraction",
      message: `Retirer "${inf.nom}" du casier ? Cette action est irréversible.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const list = [...all];
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) return;

      const newInfractions = (list[idx].infractionsList || []).filter((i) => i.id !== inf.id);
      const totals = computeAmendeTotals(newInfractions);

      list[idx] = {
        ...list[idx],
        infractionsList: newInfractions,
        amendeTotal: totals.total,
        amendePayee: totals.payee,
        amendeImpayee: totals.impayee,
      };

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'delete',
        target: 'dossier_infraction',
        targetId: String(inf.id),
        detail: `Retrait d'une infraction du dossier ${dossier.numeroDossier || id} : ${inf.nom}`,
      });

      await dbSet(FB_PATH, list);
      toast.success('Infraction retirée');
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
  const infractions = dossier.infractionsList || [];
  const totals = computeAmendeTotals(infractions);

  return (
    <>
      {/* Barre d'actions sticky */}
      <div className={styles.actionsBar}>
        <button className={styles.backBtn} onClick={() => router.push('/dossiers')}>
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
        {/* Cachets en surimpression sur le header */}
        {dossier.statut === 'recherche' && !dossier.defunt && (
          <div className={styles.stamp}>RECHERCHÉ</div>
        )}
        {dossier.statut === 'garde_vue' && !dossier.defunt && (
          <div className={`${styles.stamp} ${styles.stampWarning}`}>GARDE À VUE</div>
        )}
        {dossier.defunt && (
          <div className={`${styles.stamp} ${styles.stampDefunt}`}>DÉFUNT</div>
        )}

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
            {dossier.numeroDossier && (
              <div className={styles.dossierTab}>
                <FileText size={11} />
                <span className={styles.dossierNum}>{dossier.numeroDossier}</span>
              </div>
            )}
            <h1 className={styles.name}>{dossier.nom}</h1>
            <div className={styles.tags}>
              <span className={`${styles.tag} ${styles[`db-${dossier.danger}`]}`}>
                {(dossier.danger === 'critique' || dossier.danger === 'eleve') && (
                  <AlertTriangle size={11} />
                )}
                Danger {DANGER_LABEL[dossier.danger]}
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
          {/* CASIER CRIMINEL */}
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <ScrollText size={14} /> Casier criminel
                {infractions.length > 0 && (
                  <span className={styles.sectionCount}>
                    {infractions.length} infraction{infractions.length > 1 ? 's' : ''}
                  </span>
                )}
              </h2>
              {canEdit && (
                <button className={styles.addBtn} onClick={openAddInfraction}>
                  <Plus size={12} /> Ajouter
                </button>
              )}
            </div>

            {infractions.length === 0 ? (
              <p className={styles.emptyInfractions}>
                <em>Aucune infraction enregistrée dans ce casier.</em>
              </p>
            ) : (
              <div className={styles.infractionsList}>
                {infractions.map((inf, idx) => (
                  <article
                    key={inf.id}
                    className={`${styles.infractionCard} ${styles[`infr-${inf.gravite || 'moyen'}`]}`}
                  >
                    <div className={styles.infrHeader}>
                      <span className={styles.infrNum}>§ #{idx + 1}</span>
                      <h4 className={styles.infrTitle}>{inf.nom}</h4>
                      {inf.gravite && (
                        <span className={`${styles.infrGravite} ${styles[`db-${inf.gravite}`]}`}>
                          {DANGER_LABEL[inf.gravite]}
                        </span>
                      )}
                      {canEdit && (
                        <div className={styles.infrActions}>
                          <button
                            className={styles.infrEditBtn}
                            onClick={() => openEditInfraction(inf)}
                            title="Modifier"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            className={styles.infrDelBtn}
                            onClick={() => handleDeleteInfraction(inf)}
                            title="Retirer"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={styles.infrDetails}>
                      {inf.date && (
                        <span className={styles.infrDetail}>
                          <Calendar size={10} /> {fmtDateFR(inf.date)}
                        </span>
                      )}
                      {inf.amende !== undefined && inf.amende > 0 && (
                        <span className={styles.infrDetail}>
                          <Coins size={10} /> {fmtMoney(inf.amende)} ₽
                          {inf.amendePayee && inf.amendePayee > 0 && (
                            <em> (payé : {fmtMoney(inf.amendePayee)} ₽)</em>
                          )}
                        </span>
                      )}
                      {inf.prison && (
                        <span className={styles.infrDetail}>
                          <Scale size={10} /> {inf.prison}
                        </span>
                      )}
                      {inf.statut && (
                        <span className={`${styles.infrStatut} ${styles[`statut-${inf.statut}`]}`}>
                          {INFRACTION_STATUT_LABEL[inf.statut]}
                        </span>
                      )}
                    </div>
                    {inf.notes && (
                      <p className={styles.infrNotes}>{inf.notes}</p>
                    )}
                  </article>
                ))}

                {/* Totaux des amendes */}
                {totals.total > 0 && (
                  <div className={styles.totalsBar}>
                    <div className={styles.totalItem}>
                      <span>TOTAL</span>
                      <strong>{fmtMoney(totals.total)} ₽</strong>
                    </div>
                    <div className={styles.totalItem}>
                      <span>PAYÉ</span>
                      <strong className={styles.totalPaye}>{fmtMoney(totals.payee)} ₽</strong>
                    </div>
                    <div className={styles.totalItem}>
                      <span>RESTE À PAYER</span>
                      <strong className={styles.totalImpaye}>{fmtMoney(totals.impayee)} ₽</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Notes */}
          {dossier.notes && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FileText size={14} /> Observations
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
              <KV label="Numéro de dossier" value={dossier.numeroDossier ?? '—'} mono />
              <KV label="Ouvert par" value={dossier.auteur ?? '—'} />
              <KV label="Date d'ouverture" value={fmtDateFR(dossier.date)} />
              <KV label="ID interne" value={String(dossier.id)} mono />
            </div>
          </section>
        </div>
      </article>

      {/* ═══ MODALE D'ÉDITION DU DOSSIER ═══ */}
      <Modal
        open={showEdit}
        onClose={closeEdit}
        title={`Modifier le dossier de ${dossier.nom}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeEdit}>Annuler</Button>
            <Button onClick={handleSaveEdit}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <label>
            Nom complet *
            <input
              type="text"
              value={editForm.nom ?? ''}
              onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
              autoFocus
            />
          </label>

          <div className={listStyles.row}>
            <label>
              Niveau de danger
              <select
                value={editForm.danger ?? 'moyen'}
                onChange={(e) => setEditForm({ ...editForm, danger: e.target.value as DossierDanger })}
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
                value={editForm.statut ?? 'ouvert'}
                onChange={(e) => setEditForm({ ...editForm, statut: e.target.value as DossierStatut })}
              >
                {Object.entries(DOSSIER_STATUT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>

          <label>
            <input
              type="checkbox"
              id="defunt-check"
              checked={!!editForm.defunt}
              onChange={(e) => setEditForm({ ...editForm, defunt: e.target.checked })}
              style={{ marginRight: 8 }}
            />
            ⚱ Marquer comme défunt
          </label>

          <label>
            Observations
            <textarea
              rows={4}
              value={editForm.notes ?? ''}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </label>

          <label>
            <Camera size={11} style={{ marginRight: 4, display: 'inline' }} />
            Photo
            <div className={listStyles.uploadZone}>
              {editForm.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editForm.photo} alt="Aperçu" className={listStyles.uploadPreview} />
              ) : (
                <div className={listStyles.uploadPlaceholder}>📷 Cliquer pour choisir une image</div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoUpload(f);
                }}
              />
              {editForm.photo && (
                <button
                  type="button"
                  className={listStyles.removePhoto}
                  onClick={(e) => {
                    e.preventDefault();
                    setEditForm({ ...editForm, photo: undefined });
                  }}
                >
                  Retirer
                </button>
              )}
            </div>
          </label>
        </div>
      </Modal>

      {/* ═══ MODALE INFRACTION (avec autocomplétion) ═══ */}
      <Modal
        open={showInfraction}
        onClose={closeInfraction}
        title={editingInfractionId ? 'Modifier une infraction' : 'Ajouter une infraction'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeInfraction}>Annuler</Button>
            <Button onClick={handleSaveInfraction}>
              <Save size={14} /> {editingInfractionId ? 'Enregistrer' : 'Ajouter au casier'}
            </Button>
          </>
        }
      >
        <div className={styles.infrForm}>
          {/* Intitulé + suggestions */}
          <div className={styles.infrFormField}>
            <label className={styles.infrFormLabel}>
              <Scale size={11} /> Intitulé de l&apos;infraction *
            </label>
            <input
              type="text"
              value={infrForm.nom ?? ''}
              onChange={(e) => setInfrForm({ ...infrForm, nom: e.target.value, codePenalId: undefined })}
              autoFocus
              placeholder="Tape pour rechercher dans le Code Pénal..."
              className={styles.infrInput}
            />

            {/* Suggestions Code Pénal */}
            {suggestions.length > 0 && (
              <div className={styles.suggestions}>
                <div className={styles.suggestionsLabel}>
                  <BookOpen size={11} /> Suggestions du Code Pénal ({suggestions.length})
                </div>
                {suggestions.map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    className={`${styles.suggestion} ${infrForm.codePenalId === sug.id ? styles.suggestionPicked : ''}`}
                    onClick={() => pickFromCodePenal(sug)}
                  >
                    <span className={`${styles.suggDot} ${styles[`dot-${sug.cat}`]}`} />
                    <div className={styles.suggInfo}>
                      <div className={styles.suggName}>{sug.nom}</div>
                      <div className={styles.suggMeta}>
                        {INFRACTION_CAT_LABEL[sug.cat as keyof typeof INFRACTION_CAT_LABEL] || sug.cat}
                        {sug.amende && ` · ${sug.amende}`}
                        {sug.prison === 'Oui' && sug.duree && ` · Prison : ${sug.duree}`}
                      </div>
                    </div>
                    {infrForm.codePenalId === sug.id && <span className={styles.suggCheck}>✓</span>}
                  </button>
                ))}
              </div>
            )}

            {(infrForm.nom || '').trim().length > 0 && (infrForm.nom || '').trim().length < 2 && (
              <p className={styles.hintInline}>Tape au moins 2 lettres pour voir les suggestions du Code Pénal</p>
            )}

            {(infrForm.nom || '').trim().length >= 2 && suggestions.length === 0 && (
              <p className={styles.hintInline}>
                <em>Aucune correspondance dans le Code Pénal — saisie libre acceptée</em>
              </p>
            )}
          </div>

          {/* Gravité + Date */}
          <div className={styles.infrFormRow}>
            <div className={styles.infrFormField}>
              <label className={styles.infrFormLabel}>Gravité</label>
              <select
                value={infrForm.gravite ?? 'moyen'}
                onChange={(e) => setInfrForm({ ...infrForm, gravite: e.target.value as DossierDanger })}
                className={styles.infrInput}
              >
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="eleve">Élevé</option>
                <option value="critique">Critique</option>
              </select>
            </div>
            <div className={styles.infrFormField}>
              <label className={styles.infrFormLabel}>Date de l&apos;acte</label>
              <input
                type="date"
                value={infrForm.date ? new Date(infrForm.date).toISOString().slice(0, 10) : ''}
                onChange={(e) => setInfrForm({
                  ...infrForm,
                  date: e.target.value ? new Date(e.target.value).getTime() : undefined,
                })}
                className={styles.infrInput}
              />
            </div>
          </div>

          {/* Amende + Payé + Prison */}
          <div className={styles.infrFormRow3}>
            <div className={styles.infrFormField}>
              <label className={styles.infrFormLabel}>Amende (₽)</label>
              <input
                type="number"
                value={infrForm.amende ?? ''}
                onChange={(e) => setInfrForm({ ...infrForm, amende: e.target.value ? Number(e.target.value) : 0 })}
                className={styles.infrInput}
              />
            </div>
            <div className={styles.infrFormField}>
              <label className={styles.infrFormLabel}>Déjà payé (₽)</label>
              <input
                type="number"
                value={infrForm.amendePayee ?? ''}
                onChange={(e) => setInfrForm({ ...infrForm, amendePayee: e.target.value ? Number(e.target.value) : 0 })}
                className={styles.infrInput}
              />
            </div>
            <div className={styles.infrFormField}>
              <label className={styles.infrFormLabel}>Peine de prison</label>
              <input
                type="text"
                value={infrForm.prison ?? ''}
                onChange={(e) => setInfrForm({ ...infrForm, prison: e.target.value })}
                placeholder="Ex: 3 jours"
                className={styles.infrInput}
              />
            </div>
          </div>

          {/* Statut + Notes */}
          <div className={styles.infrFormField}>
            <label className={styles.infrFormLabel}>Statut de l&apos;infraction</label>
            <select
              value={infrForm.statut ?? 'impunie'}
              onChange={(e) => setInfrForm({ ...infrForm, statut: e.target.value as InfractionStatut })}
              className={styles.infrInput}
            >
              {Object.entries(INFRACTION_STATUT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className={styles.infrFormField}>
            <label className={styles.infrFormLabel}>Notes / Circonstances</label>
            <textarea
              rows={2}
              value={infrForm.notes ?? ''}
              onChange={(e) => setInfrForm({ ...infrForm, notes: e.target.value })}
              placeholder="Témoins, contexte, lieu…"
              className={styles.infrInput}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── KV sous-composant ───
function KV({ label, value, mono }: {
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
