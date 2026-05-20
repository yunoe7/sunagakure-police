'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page FICHE DOSSIER — Vue détaillée
 * ════════════════════════════════════════════════════════════════
 *
 * Route : /dossiers/[id]
 *
 * ✨ FEATURES :
 * - AJOUT BATCH : la modale "+ Ajouter" permet d'ajouter PLUSIEURS
 *   infractions d'un coup avant de valider
 * - L'édition individuelle reste en modale dédiée (bouton ✏️)
 * - AUTOCOMPLÉTION : nom du suspect depuis le Recensement
 * - LIEN : bouton "Voir la fiche recensé" dans les métadonnées
 * ════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Save, Camera, Plus,
  AlertTriangle, FileText, Coins, Calendar, Skull,
  ScrollText, Scale, BookOpen, FilePlus, Users, ExternalLink,
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
import type { Recense } from '@/types/recense';

import listStyles from '../page.module.css';
import styles from './page.module.css';

const FB_PATH = 'dossiers';
const FB_INFRACTIONS_PATH = 'infractions';
const FB_RECENSES_PATH = 'recenses';

// ─── Fuzzy match helper ───
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalize(needle.trim());
  if (!n) return false;
  const h = normalize(haystack);
  const words = n.split(/\s+/).filter(Boolean);
  return words.every((w) => h.includes(w));
}
function parseAmende(amendeStr?: string): number {
  if (!amendeStr) return 0;
  const match = amendeStr.match(/[\d\s,]+/);
  if (!match) return 0;
  return parseInt(match[0].replace(/[\s,]/g, ''), 10) || 0;
}

// Type local pour les items dans le batch
type BatchItem = DossierInfraction & { _localId: number };

export default function FicheDossierPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.membreBranche('police');

  const { data, loading } = useFirebaseValue<Dossier[] | null>(FB_PATH);
  const { data: codePenalData } = useFirebaseValue<Infraction[] | null>(FB_INFRACTIONS_PATH);
  const { data: recensesData } = useFirebaseValue<Recense[] | null>(FB_RECENSES_PATH);

  // ─── Modales ───
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Dossier>>({});

  // Mode BATCH
  const [showBatch, setShowBatch] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchSearch, setBatchSearch] = useState('');

  // Mode édition individuelle d'1 infraction existante
  const [editingInfractionId, setEditingInfractionId] = useState<number | null>(null);
  const [infrForm, setInfrForm] = useState<Partial<DossierInfraction>>({});
  const [showInfractionEdit, setShowInfractionEdit] = useState(false);

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

  const recenses = useMemo<Recense[]>(() => {
    if (!recensesData) return [];
    return (Array.isArray(recensesData) ? recensesData : Object.values(recensesData)).filter(
      (r): r is Recense => r !== null && typeof r === 'object' && !!r.id
    );
  }, [recensesData]);

  // Lien recensé du dossier
  const linkedRecense = useMemo(
    () => dossier?.recenseId ? recenses.find((r) => r.id === dossier.recenseId) : null,
    [dossier?.recenseId, recenses],
  );

  // Suggestions Recensement pour la modale d'édition
  const editRecenseSuggestions = useMemo<Recense[]>(() => {
    const q = (editForm.nom || '').trim();
    if (q.length < 2) return [];
    if (editForm.recenseId) {
      const picked = recenses.find((r) => r.id === editForm.recenseId);
      if (picked && normalize(`${picked.prenom} ${picked.nom}`) === normalize(q)) {
        return [];
      }
    }
    return recenses
      .filter((r) => fuzzyMatch(q, `${r.prenom || ''} ${r.nom || ''}`))
      .slice(0, 6);
  }, [editForm.nom, editForm.recenseId, recenses]);

  function pickRecenseEdit(r: Recense) {
    const nomComplet = `${r.prenom || ''} ${r.nom || ''}`.trim();
    setEditForm({
      ...editForm,
      nom: nomComplet,
      recenseId: r.id,
      photo: r.photo || editForm.photo,
    });
    toast.success(`"${nomComplet}" lié·e depuis le recensement`);
  }

  // ─── Migration auto à l'ouverture ───
  useEffect(() => {
    if (!dossier) return;
    if (dossier.infractionsList && dossier.infractionsList.length > 0) return;
    if (!dossier.infractions?.trim()) return;
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
      list[idx] = { ...list[idx], infractionsList: migrated };
      await dbSet(FB_PATH, list);
    } catch (err) {
      console.error('[Dossier] Erreur migration :', err);
    }
  }

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
      list[idx] = { ...list[idx], ...editForm, id } as Dossier;

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

  // ═══════════════════════════════════════════════════════════════
  //  MODE BATCH
  // ═══════════════════════════════════════════════════════════════

  function openBatch() {
    setBatchItems([]);
    setBatchSearch('');
    setShowBatch(true);
  }
  function closeBatch() {
    if (batchItems.length > 0) {
      const ok = window.confirm(`Tu as ${batchItems.length} infraction(s) en cours de saisie. Vraiment annuler ?`);
      if (!ok) return;
    }
    setShowBatch(false);
    setBatchItems([]);
    setBatchSearch('');
  }

  const batchSuggestions = useMemo<Infraction[]>(() => {
    const q = batchSearch.trim();
    if (q.length < 2) return [];
    return codePenal.filter((i) => fuzzyMatch(q, i.nom)).slice(0, 8);
  }, [batchSearch, codePenal]);

  function addFromCodePenal(cp: Infraction) {
    const newItem: BatchItem = {
      _localId: -Date.now() - Math.random(),
      id: 0,
      codePenalId: cp.id,
      cat: cp.cat as 'violet' | 'vert' | 'rouge' | 'noir',
      nom: cp.nom,
      gravite: catToGravite(cp.cat),
      date: Date.now(),
      amende: parseAmende(cp.amende),
      amendePayee: 0,
      prison: cp.prison === 'Oui' ? (cp.duree || 'Oui') : undefined,
      statut: 'impunie',
      notes: cp.notes || undefined,
    };
    setBatchItems([...batchItems, newItem]);
    setBatchSearch('');
  }

  function addEmptyInfraction() {
    const newItem: BatchItem = {
      _localId: -Date.now() - Math.random(),
      id: 0,
      nom: '',
      gravite: dossier?.danger || 'moyen',
      date: Date.now(),
      amende: 0,
      statut: 'impunie',
    };
    setBatchItems([...batchItems, newItem]);
  }

  function updateBatchItem(localId: number, updates: Partial<BatchItem>) {
    setBatchItems((items) =>
      items.map((it) => (it._localId === localId ? { ...it, ...updates } : it)),
    );
  }

  function removeBatchItem(localId: number) {
    setBatchItems((items) => items.filter((it) => it._localId !== localId));
  }

  async function handleSaveBatch() {
    if (!dossier) return;
    if (batchItems.length === 0) {
      toast.error('Ajoute au moins une infraction');
      return;
    }
    const invalid = batchItems.find((it) => !it.nom?.trim());
    if (invalid) {
      toast.error('Toutes les infractions doivent avoir un intitulé');
      return;
    }

    try {
      const list = [...all];
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) throw new Error('Introuvable');

      const current = list[idx];
      const currentInfractions = current.infractionsList || [];

      const now = Date.now();
      const newOnes: DossierInfraction[] = batchItems.map((it, i) => {
        const { _localId, ...rest } = it;
        return {
          ...rest,
          id: now + i,
          nom: it.nom.trim(),
          amende: Number(it.amende) || 0,
          amendePayee: Number(it.amendePayee) || 0,
          prison: it.prison?.trim() || undefined,
          notes: it.notes?.trim() || undefined,
        };
      });

      const newInfractions = [...currentInfractions, ...newOnes];
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
        action: 'create',
        target: 'dossier_infraction',
        targetId: String(id),
        detail: `Ajout de ${newOnes.length} infraction${newOnes.length > 1 ? 's' : ''} au dossier ${current.numeroDossier || id} : ${newOnes.map(i => i.nom).join(' ; ')}`,
      });

      await dbSet(FB_PATH, list);
      toast.success(`${newOnes.length} infraction${newOnes.length > 1 ? 's ajoutées' : ' ajoutée'} au casier`);
      setShowBatch(false);
      setBatchItems([]);
      setBatchSearch('');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  const batchTotal = useMemo(() => {
    return batchItems.reduce((sum, it) => sum + (Number(it.amende) || 0), 0);
  }, [batchItems]);

  // ═══════════════════════════════════════════════════════════════
  //  ÉDITION INDIVIDUELLE D'UNE INFRACTION
  // ═══════════════════════════════════════════════════════════════

  function openEditInfraction(inf: DossierInfraction) {
    setEditingInfractionId(inf.id);
    setInfrForm({ ...inf });
    setShowInfractionEdit(true);
  }
  function closeInfractionEdit() {
    setShowInfractionEdit(false);
    setEditingInfractionId(null);
    setInfrForm({});
  }

  const editSuggestions = useMemo<Infraction[]>(() => {
    const q = (infrForm.nom || '').trim();
    if (q.length < 2) return [];
    return codePenal.filter((i) => fuzzyMatch(q, i.nom)).slice(0, 8);
  }, [infrForm.nom, codePenal]);

  function pickFromCodePenalEdit(cp: Infraction) {
    setInfrForm({
      ...infrForm,
      codePenalId: cp.id,
      cat: cp.cat as 'violet' | 'vert' | 'rouge' | 'noir',
      nom: cp.nom,
      gravite: catToGravite(cp.cat),
      amende: parseAmende(cp.amende),
      prison: cp.prison === 'Oui' ? (cp.duree || 'Oui') : undefined,
      notes: cp.notes || infrForm.notes,
    });
    toast.success(`"${cp.nom}" pré-remplie`);
  }

  async function handleSaveEditInfraction() {
    if (!dossier || !editingInfractionId) return;
    if (!infrForm.nom?.trim()) {
      toast.error("L'intitulé est obligatoire");
      return;
    }
    try {
      const list = [...all];
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) throw new Error('Introuvable');

      const current = list[idx];
      const newInfractions = (current.infractionsList || []).map((i) =>
        i.id === editingInfractionId
          ? ({ ...i, ...infrForm, id: editingInfractionId } as DossierInfraction)
          : i,
      );

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
        action: 'update',
        target: 'dossier_infraction',
        targetId: String(editingInfractionId),
        detail: `Modification d'une infraction du dossier ${current.numeroDossier || id} : ${infrForm.nom}`,
      });

      await dbSet(FB_PATH, list);
      toast.success('Infraction modifiée');
      closeInfractionEdit();
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

      {/* Fiche */}
      <article
        className={`${styles.fiche} ${styles[dangerClass]} ${dossier.defunt ? styles.ficheDefunt : ''}`}
      >
        {dossier.statut === 'recherche' && !dossier.defunt && (
          <div className={styles.stamp}>RECHERCHÉ</div>
        )}
        {dossier.statut === 'garde_vue' && !dossier.defunt && (
          <div className={`${styles.stamp} ${styles.stampWarning}`}>GARDE À VUE</div>
        )}
        {dossier.defunt && (
          <div className={`${styles.stamp} ${styles.stampDefunt}`}>DÉFUNT</div>
        )}

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
                <button className={styles.addBtn} onClick={openBatch}>
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

          {dossier.notes && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FileText size={14} /> Observations
              </h2>
              <p className={styles.notes}>{dossier.notes}</p>
            </section>
          )}

          <section className={`${styles.section} ${styles.meta}`}>
            <h2 className={styles.sectionTitle}>
              <Calendar size={14} /> Métadonnées
            </h2>
            <div className={styles.kvGrid}>
              <KV label="Numéro de dossier" value={dossier.numeroDossier ?? '—'} mono />
              <KV label="Ouvert par" value={dossier.auteur ?? '—'} />
              <KV label="Date d'ouverture" value={fmtDateFR(dossier.date)} />
              <KV label="ID interne" value={String(dossier.id)} mono />
              {linkedRecense && (
                <KV
                  label="Recensé lié"
                  value={
                    <button
                      type="button"
                      className={styles.linkRecenseBtn}
                      onClick={() => router.push(`/recensement/${linkedRecense.id}`)}
                    >
                      <Users size={11} /> {linkedRecense.prenom} {linkedRecense.nom}
                      <ExternalLink size={10} />
                    </button>
                  }
                />
              )}
            </div>
          </section>
        </div>
      </article>

      {/* ═══ MODALE ÉDITION DU DOSSIER ═══ */}
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
              onChange={(e) => setEditForm({
                ...editForm,
                nom: e.target.value,
                recenseId: undefined,
              })}
              autoFocus
              placeholder="Prénom et nom (cherche dans le recensement)"
            />
          </label>

          {/* Suggestions Recensement */}
          {editRecenseSuggestions.length > 0 && (
            <div className={styles.suggestions}>
              <div className={styles.suggestionsLabel}>
                <BookOpen size={11} /> Suggestions du Recensement ({editRecenseSuggestions.length})
              </div>
              {editRecenseSuggestions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => pickRecenseEdit(r)}
                >
                  {r.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo} alt={`${r.prenom} ${r.nom}`} className={styles.editSuggestionPhoto} />
                  ) : (
                    <div className={styles.editSuggestionPhotoPh}>
                      {(r.prenom?.[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <div className={styles.suggInfo}>
                    <div className={styles.suggName}>{r.prenom} {r.nom}</div>
                    <div className={styles.suggMeta}>
                      {r.rang || 'Sans rang'}
                      {r.faction && ` · ${r.faction}`}
                      {r.clan && ` · Clan ${r.clan}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {(editForm.nom || '').trim().length >= 2 && editRecenseSuggestions.length === 0 && !editForm.recenseId && (
            <p className={styles.hintInline}>
              <em>Personne non recensée — saisie libre acceptée</em>
            </p>
          )}

          {/* Lien recensé déjà sélectionné */}
          {editForm.recenseId && (() => {
            const picked = recenses.find((r) => r.id === editForm.recenseId);
            if (!picked) return null;
            return (
              <div className={styles.editLinkedRecense}>
                <Users size={12} />
                <span>
                  Lié au recensé : <strong>{picked.prenom} {picked.nom}</strong>
                  {picked.rang && ` (${picked.rang})`}
                </span>
                <button
                  type="button"
                  className={styles.editUnlinkBtn}
                  onClick={() => setEditForm({ ...editForm, recenseId: undefined })}
                  title="Retirer le lien"
                >
                  ✕
                </button>
              </div>
            );
          })()}

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
            <Camera size={11} style={{ marginRight: 4, display: 'inline' }} /> Photo
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

      {/* ═══ MODALE BATCH ═══ */}
      <Modal
        open={showBatch}
        onClose={closeBatch}
        title="Ajouter des infractions"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeBatch}>Annuler</Button>
            <Button onClick={handleSaveBatch} disabled={batchItems.length === 0}>
              <Save size={14} />
              {batchItems.length === 0
                ? 'Aucune infraction à ajouter'
                : `Ajouter ${batchItems.length === 1 ? 'l\'infraction' : `les ${batchItems.length} infractions`} au casier`
              }
            </Button>
          </>
        }
      >
        <div className={styles.batchForm}>
          <div className={styles.batchSearchSection}>
            <label className={styles.infrFormLabel}>
              <BookOpen size={11} /> Rechercher dans le Code Pénal
            </label>
            <input
              type="text"
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              placeholder="Tape pour rechercher (ex: course, vol, coups...)"
              className={styles.infrInput}
            />

            {batchSuggestions.length > 0 && (
              <div className={styles.suggestions}>
                <div className={styles.suggestionsLabel}>
                  <BookOpen size={11} /> Click pour ajouter à la liste ({batchSuggestions.length})
                </div>
                {batchSuggestions.map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => addFromCodePenal(sug)}
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
                    <span className={styles.suggAdd}>+</span>
                  </button>
                ))}
              </div>
            )}

            {batchSearch.trim().length > 0 && batchSearch.trim().length < 2 && (
              <p className={styles.hintInline}>Tape au moins 2 lettres pour voir les suggestions</p>
            )}
            {batchSearch.trim().length >= 2 && batchSuggestions.length === 0 && (
              <p className={styles.hintInline}>
                <em>Aucune correspondance — tu peux ajouter une infraction libre ci-dessous</em>
              </p>
            )}

            <button type="button" className={styles.batchAddEmpty} onClick={addEmptyInfraction}>
              <FilePlus size={13} /> Ajouter une infraction libre (hors Code Pénal)
            </button>
          </div>

          {batchItems.length === 0 ? (
            <div className={styles.batchEmpty}>
              <ScrollText size={28} style={{ opacity: 0.3 }} />
              <p><em>Aucune infraction encore. Recherche ou ajout libre ci-dessus.</em></p>
            </div>
          ) : (
            <>
              <div className={styles.batchListHeader}>
                <span>📋 Infractions à ajouter au casier ({batchItems.length})</span>
                <span className={styles.batchTotal}>
                  Total : <strong>{fmtMoney(batchTotal)} ₽</strong>
                </span>
              </div>

              <div className={styles.batchList}>
                {batchItems.map((item, idx) => (
                  <div
                    key={item._localId}
                    className={`${styles.batchItem} ${styles[`infr-${item.gravite || 'moyen'}`]}`}
                  >
                    <div className={styles.batchItemHeader}>
                      <span className={styles.batchItemNum}>§ #{idx + 1}</span>
                      <input
                        type="text"
                        value={item.nom}
                        onChange={(e) => updateBatchItem(item._localId, { nom: e.target.value })}
                        placeholder="Intitulé de l'infraction *"
                        className={styles.batchItemTitle}
                      />
                      <button
                        type="button"
                        className={styles.batchItemRemove}
                        onClick={() => removeBatchItem(item._localId)}
                        title="Retirer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className={styles.batchItemFields}>
                      <div className={styles.batchField}>
                        <span className={styles.batchFieldLabel}>Gravité</span>
                        <select
                          value={item.gravite ?? 'moyen'}
                          onChange={(e) => updateBatchItem(item._localId, { gravite: e.target.value as DossierDanger })}
                          className={styles.batchInput}
                        >
                          <option value="faible">Faible</option>
                          <option value="moyen">Moyen</option>
                          <option value="eleve">Élevé</option>
                          <option value="critique">Critique</option>
                        </select>
                      </div>

                      <div className={styles.batchField}>
                        <span className={styles.batchFieldLabel}>Date</span>
                        <input
                          type="date"
                          value={item.date ? new Date(item.date).toISOString().slice(0, 10) : ''}
                          onChange={(e) => updateBatchItem(item._localId, {
                            date: e.target.value ? new Date(e.target.value).getTime() : undefined,
                          })}
                          className={styles.batchInput}
                        />
                      </div>

                      <div className={styles.batchField}>
                        <span className={styles.batchFieldLabel}>Amende (₽)</span>
                        <input
                          type="number"
                          value={item.amende ?? ''}
                          onChange={(e) => updateBatchItem(item._localId, {
                            amende: e.target.value ? Number(e.target.value) : 0,
                          })}
                          className={styles.batchInput}
                          placeholder="0"
                        />
                      </div>

                      <div className={styles.batchField}>
                        <span className={styles.batchFieldLabel}>Prison</span>
                        <input
                          type="text"
                          value={item.prison ?? ''}
                          onChange={(e) => updateBatchItem(item._localId, { prison: e.target.value })}
                          className={styles.batchInput}
                          placeholder="Ex: 3 jours"
                        />
                      </div>
                    </div>

                    <details className={styles.batchItemMore}>
                      <summary>Plus de détails (statut, notes)</summary>
                      <div className={styles.batchItemFields}>
                        <div className={styles.batchField}>
                          <span className={styles.batchFieldLabel}>Déjà payé (₽)</span>
                          <input
                            type="number"
                            value={item.amendePayee ?? ''}
                            onChange={(e) => updateBatchItem(item._localId, {
                              amendePayee: e.target.value ? Number(e.target.value) : 0,
                            })}
                            className={styles.batchInput}
                            placeholder="0"
                          />
                        </div>
                        <div className={`${styles.batchField} ${styles.batchFieldWide}`}>
                          <span className={styles.batchFieldLabel}>Statut</span>
                          <select
                            value={item.statut ?? 'impunie'}
                            onChange={(e) => updateBatchItem(item._localId, { statut: e.target.value as InfractionStatut })}
                            className={styles.batchInput}
                          >
                            {Object.entries(INFRACTION_STATUT_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className={styles.batchField} style={{ marginTop: 8 }}>
                        <span className={styles.batchFieldLabel}>Notes / Circonstances</span>
                        <textarea
                          value={item.notes ?? ''}
                          onChange={(e) => updateBatchItem(item._localId, { notes: e.target.value })}
                          className={styles.batchInput}
                          placeholder="Témoins, lieu, contexte…"
                          rows={2}
                        />
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ═══ MODALE ÉDITION 1 INFRACTION ═══ */}
      <Modal
        open={showInfractionEdit}
        onClose={closeInfractionEdit}
        title="Modifier l'infraction"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeInfractionEdit}>Annuler</Button>
            <Button onClick={handleSaveEditInfraction}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        <div className={styles.infrForm}>
          <div className={styles.infrFormField}>
            <label className={styles.infrFormLabel}>
              <Scale size={11} /> Intitulé de l&apos;infraction *
            </label>
            <input
              type="text"
              value={infrForm.nom ?? ''}
              onChange={(e) => setInfrForm({ ...infrForm, nom: e.target.value, codePenalId: undefined })}
              autoFocus
              className={styles.infrInput}
            />
            {editSuggestions.length > 0 && (
              <div className={styles.suggestions}>
                <div className={styles.suggestionsLabel}>
                  <BookOpen size={11} /> Suggestions du Code Pénal ({editSuggestions.length})
                </div>
                {editSuggestions.map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    className={`${styles.suggestion} ${infrForm.codePenalId === sug.id ? styles.suggestionPicked : ''}`}
                    onClick={() => pickFromCodePenalEdit(sug)}
                  >
                    <span className={`${styles.suggDot} ${styles[`dot-${sug.cat}`]}`} />
                    <div className={styles.suggInfo}>
                      <div className={styles.suggName}>{sug.nom}</div>
                      <div className={styles.suggMeta}>
                        {INFRACTION_CAT_LABEL[sug.cat as keyof typeof INFRACTION_CAT_LABEL] || sug.cat}
                        {sug.amende && ` · ${sug.amende}`}
                      </div>
                    </div>
                    {infrForm.codePenalId === sug.id && <span className={styles.suggCheck}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

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
              <label className={styles.infrFormLabel}>Date</label>
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
              <label className={styles.infrFormLabel}>Prison</label>
              <input
                type="text"
                value={infrForm.prison ?? ''}
                onChange={(e) => setInfrForm({ ...infrForm, prison: e.target.value })}
                className={styles.infrInput}
              />
            </div>
          </div>

          <div className={styles.infrFormField}>
            <label className={styles.infrFormLabel}>Statut</label>
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
            <label className={styles.infrFormLabel}>Notes</label>
            <textarea
              rows={2}
              value={infrForm.notes ?? ''}
              onChange={(e) => setInfrForm({ ...infrForm, notes: e.target.value })}
              className={styles.infrInput}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

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
