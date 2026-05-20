'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page FICHE CASIER — Vue détaillée
 * ════════════════════════════════════════════════════════════════
 *
 * Route : /police/casiers/[id]
 *
 * Sections :
 * 1. Header identité (avec photo + lien recensé)
 * 2. 📜 Antécédents — infractions consolidées (auto depuis dossiers + manuelles)
 * 3. ⚖️ Décisions de justice
 * 4. 📌 Notes officielles (main courante chronologique)
 * 5. 🚫 Restrictions actives/passées
 * 6. Métadonnées
 *
 * 🔍 Audit log sur toutes les opérations sensibles.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Save, Plus,
  ScrollText, Scale, FileText, Ban, ExternalLink,
  Calendar, Coins, AlertTriangle, Gavel, StickyNote,
  Users, Folder, Shield,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';

import {
  type Casier, type CasierStatut,
  type CasierInfraction, type CasierDecision,
  type CasierNote, type CasierRestriction,
  CASIER_STATUT_LABEL,
  CASIER_DECISION_TYPE_LABEL,
  RESTRICTION_TYPE_LABEL,
  fmtMoney, fmtDateFR, fmtDateTimeFR,
  computeCasierTotals, getCasierVariant,
} from '@/types/casier';
import {
  DANGER_LABEL, INFRACTION_STATUT_LABEL,
  type DossierDanger, type InfractionStatut,
  type Dossier,
} from '@/types/dossier';
import type { Recense } from '@/types/recense';

import styles from './page.module.css';
import listStyles from '../page.module.css';

const FB_PATH = 'casiers';
const FB_DOSSIERS_PATH = 'dossiers';
const FB_RECENSES_PATH = 'recenses';

export default function FicheCasierPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.membreBranche('police');
  const canDeleteCasier = u.can.adminBranche('police');

  const { data, loading } = useFirebaseValue<Casier[] | null>(FB_PATH);
  const { data: dossiersData } = useFirebaseValue<Dossier[] | null>(FB_DOSSIERS_PATH);
  const { data: recensesData } = useFirebaseValue<Recense[] | null>(FB_RECENSES_PATH);

  // ─── État modales ───
  const [showHeaderEdit, setShowHeaderEdit] = useState(false);
  const [headerForm, setHeaderForm] = useState<Partial<Casier>>({});

  const [showInfractionForm, setShowInfractionForm] = useState(false);
  const [editingInfractionId, setEditingInfractionId] = useState<number | null>(null);
  const [infrForm, setInfrForm] = useState<Partial<CasierInfraction>>({});

  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [editingDecisionId, setEditingDecisionId] = useState<number | null>(null);
  const [decisionForm, setDecisionForm] = useState<Partial<CasierDecision>>({});

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const [showRestrictionForm, setShowRestrictionForm] = useState(false);
  const [editingRestrictionId, setEditingRestrictionId] = useState<number | null>(null);
  const [restrictionForm, setRestrictionForm] = useState<Partial<CasierRestriction>>({});

  // ─── Données ───
  const all = useMemo<Casier[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (c): c is Casier => c !== null && typeof c === 'object' && !!c.id
    );
  }, [data]);

  const casier = useMemo(() => all.find((c) => c.id === id) || null, [all, id]);

  const dossiers = useMemo<Dossier[]>(() => {
    if (!dossiersData) return [];
    return (Array.isArray(dossiersData) ? dossiersData : Object.values(dossiersData)).filter(
      (d): d is Dossier => d !== null && typeof d === 'object' && !!d.id
    );
  }, [dossiersData]);

  const recenses = useMemo<Recense[]>(() => {
    if (!recensesData) return [];
    return (Array.isArray(recensesData) ? recensesData : Object.values(recensesData)).filter(
      (r): r is Recense => r !== null && typeof r === 'object' && !!r.id
    );
  }, [recensesData]);

  const linkedRecense = useMemo(
    () => casier?.recenseId ? recenses.find((r) => r.id === casier.recenseId) : null,
    [casier?.recenseId, recenses],
  );

  // Dossiers liés à ce recensé
  const linkedDossiers = useMemo(() => {
    if (!casier) return [];
    return dossiers.filter((d) => d.recenseId === casier.recenseId);
  }, [casier, dossiers]);

  const totals = useMemo(
    () => casier ? computeCasierTotals(casier) : { total: 0, payee: 0, impayee: 0, nbInfractions: 0 },
    [casier],
  );

  // ─── Helper : update casier dans la liste ───
  async function persistCasier(updated: Casier, auditDetail: string, action: 'create' | 'update' | 'delete' = 'update', subTarget?: string) {
    if (!casier) return;
    const list = [...all];
    const idx = list.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Introuvable');
    list[idx] = {
      ...updated,
      modifiePar: CURRENT_USER,
      modifieLe: Date.now(),
    };
    await dbSet(FB_PATH, list);

    logAction({
      who: CURRENT_USER,
      whoId: u.id ?? null,
      action,
      target: subTarget || 'police:casier',
      targetId: String(id),
      detail: auditDetail,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  HEADER (statut, observations)
  // ═══════════════════════════════════════════════════════════════

  function openHeaderEdit() {
    if (!casier) return;
    setHeaderForm({ statut: casier.statut, observations: casier.observations });
    setShowHeaderEdit(true);
  }
  function closeHeaderEdit() {
    setShowHeaderEdit(false);
    setHeaderForm({});
  }

  async function handleSaveHeader() {
    if (!casier) return;
    try {
      const updated: Casier = {
        ...casier,
        statut: headerForm.statut || casier.statut,
        observations: headerForm.observations?.trim() || undefined,
      };
      const statutChanged = casier.statut !== updated.statut;
      const observationsChanged = (casier.observations || '') !== (updated.observations || '');
      const changes: string[] = [];
      if (statutChanged) changes.push(`statut ${CASIER_STATUT_LABEL[casier.statut]} → ${CASIER_STATUT_LABEL[updated.statut]}`);
      if (observationsChanged) changes.push('observations');
      await persistCasier(
        updated,
        `Modification casier ${casier.numeroCasier} de ${casier.nomComplet} (${changes.join(', ') || 'aucun changement'})`,
        'update',
      );
      toast.success('Casier mis à jour');
      closeHeaderEdit();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDeleteCasier() {
    if (!casier) return;
    const ok = await confirmAction({
      title: 'Supprimer le casier',
      message: `Supprimer définitivement le casier ${casier.numeroCasier} de ${casier.nomComplet} ? Cette action efface l'intégralité de son historique judiciaire.`,
      confirmLabel: 'Supprimer définitivement',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== id));
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'delete',
        target: 'police:casier',
        targetId: String(id),
        detail: `Suppression du casier ${casier.numeroCasier} de ${casier.nomComplet} ` +
          `(${(casier.infractions || []).length} infractions, ${(casier.decisions || []).length} décisions, ${(casier.notes || []).length} notes)`,
      });
      toast.success('Casier supprimé');
      router.push('/police/casiers');
    } catch {
      toast.error('Erreur');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  INFRACTIONS
  // ═══════════════════════════════════════════════════════════════

  function openInfractionCreate() {
    setEditingInfractionId(null);
    setInfrForm({
      gravite: 'moyen',
      statut: 'impunie',
      date: Date.now(),
      source: 'manuel',
    });
    setShowInfractionForm(true);
  }
  function openInfractionEdit(inf: CasierInfraction) {
    setEditingInfractionId(inf.id);
    setInfrForm({ ...inf });
    setShowInfractionForm(true);
  }
  function closeInfractionForm() {
    setShowInfractionForm(false);
    setEditingInfractionId(null);
    setInfrForm({});
  }

  async function handleSaveInfraction() {
    if (!casier) return;
    if (!infrForm.nom?.trim()) {
      toast.error('L\'intitulé est obligatoire');
      return;
    }
    try {
      const infractions = [...(casier.infractions || [])];
      let auditDetail = '';
      let action: 'create' | 'update' = 'create';

      if (editingInfractionId) {
        const idx = infractions.findIndex((i) => i.id === editingInfractionId);
        if (idx === -1) throw new Error('Introuvable');
        infractions[idx] = { ...infractions[idx], ...infrForm, id: editingInfractionId } as CasierInfraction;
        auditDetail = `Modification infraction "${infrForm.nom}" sur casier ${casier.numeroCasier}`;
        action = 'update';
      } else {
        const newInfraction: CasierInfraction = {
          id: Date.now(),
          nom: infrForm.nom!.trim(),
          gravite: infrForm.gravite || 'moyen',
          date: infrForm.date,
          amende: Number(infrForm.amende) || 0,
          amendePayee: Number(infrForm.amendePayee) || 0,
          prison: infrForm.prison?.trim() || undefined,
          statut: infrForm.statut || 'impunie',
          notes: infrForm.notes?.trim() || undefined,
          source: 'manuel',
        };
        infractions.push(newInfraction);
        auditDetail = `Ajout infraction manuelle "${newInfraction.nom}" au casier ${casier.numeroCasier} (${fmtMoney(newInfraction.amende)} ₽)`;
      }

      await persistCasier(
        { ...casier, infractions },
        auditDetail,
        action,
        'police:casier:infraction',
      );
      toast.success(editingInfractionId ? 'Infraction modifiée' : 'Infraction ajoutée');
      closeInfractionForm();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDeleteInfraction(inf: CasierInfraction) {
    if (!casier) return;
    const ok = await confirmAction({
      title: 'Retirer l\'infraction',
      message: `Retirer "${inf.nom}" du casier ?`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const infractions = (casier.infractions || []).filter((i) => i.id !== inf.id);
      await persistCasier(
        { ...casier, infractions },
        `Retrait infraction "${inf.nom}" du casier ${casier.numeroCasier}`,
        'delete',
        'police:casier:infraction',
      );
      toast.success('Infraction retirée');
    } catch {
      toast.error('Erreur');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DÉCISIONS DE JUSTICE
  // ═══════════════════════════════════════════════════════════════

  function openDecisionCreate() {
    setEditingDecisionId(null);
    setDecisionForm({
      date: Date.now(),
      type: 'condamnation',
    });
    setShowDecisionForm(true);
  }
  function openDecisionEdit(d: CasierDecision) {
    setEditingDecisionId(d.id);
    setDecisionForm({ ...d });
    setShowDecisionForm(true);
  }
  function closeDecisionForm() {
    setShowDecisionForm(false);
    setEditingDecisionId(null);
    setDecisionForm({});
  }

  async function handleSaveDecision() {
    if (!casier) return;
    if (!decisionForm.peine?.trim()) {
      toast.error('La peine est obligatoire');
      return;
    }
    if (!decisionForm.date) {
      toast.error('La date est obligatoire');
      return;
    }
    try {
      const decisions = [...(casier.decisions || [])];
      let auditDetail = '';
      let action: 'create' | 'update' = 'create';

      if (editingDecisionId) {
        const idx = decisions.findIndex((d) => d.id === editingDecisionId);
        if (idx === -1) throw new Error('Introuvable');
        decisions[idx] = { ...decisions[idx], ...decisionForm, id: editingDecisionId } as CasierDecision;
        auditDetail = `Modification décision sur casier ${casier.numeroCasier}`;
        action = 'update';
      } else {
        const newDecision: CasierDecision = {
          id: Date.now(),
          date: decisionForm.date,
          type: decisionForm.type || 'condamnation',
          peine: decisionForm.peine!.trim(),
          tribunal: decisionForm.tribunal?.trim() || undefined,
          motif: decisionForm.motif?.trim() || undefined,
          juge: decisionForm.juge?.trim() || undefined,
        };
        decisions.push(newDecision);
        auditDetail = `Ajout décision (${CASIER_DECISION_TYPE_LABEL[newDecision.type]}) au casier ${casier.numeroCasier} : ${newDecision.peine}`;
      }

      await persistCasier(
        { ...casier, decisions },
        auditDetail,
        action,
        'police:casier:decision',
      );
      toast.success(editingDecisionId ? 'Décision modifiée' : 'Décision ajoutée');
      closeDecisionForm();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDeleteDecision(d: CasierDecision) {
    if (!casier) return;
    const ok = await confirmAction({
      title: 'Supprimer la décision',
      message: `Supprimer la décision "${d.peine}" du casier ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const decisions = (casier.decisions || []).filter((x) => x.id !== d.id);
      await persistCasier(
        { ...casier, decisions },
        `Suppression décision "${d.peine}" du casier ${casier.numeroCasier}`,
        'delete',
        'police:casier:decision',
      );
      toast.success('Décision supprimée');
    } catch {
      toast.error('Erreur');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  NOTES
  // ═══════════════════════════════════════════════════════════════

  function openNoteForm() {
    setNoteContent('');
    setShowNoteForm(true);
  }
  function closeNoteForm() {
    setShowNoteForm(false);
    setNoteContent('');
  }

  async function handleSaveNote() {
    if (!casier) return;
    if (!noteContent.trim()) {
      toast.error('Le contenu de la note est obligatoire');
      return;
    }
    try {
      const notes = [...(casier.notes || [])];
      const newNote: CasierNote = {
        id: Date.now(),
        date: Date.now(),
        auteur: CURRENT_USER,
        contenu: noteContent.trim(),
      };
      notes.push(newNote);
      await persistCasier(
        { ...casier, notes },
        `Ajout note sur casier ${casier.numeroCasier} : "${newNote.contenu.slice(0, 80)}${newNote.contenu.length > 80 ? '…' : ''}"`,
        'create',
        'police:casier:note',
      );
      toast.success('Note ajoutée');
      closeNoteForm();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDeleteNote(note: CasierNote) {
    if (!casier) return;
    const ok = await confirmAction({
      title: 'Supprimer la note',
      message: 'Supprimer cette note du casier ?',
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const notes = (casier.notes || []).filter((n) => n.id !== note.id);
      await persistCasier(
        { ...casier, notes },
        `Suppression d'une note du casier ${casier.numeroCasier} (auteur initial : ${note.auteur})`,
        'delete',
        'police:casier:note',
      );
      toast.success('Note supprimée');
    } catch {
      toast.error('Erreur');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  RESTRICTIONS
  // ═══════════════════════════════════════════════════════════════

  function openRestrictionCreate() {
    setEditingRestrictionId(null);
    setRestrictionForm({
      type: 'surveillance',
      dateDebut: Date.now(),
      active: true,
    });
    setShowRestrictionForm(true);
  }
  function openRestrictionEdit(r: CasierRestriction) {
    setEditingRestrictionId(r.id);
    setRestrictionForm({ ...r });
    setShowRestrictionForm(true);
  }
  function closeRestrictionForm() {
    setShowRestrictionForm(false);
    setEditingRestrictionId(null);
    setRestrictionForm({});
  }

  async function handleSaveRestriction() {
    if (!casier) return;
    if (!restrictionForm.details?.trim()) {
      toast.error('Les détails sont obligatoires');
      return;
    }
    try {
      const restrictions = [...(casier.restrictions || [])];
      let auditDetail = '';
      let action: 'create' | 'update' = 'create';

      if (editingRestrictionId) {
        const idx = restrictions.findIndex((r) => r.id === editingRestrictionId);
        if (idx === -1) throw new Error('Introuvable');
        const old = restrictions[idx];
        restrictions[idx] = { ...old, ...restrictionForm, id: editingRestrictionId } as CasierRestriction;
        const newR = restrictions[idx];
        if (old.active !== newR.active) {
          auditDetail = `Restriction "${RESTRICTION_TYPE_LABEL[newR.type]}" ${newR.active ? 'réactivée' : 'levée'} sur casier ${casier.numeroCasier}`;
        } else {
          auditDetail = `Modification restriction "${RESTRICTION_TYPE_LABEL[newR.type]}" sur casier ${casier.numeroCasier}`;
        }
        action = 'update';
      } else {
        const newR: CasierRestriction = {
          id: Date.now(),
          type: restrictionForm.type || 'surveillance',
          details: restrictionForm.details!.trim(),
          dateDebut: restrictionForm.dateDebut || Date.now(),
          dateFin: restrictionForm.dateFin,
          active: restrictionForm.active !== false,
        };
        restrictions.push(newR);
        auditDetail = `Ajout restriction "${RESTRICTION_TYPE_LABEL[newR.type]}" au casier ${casier.numeroCasier} : ${newR.details}`;
      }

      await persistCasier(
        { ...casier, restrictions },
        auditDetail,
        action,
        'police:casier:restriction',
      );
      toast.success(editingRestrictionId ? 'Restriction modifiée' : 'Restriction ajoutée');
      closeRestrictionForm();
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDeleteRestriction(r: CasierRestriction) {
    if (!casier) return;
    const ok = await confirmAction({
      title: 'Supprimer la restriction',
      message: `Supprimer "${RESTRICTION_TYPE_LABEL[r.type]}" du casier ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const restrictions = (casier.restrictions || []).filter((x) => x.id !== r.id);
      await persistCasier(
        { ...casier, restrictions },
        `Suppression restriction "${RESTRICTION_TYPE_LABEL[r.type]}" du casier ${casier.numeroCasier}`,
        'delete',
        'police:casier:restriction',
      );
      toast.success('Restriction supprimée');
    } catch {
      toast.error('Erreur');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDU
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return <div className={styles.loading}><p>Chargement du casier…</p></div>;
  }

  if (!casier) {
    return (
      <div className={styles.notFound}>
        <h2>Casier introuvable</h2>
        <p>Ce casier n&apos;existe pas ou a été supprimé.</p>
        <Button onClick={() => router.push('/police/casiers')}>
          <ArrowLeft size={14} /> Retour aux casiers
        </Button>
      </div>
    );
  }

  const variant = getCasierVariant(casier);
  const infractions = casier.infractions || [];
  const decisions = casier.decisions || [];
  const notes = casier.notes || [];
  const restrictions = casier.restrictions || [];

  // Tri chronologique inverse
  const sortedInfractions = [...infractions].sort((a, b) => (b.date || 0) - (a.date || 0));
  const sortedDecisions = [...decisions].sort((a, b) => b.date - a.date);
  const sortedNotes = [...notes].sort((a, b) => b.date - a.date);
  const sortedRestrictions = [...restrictions].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.dateDebut - a.dateDebut;
  });

  return (
    <>
      {/* Barre d'actions sticky */}
      <div className={styles.actionsBar}>
        <button className={styles.backBtn} onClick={() => router.push('/police/casiers')}>
          <ArrowLeft size={16} />
          <span className={styles.backLabel}>Retour aux casiers</span>
          <span className={styles.backLabelMobile}>Retour</span>
        </button>
        {canEdit && (
          <div className={styles.actionsRight}>
            <button className={styles.editBtn} onClick={openHeaderEdit}>
              <Pencil size={14} /> Modifier
            </button>
            {canDeleteCasier && (
              <button className={styles.delBtn} onClick={handleDeleteCasier}>
                <Trash2 size={14} />
                <span className={styles.delLabel}>Supprimer</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fiche principale */}
      <article className={`${styles.fiche} ${styles[`v-${variant}`]}`}>
        {casier.statut === 'interdit_village' && (
          <div className={`${styles.stamp} ${styles.stampDanger}`}>INTERDIT</div>
        )}
        {casier.statut === 'surveillance' && (
          <div className={`${styles.stamp} ${styles.stampWarning}`}>SURVEILLANCE</div>
        )}
        {casier.statut === 'rehabilite' && (
          <div className={`${styles.stamp} ${styles.stampOk}`}>RÉHABILITÉ</div>
        )}

        <header className={styles.header}>
          {linkedRecense?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={linkedRecense.photo} alt={casier.nomComplet} className={styles.photo} />
          ) : (
            <div className={styles.photoPlaceholder}>
              {casier.nomComplet[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className={styles.headerInfo}>
            <div className={styles.casierTab}>
              <ScrollText size={11} />
              <span className={styles.casierNum}>{casier.numeroCasier}</span>
            </div>
            <h1 className={styles.name}>{casier.nomComplet}</h1>
            <div className={styles.tags}>
              <span className={`${styles.tag} ${styles[`stb-${casier.statut}`]}`}>
                {CASIER_STATUT_LABEL[casier.statut]}
              </span>
              {linkedRecense?.rang && (
                <span className={styles.tag}>{linkedRecense.rang}</span>
              )}
              {linkedRecense?.clan && (
                <span className={styles.tag}>Clan {linkedRecense.clan}</span>
              )}
            </div>
          </div>
        </header>

        <div className={styles.sections}>
          {/* ═══ ANTÉCÉDENTS ═══ */}
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <ScrollText size={14} /> Antécédents judiciaires
                {sortedInfractions.length > 0 && (
                  <span className={styles.sectionCount}>
                    {sortedInfractions.length} infraction{sortedInfractions.length > 1 ? 's' : ''}
                  </span>
                )}
              </h2>
              {canEdit && (
                <button className={styles.addBtn} onClick={openInfractionCreate}>
                  <Plus size={12} /> Ajouter
                </button>
              )}
            </div>

            {sortedInfractions.length === 0 ? (
              <p className={styles.emptySection}>
                <em>Aucune infraction enregistrée. Casier vierge.</em>
              </p>
            ) : (
              <div className={styles.infractionsList}>
                {sortedInfractions.map((inf, idx) => (
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
                      {inf.source && inf.source !== 'manuel' && (
                        <span className={styles.sourceBadge}>{inf.source === 'tribunal' ? '⚖️ Tribunal' : '📁 Dossier'}</span>
                      )}
                      {canEdit && (
                        <div className={styles.infrActions}>
                          <button className={styles.infrEditBtn} onClick={() => openInfractionEdit(inf)} title="Modifier">
                            <Pencil size={11} />
                          </button>
                          <button className={styles.infrDelBtn} onClick={() => handleDeleteInfraction(inf)} title="Retirer">
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
                    {inf.notes && <p className={styles.infrNotes}>{inf.notes}</p>}
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

          {/* ═══ DÉCISIONS DE JUSTICE ═══ */}
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <Gavel size={14} /> Décisions de justice
                {sortedDecisions.length > 0 && (
                  <span className={styles.sectionCount}>
                    {sortedDecisions.length}
                  </span>
                )}
              </h2>
              {canEdit && (
                <button className={styles.addBtn} onClick={openDecisionCreate}>
                  <Plus size={12} /> Ajouter
                </button>
              )}
            </div>

            {sortedDecisions.length === 0 ? (
              <p className={styles.emptySection}>
                <em>Aucune décision de justice enregistrée.</em>
              </p>
            ) : (
              <div className={styles.decisionList}>
                {sortedDecisions.map((d) => (
                  <article key={d.id} className={`${styles.decisionCard} ${styles[`decType-${d.type}`]}`}>
                    <div className={styles.decHeader}>
                      <span className={styles.decType}>
                        <Gavel size={11} /> {CASIER_DECISION_TYPE_LABEL[d.type]}
                      </span>
                      <span className={styles.decDate}>{fmtDateFR(d.date)}</span>
                      {canEdit && (
                        <div className={styles.infrActions}>
                          <button className={styles.infrEditBtn} onClick={() => openDecisionEdit(d)} title="Modifier">
                            <Pencil size={11} />
                          </button>
                          <button className={styles.infrDelBtn} onClick={() => handleDeleteDecision(d)} title="Supprimer">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className={styles.decPeine}>{d.peine}</p>
                    {(d.tribunal || d.juge) && (
                      <div className={styles.decMeta}>
                        {d.tribunal && <span>🏛️ {d.tribunal}</span>}
                        {d.juge && <span>⚖️ Magistrat : {d.juge}</span>}
                      </div>
                    )}
                    {d.motif && <p className={styles.decMotif}>{d.motif}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ═══ RESTRICTIONS ═══ */}
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <Ban size={14} /> Restrictions
                {sortedRestrictions.filter((r) => r.active).length > 0 && (
                  <span className={`${styles.sectionCount} ${styles.sectionCountAlert}`}>
                    {sortedRestrictions.filter((r) => r.active).length} active{sortedRestrictions.filter((r) => r.active).length > 1 ? 's' : ''}
                  </span>
                )}
              </h2>
              {canEdit && (
                <button className={styles.addBtn} onClick={openRestrictionCreate}>
                  <Plus size={12} /> Ajouter
                </button>
              )}
            </div>

            {sortedRestrictions.length === 0 ? (
              <p className={styles.emptySection}>
                <em>Aucune restriction enregistrée.</em>
              </p>
            ) : (
              <div className={styles.restrictionList}>
                {sortedRestrictions.map((r) => (
                  <article
                    key={r.id}
                    className={`${styles.restrictionCard} ${r.active ? styles.restrictionActive : styles.restrictionInactive}`}
                  >
                    <div className={styles.restrHeader}>
                      <span className={styles.restrType}>
                        <Shield size={11} /> {RESTRICTION_TYPE_LABEL[r.type]}
                      </span>
                      <span className={`${styles.restrStatus} ${r.active ? styles.restrActive : styles.restrInactive}`}>
                        {r.active ? '🔴 ACTIVE' : '⚪ LEVÉE'}
                      </span>
                      {canEdit && (
                        <div className={styles.infrActions}>
                          <button className={styles.infrEditBtn} onClick={() => openRestrictionEdit(r)} title="Modifier">
                            <Pencil size={11} />
                          </button>
                          <button className={styles.infrDelBtn} onClick={() => handleDeleteRestriction(r)} title="Supprimer">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className={styles.restrDetails}>{r.details}</p>
                    <div className={styles.restrDates}>
                      Du {fmtDateFR(r.dateDebut)}
                      {r.dateFin && ` au ${fmtDateFR(r.dateFin)}`}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ═══ NOTES OFFICIELLES ═══ */}
          <section className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>
                <StickyNote size={14} /> Notes officielles
                {sortedNotes.length > 0 && (
                  <span className={styles.sectionCount}>{sortedNotes.length}</span>
                )}
              </h2>
              {canEdit && (
                <button className={styles.addBtn} onClick={openNoteForm}>
                  <Plus size={12} /> Ajouter
                </button>
              )}
            </div>

            {sortedNotes.length === 0 ? (
              <p className={styles.emptySection}>
                <em>Aucune note officielle.</em>
              </p>
            ) : (
              <div className={styles.notesList}>
                {sortedNotes.map((n) => (
                  <article key={n.id} className={styles.noteCard}>
                    <div className={styles.noteHeader}>
                      <span className={styles.noteAuteur}>📝 {n.auteur}</span>
                      <span className={styles.noteDate}>{fmtDateTimeFR(n.date)}</span>
                      {canEdit && (
                        <button className={styles.infrDelBtn} onClick={() => handleDeleteNote(n)} title="Supprimer">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    <p className={styles.noteContent}>{n.contenu}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* ═══ OBSERVATIONS GÉNÉRALES ═══ */}
          {casier.observations && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <FileText size={14} /> Observations
              </h2>
              <p className={styles.notes}>{casier.observations}</p>
            </section>
          )}

          {/* ═══ DOSSIERS LIÉS ═══ */}
          {linkedDossiers.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <Folder size={14} /> Dossiers d'enquête liés
                <span className={styles.sectionCount}>{linkedDossiers.length}</span>
              </h2>
              <div className={styles.linkedDossiersList}>
                {linkedDossiers.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={styles.linkedDossier}
                    onClick={() => router.push(`/dossiers/${d.id}`)}
                  >
                    <FileText size={12} />
                    <span className={styles.linkedDossierNum}>{d.numeroDossier || `DOS-${d.id}`}</span>
                    <span className={styles.linkedDossierMeta}>
                      {d.statut} · {DANGER_LABEL[d.danger]}
                    </span>
                    <ExternalLink size={11} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ═══ MÉTADONNÉES ═══ */}
          <section className={`${styles.section} ${styles.meta}`}>
            <h2 className={styles.sectionTitle}>
              <Calendar size={14} /> Métadonnées
            </h2>
            <div className={styles.kvGrid}>
              <KV label="Numéro de casier" value={casier.numeroCasier} mono />
              <KV label="Ouvert par" value={casier.ouvertPar} />
              <KV label="Date d'ouverture" value={fmtDateFR(casier.ouvertLe)} />
              {casier.modifiePar && (
                <KV label="Dernière modification" value={`${casier.modifiePar} · ${fmtDateTimeFR(casier.modifieLe)}`} />
              )}
              <KV label="ID interne" value={String(casier.id)} mono />
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

      {/* ═══ MODALES ═══ */}

      {/* Édition header */}
      <Modal
        open={showHeaderEdit}
        onClose={closeHeaderEdit}
        title="Modifier le casier"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeHeaderEdit}>Annuler</Button>
            <Button onClick={handleSaveHeader}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <label>
            Statut du casier
            <select
              value={headerForm.statut || casier.statut}
              onChange={(e) => setHeaderForm({ ...headerForm, statut: e.target.value as CasierStatut })}
              autoFocus
            >
              {Object.entries(CASIER_STATUT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Observations générales
            <textarea
              rows={4}
              value={headerForm.observations ?? ''}
              onChange={(e) => setHeaderForm({ ...headerForm, observations: e.target.value })}
              placeholder="Notes générales sur la personne, contexte global…"
            />
          </label>
        </div>
      </Modal>

      {/* Infraction */}
      <Modal
        open={showInfractionForm}
        onClose={closeInfractionForm}
        title={editingInfractionId ? 'Modifier l\'infraction' : 'Ajouter une infraction'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeInfractionForm}>Annuler</Button>
            <Button onClick={handleSaveInfraction}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <label>
            Intitulé de l'infraction *
            <input
              type="text"
              value={infrForm.nom ?? ''}
              onChange={(e) => setInfrForm({ ...infrForm, nom: e.target.value })}
              autoFocus
              placeholder="Ex: Vol au marché central"
            />
          </label>
          <div className={listStyles.row}>
            <label>
              Gravité
              <select
                value={infrForm.gravite || 'moyen'}
                onChange={(e) => setInfrForm({ ...infrForm, gravite: e.target.value as DossierDanger })}
              >
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="eleve">Élevé</option>
                <option value="critique">Critique</option>
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={infrForm.date ? new Date(infrForm.date).toISOString().slice(0, 10) : ''}
                onChange={(e) => setInfrForm({
                  ...infrForm,
                  date: e.target.value ? new Date(e.target.value).getTime() : undefined,
                })}
              />
            </label>
          </div>
          <div className={listStyles.row}>
            <label>
              Amende (₽)
              <input
                type="number"
                value={infrForm.amende ?? ''}
                onChange={(e) => setInfrForm({ ...infrForm, amende: e.target.value ? Number(e.target.value) : 0 })}
              />
            </label>
            <label>
              Déjà payé (₽)
              <input
                type="number"
                value={infrForm.amendePayee ?? ''}
                onChange={(e) => setInfrForm({ ...infrForm, amendePayee: e.target.value ? Number(e.target.value) : 0 })}
              />
            </label>
          </div>
          <div className={listStyles.row}>
            <label>
              Prison
              <input
                type="text"
                value={infrForm.prison ?? ''}
                onChange={(e) => setInfrForm({ ...infrForm, prison: e.target.value })}
                placeholder="Ex: 3 jours"
              />
            </label>
            <label>
              Statut
              <select
                value={infrForm.statut || 'impunie'}
                onChange={(e) => setInfrForm({ ...infrForm, statut: e.target.value as InfractionStatut })}
              >
                {Object.entries(INFRACTION_STATUT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Notes
            <textarea
              rows={2}
              value={infrForm.notes ?? ''}
              onChange={(e) => setInfrForm({ ...infrForm, notes: e.target.value })}
              placeholder="Contexte, témoins…"
            />
          </label>
        </div>
      </Modal>

      {/* Décision */}
      <Modal
        open={showDecisionForm}
        onClose={closeDecisionForm}
        title={editingDecisionId ? 'Modifier la décision' : 'Ajouter une décision de justice'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeDecisionForm}>Annuler</Button>
            <Button onClick={handleSaveDecision}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <div className={listStyles.row}>
            <label>
              Type de décision
              <select
                value={decisionForm.type || 'condamnation'}
                onChange={(e) => setDecisionForm({ ...decisionForm, type: e.target.value as CasierDecision['type'] })}
                autoFocus
              >
                {Object.entries(CASIER_DECISION_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Date *
              <input
                type="date"
                value={decisionForm.date ? new Date(decisionForm.date).toISOString().slice(0, 10) : ''}
                onChange={(e) => setDecisionForm({
                  ...decisionForm,
                  date: e.target.value ? new Date(e.target.value).getTime() : Date.now(),
                })}
              />
            </label>
          </div>
          <label>
            Peine prononcée *
            <input
              type="text"
              value={decisionForm.peine ?? ''}
              onChange={(e) => setDecisionForm({ ...decisionForm, peine: e.target.value })}
              placeholder="Ex: 30 jours de prison ferme + 50000 ₽ d'amende"
            />
          </label>
          <div className={listStyles.row}>
            <label>
              Tribunal
              <input
                type="text"
                value={decisionForm.tribunal ?? ''}
                onChange={(e) => setDecisionForm({ ...decisionForm, tribunal: e.target.value })}
                placeholder="Ex: Tribunal de Suna"
              />
            </label>
            <label>
              Magistrat
              <input
                type="text"
                value={decisionForm.juge ?? ''}
                onChange={(e) => setDecisionForm({ ...decisionForm, juge: e.target.value })}
                placeholder="Nom du juge"
              />
            </label>
          </div>
          <label>
            Motif / Contexte
            <textarea
              rows={3}
              value={decisionForm.motif ?? ''}
              onChange={(e) => setDecisionForm({ ...decisionForm, motif: e.target.value })}
            />
          </label>
        </div>
      </Modal>

      {/* Note */}
      <Modal
        open={showNoteForm}
        onClose={closeNoteForm}
        title="Ajouter une note officielle"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeNoteForm}>Annuler</Button>
            <Button onClick={handleSaveNote}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <p className={listStyles.formHint}>
            La note sera datée du <strong>{fmtDateTimeFR(Date.now())}</strong> et signée par <strong>{CURRENT_USER}</strong>.
          </p>
          <label>
            Contenu de la note *
            <textarea
              rows={6}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              autoFocus
              placeholder="Observation, événement, contact établi, etc."
            />
          </label>
        </div>
      </Modal>

      {/* Restriction */}
      <Modal
        open={showRestrictionForm}
        onClose={closeRestrictionForm}
        title={editingRestrictionId ? 'Modifier la restriction' : 'Ajouter une restriction'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeRestrictionForm}>Annuler</Button>
            <Button onClick={handleSaveRestriction}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={listStyles.formFields}>
          <label>
            Type de restriction
            <select
              value={restrictionForm.type || 'surveillance'}
              onChange={(e) => setRestrictionForm({ ...restrictionForm, type: e.target.value as CasierRestriction['type'] })}
              autoFocus
            >
              {Object.entries(RESTRICTION_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Détails *
            <textarea
              rows={3}
              value={restrictionForm.details ?? ''}
              onChange={(e) => setRestrictionForm({ ...restrictionForm, details: e.target.value })}
              placeholder="Lieu, personnes concernées, conditions…"
            />
          </label>
          <div className={listStyles.row}>
            <label>
              Date de début
              <input
                type="date"
                value={restrictionForm.dateDebut ? new Date(restrictionForm.dateDebut).toISOString().slice(0, 10) : ''}
                onChange={(e) => setRestrictionForm({
                  ...restrictionForm,
                  dateDebut: e.target.value ? new Date(e.target.value).getTime() : Date.now(),
                })}
              />
            </label>
            <label>
              Date de fin (optionnel)
              <input
                type="date"
                value={restrictionForm.dateFin ? new Date(restrictionForm.dateFin).toISOString().slice(0, 10) : ''}
                onChange={(e) => setRestrictionForm({
                  ...restrictionForm,
                  dateFin: e.target.value ? new Date(e.target.value).getTime() : undefined,
                })}
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={restrictionForm.active !== false}
              onChange={(e) => setRestrictionForm({ ...restrictionForm, active: e.target.checked })}
              style={{ marginRight: 8 }}
            />
            Restriction active
          </label>
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
