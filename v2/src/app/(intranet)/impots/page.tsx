'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page IMPÔTS — Registre fiscal de Sunagakure
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir : tout le monde (connecté)
 * - Marquer payé / annuler / config barème / encaisser : MEMBRES POLICE + Direction Kōeki + Admin
 *
 * 📜 Audit log : paiements, annulations, suppressions, modifications
 *    du barème ET encaissements groupés sont tracés dans /audit_log Firebase.
 *
 * ⭐ Vision C — LIEN IMPÔTS → TRÉSOR :
 *    Marquer payé  → crée aussi un TresorMouvement dans tresorCentral
 *    Annuler/Suppr → supprime aussi le mouvement Trésor lié
 *    Liaison via le champ tresorMouvementId du PaiementImpot.
 *    Mouvement Trésor : section='police', sectionLabel='Impôts'.
 *
 * 💰 ENCART DE COLLECTE (collecte groupée) :
 *    Crédite directement le Trésor d'un montant saisi (libre ou X/tête),
 *    SANS modifier les statuts "payé" (l'encaissement et le suivi
 *    individuel des paiements sont volontairement séparés).
 *    Mouvement Trésor : id 'TM-IMPOT-COLLECTE-...' pour le distinguer
 *    des paiements individuels.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Receipt, Coins,
  CheckCircle2, AlertCircle, Settings, Banknote, Users,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet, dbUpdate } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireMembreBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type GradeBareme, type NinjaImpot, type PaiementImpot,
  DEFAULT_BAREME, currentWeek, fmtMoney, fmtDateFR,
} from '@/types/fiscal';
import type { Recense } from '@/types/recense';
// ⭐ Vision C : types Trésor pour la liaison Impôts → Trésor
import type { TresorCentral, TresorMouvement, TresorRetrait } from '@/types/compta';
import { TRESOR_DEFAULT_RATE } from '@/types/compta';

import styles from './page.module.css';

const FB_GRADES = 'impots/grades';
const FB_PAIEMENTS = 'impots/paiements';
type Tab = 'registre' | 'historique' | 'bareme';
type CollecteMode = 'total' | 'tete';

// Préfixe des mouvements Trésor issus de l'encart de collecte groupée
const COLLECTE_PREFIX = 'TM-IMPOT-COLLECTE-';

/**
 * Calcule la semaine ISO (ex: "2026-W22") à partir d'un timestamp.
 * Même algorithme que currentWeek() de @/types/fiscal, mais paramétrable
 * par une date — currentWeek() ne prend pas d'argument, on en a besoin
 * pour rattacher un mouvement Trésor passé à sa semaine.
 */
function isoWeekOf(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export default function ImpotsPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.membreBranche('police') || u.can.koeki.renflouerBDM();

  const { data: gradesData } = useFirebaseValue<GradeBareme[] | null>(FB_GRADES);
  const { data: paiementsData } = useFirebaseValue<PaiementImpot[] | null>(FB_PAIEMENTS);
  const { data: recensesData } = useFirebaseValue<Recense[] | null>('recenses');
  // ⭐ Vision C : lecture du Trésor pour la liaison
  const { data: tresorData } = useFirebaseValue<TresorCentral | null>('tresorCentral');

  const [tab, setTab] = useState<Tab>('registre');
  const [search, setSearch] = useState('');
  const [showBareme, setShowBareme] = useState(false);
  const [baremeForm, setBaremeForm] = useState<GradeBareme[]>([]);

  // 💰 État de l'encart de collecte
  const [collecteMode, setCollecteMode] = useState<CollecteMode>('total');
  const [collecteMontant, setCollecteMontant] = useState<string>('');
  const [collecteParTete, setCollecteParTete] = useState<string>('');
  const [collecteBusy, setCollecteBusy] = useState(false);

  const grades = useMemo<GradeBareme[]>(() => {
    if (!gradesData) return DEFAULT_BAREME;
    return Array.isArray(gradesData) ? gradesData : Object.values(gradesData);
  }, [gradesData]);

  const paiements = useMemo<PaiementImpot[]>(
    () => (Array.isArray(paiementsData) ? paiementsData : paiementsData ? Object.values(paiementsData) : []).filter(
      (p): p is PaiementImpot => p !== null && typeof p === 'object' && !!p.id
    ),
    [paiementsData]
  );

  // ⭐ Vision C : Trésor normalisé (même pattern que la page /tresor)
  const tresorCurrent = useMemo<TresorCentral>(() => ({
    prelevementRate: tresorData?.prelevementRate ?? TRESOR_DEFAULT_RATE,
    mouvements: (Array.isArray(tresorData?.mouvements) ? tresorData!.mouvements :
                 tresorData?.mouvements ? Object.values(tresorData.mouvements) : [])
                 .filter((m): m is TresorMouvement => m !== null && typeof m === 'object' && !!m.id),
    retraits: (Array.isArray(tresorData?.retraits) ? tresorData!.retraits :
               tresorData?.retraits ? Object.values(tresorData.retraits) : [])
               .filter((r): r is TresorRetrait => r !== null && typeof r === 'object' && !!r.id),
  }), [tresorData]);

  const contribuables = useMemo<NinjaImpot[]>(() => {
    const recenses = (Array.isArray(recensesData) ? recensesData : recensesData ? Object.values(recensesData) : [])
      .filter((r): r is Recense => r !== null && typeof r === 'object' && !!r.id);
    return recenses
      .filter((r) => !r.defuntStatut || r.defuntStatut === '')
      .map((r) => ({
        id: r.id,
        prenom: r.prenom || '',
        nom: r.nom || '',
        rang: r.rang || 'Inconnu',
        faction: r.faction || '',
        notes: r.notes,
      }));
  }, [recensesData]);

  const currentSemaine = currentWeek();
  const paiementsCurrentSemaine = useMemo(() => {
    const m = new Map<number, PaiementImpot>();
    for (const p of paiements) {
      if (p.semaine === currentSemaine) m.set(p.ninjaId, p);
    }
    return m;
  }, [paiements, currentSemaine]);

  const baremeByRang = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of grades) {
      if (g && g.rang) m.set(g.rang, g.montant);
    }
    return m;
  }, [grades]);

  const visibleRegistre = useMemo(() => {
    let list = contribuables;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((n) =>
        ((n.prenom || '') + ' ' + (n.nom || '') + ' ' + (n.rang || '') + ' ' + (n.faction || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const pa = paiementsCurrentSemaine.has(a.id) ? 1 : 0;
      const pb = paiementsCurrentSemaine.has(b.id) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return (a.nom || '').localeCompare(b.nom || '');
    });
  }, [contribuables, search, paiementsCurrentSemaine]);

  const visibleHistorique = useMemo(() => {
    let list = paiements;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        ((p.prenom || '') + ' ' + (p.nom || '') + ' ' + (p.semaine || '') + ' ' + (p.agent || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.date - a.date);
  }, [paiements, search]);

  // 💰 Somme des collectes groupées (encart) de la semaine courante.
  // Repérées par le préfixe d'id COLLECTE_PREFIX, rattachées à leur
  // semaine via isoWeekOf(date) puisque le mouvement n'a pas de champ semaine.
  const collecteEncartSemaine = useMemo(() => {
    return tresorCurrent.mouvements
      .filter((m) => typeof m.id === 'string' && m.id.startsWith(COLLECTE_PREFIX))
      .filter((m) => isoWeekOf(m.date) === currentSemaine)
      .reduce((s, m) => s + (typeof m.amount === 'number' ? m.amount : 0), 0);
  }, [tresorCurrent, currentSemaine]);

  const stats = useMemo(() => {
    const total = contribuables.length;
    const payes = contribuables.filter((c) => paiementsCurrentSemaine.has(c.id)).length;
    const impayes = total - payes;
    const collectePaiements = Array.from(paiementsCurrentSemaine.values()).reduce((s, p) => s + p.montant, 0);
    // Collecte semaine = paiements individuels + collectes groupées de l'encart
    const collecteSemaine = collectePaiements + collecteEncartSemaine;
    return { total, payes, impayes, collecteSemaine };
  }, [contribuables, paiementsCurrentSemaine, collecteEncartSemaine]);

  // 💰 Total dû selon le barème = somme de TOUT le registre (tous les contribuables)
  const totalDuBareme = useMemo(() => {
    return contribuables.reduce((s, n) => s + (baremeByRang.get(n.rang || '') || 0), 0);
  }, [contribuables, baremeByRang]);

  // 💰 Montant effectivement encaissé selon le mode choisi
  const collecteCalcul = useMemo(() => {
    if (collecteMode === 'tete') {
      const parTete = Math.max(0, Math.round(Number(collecteParTete) || 0));
      return { montant: parTete * stats.total, parTete };
    }
    const total = Math.max(0, Math.round(Number(collecteMontant) || 0));
    return { montant: total, parTete: 0 };
  }, [collecteMode, collecteMontant, collecteParTete, stats.total]);

  async function markPaid(n: NinjaImpot) {
    const montant = baremeByRang.get(n.rang || '') || 0;
    if (montant === 0) {
      toast.info(`${n.prenom} ${n.nom} est exempté (montant 0)`);
      return;
    }
    const ok = await confirmAction({
      title: 'Enregistrer le paiement',
      message: `Marquer ${n.prenom} ${n.nom} comme ayant payé ${fmtMoney(montant)} ₽ pour la semaine ${currentSemaine} ? Le montant sera ajouté au Trésor Central.`,
      confirmLabel: 'Confirmer',
    });
    if (!ok) return;
    try {
      const now = Date.now();
      const paiementId = now;

      // ⭐ Vision C : crée le mouvement Trésor associé
      const tresorMouvement: TresorMouvement = {
        id: 'TM-IMPOT-' + paiementId,
        section: 'police',
        sectionLabel: 'Impôts',       // override du label "Police" par défaut
        amount: montant,
        date: now,
        archiveId: 'IMPOT-' + paiementId,
        archiveLabel: `Impôt ${n.prenom} ${n.nom} — semaine ${currentSemaine}`,
        rate: 100,                    // versement direct (pas un prélèvement de clôture)
        soldeOrigine: montant,
      };

      const newPaiement: PaiementImpot = {
        id: paiementId,
        ninjaId: n.id,
        prenom: n.prenom,
        nom: n.nom,
        montant,
        date: now,
        semaine: currentSemaine,
        agent: CURRENT_USER,
        tresorMouvementId: tresorMouvement.id,  // ⭐ liaison
      };

      // 1. Trésor d'abord (si ça échoue, pas de paiement orphelin)
      await dbUpdate('tresorCentral', {
        ...tresorCurrent,
        mouvements: [...tresorCurrent.mouvements, tresorMouvement],
      });

      // 2. Paiement ensuite
      await dbSet(FB_PAIEMENTS, [...paiements, newPaiement]);

      // 📜 AUDIT LOG — paiement
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'create',
        target: 'impot_paiement',
        targetId: String(newPaiement.id),
        detail: `Paiement d'impôt enregistré pour ${n.prenom} ${n.nom} : ${fmtMoney(montant)} ₽ (semaine ${currentSemaine}) — versé au Trésor (${tresorMouvement.id})`,
      });

      // 📜 AUDIT LOG — mouvement Trésor (cohérent avec ComptaModule)
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'create',
        target: 'tresor:mouvement',
        targetId: tresorMouvement.id,
        detail: `Trésor — Versement Impôts : +${fmtMoney(montant)} ₽ ` +
          `(Impôt ${n.prenom} ${n.nom}, semaine ${currentSemaine})`,
      });

      toast.success(`Paiement enregistré : ${fmtMoney(montant)} ₽ → Trésor`);
    } catch (err) {
      console.error('[MARKPAID]', err);
      toast.error('Erreur lors du paiement');
    }
  }

  async function unmarkPaid(n: NinjaImpot) {
    const p = paiementsCurrentSemaine.get(n.id);
    if (!p) return;
    const ok = await confirmAction({
      title: 'Annuler le paiement ?',
      message: `Retirer le paiement de ${p.prenom} ${p.nom} pour la semaine ${currentSemaine} ?${p.tresorMouvementId ? ' Le mouvement Trésor associé sera aussi supprimé.' : ''}`,
      confirmLabel: 'Annuler le paiement', variant: 'danger',
    });
    if (!ok) return;
    try {
      // ⭐ Vision C : si lié à un mouvement Trésor, le supprimer aussi
      if (p.tresorMouvementId) {
        const mouvementExisteEncore = tresorCurrent.mouvements.some(
          (m) => m.id === p.tresorMouvementId
        );
        if (mouvementExisteEncore) {
          await dbUpdate('tresorCentral', {
            ...tresorCurrent,
            mouvements: tresorCurrent.mouvements.filter((m) => m.id !== p.tresorMouvementId),
          });

          logAction({
            who: CURRENT_USER,
            whoId: u.id ?? null,
            action: 'delete',
            target: 'tresor:mouvement',
            targetId: p.tresorMouvementId,
            detail: `Trésor — Annulation versement Impôts : −${fmtMoney(p.montant)} ₽ ` +
              `(annulation paiement ${p.prenom} ${p.nom}, semaine ${p.semaine})`,
          });
        }
      }

      await dbSet(FB_PAIEMENTS, paiements.filter((x) => x.id !== p.id));

      // 📜 AUDIT LOG — annulation paiement
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'delete',
        target: 'impot_paiement',
        targetId: String(p.id),
        detail: `Annulation du paiement de ${p.prenom} ${p.nom} : ${fmtMoney(p.montant)} ₽ (semaine ${p.semaine})` +
          (p.tresorMouvementId ? ` — mouvement Trésor lié supprimé (${p.tresorMouvementId})` : ''),
      });

      toast.success(p.tresorMouvementId ? 'Paiement et mouvement Trésor annulés' : 'Paiement annulé');
    } catch (err) {
      console.error('[UNMARKPAID]', err);
      toast.error('Erreur');
    }
  }

  async function handleDeletePaiement(p: PaiementImpot) {
    const ok = await confirmAction({
      title: 'Supprimer le paiement',
      message: `Supprimer le paiement de ${p.prenom} ${p.nom} (${fmtMoney(p.montant)} ₽) ?${p.tresorMouvementId ? ' Le mouvement Trésor associé sera aussi supprimé.' : ''}`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      // ⭐ Vision C : si lié à un mouvement Trésor, le supprimer aussi
      if (p.tresorMouvementId) {
        const mouvementExisteEncore = tresorCurrent.mouvements.some(
          (m) => m.id === p.tresorMouvementId
        );
        if (mouvementExisteEncore) {
          await dbUpdate('tresorCentral', {
            ...tresorCurrent,
            mouvements: tresorCurrent.mouvements.filter((m) => m.id !== p.tresorMouvementId),
          });

          logAction({
            who: CURRENT_USER,
            whoId: u.id ?? null,
            action: 'delete',
            target: 'tresor:mouvement',
            targetId: p.tresorMouvementId,
            detail: `Trésor — Suppression versement Impôts : −${fmtMoney(p.montant)} ₽ ` +
              `(suppression historique paiement ${p.prenom} ${p.nom}, semaine ${p.semaine})`,
          });
        }
      }

      await dbSet(FB_PAIEMENTS, paiements.filter((x) => x.id !== p.id));

      // 📜 AUDIT LOG — suppression historique
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'delete',
        target: 'impot_paiement',
        targetId: String(p.id),
        detail: `Suppression historique du paiement de ${p.prenom} ${p.nom} : ${fmtMoney(p.montant)} ₽ (semaine ${p.semaine})` +
          (p.tresorMouvementId ? ` — mouvement Trésor lié supprimé (${p.tresorMouvementId})` : ''),
      });

      toast.success('Supprimé');
    } catch (err) {
      console.error('[DELETE PAIEMENT]', err);
      toast.error('Erreur');
    }
  }

  // 💰 Encaissement groupé → Trésor (NE touche PAS aux statuts payé)
  async function encaisserCollecte() {
    const montant = collecteCalcul.montant;
    if (montant <= 0) {
      toast.info('Saisis un montant à encaisser supérieur à 0');
      return;
    }
    const detailMode = collecteMode === 'tete'
      ? `${fmtMoney(collecteCalcul.parTete)} ₽ × ${stats.total} contribuable(s)`
      : 'montant libre';
    const ok = await confirmAction({
      title: 'Encaisser la collecte',
      message: `Ajouter ${fmtMoney(montant)} ₽ au Trésor Central (${detailMode}, semaine ${currentSemaine}) ? ` +
        `Cela n'affecte pas les statuts "payé" des contribuables.`,
      confirmLabel: 'Encaisser',
    });
    if (!ok) return;
    setCollecteBusy(true);
    try {
      const now = Date.now();

      // Mouvement Trésor distinct des paiements individuels
      const tresorMouvement: TresorMouvement = {
        id: COLLECTE_PREFIX + now,
        section: 'police',
        sectionLabel: 'Impôts',
        amount: montant,
        date: now,
        archiveId: 'IMPOT-COLLECTE-' + now,
        archiveLabel: `Collecte d'impôts — semaine ${currentSemaine}` +
          (collecteMode === 'tete' ? ` (${fmtMoney(collecteCalcul.parTete)} ₽ × ${stats.total})` : ''),
        rate: 100,
        soldeOrigine: montant,
      };

      // Trésor d'abord (pattern escrow)
      await dbUpdate('tresorCentral', {
        ...tresorCurrent,
        mouvements: [...tresorCurrent.mouvements, tresorMouvement],
      });

      // 📜 AUDIT LOG — encaissement groupé
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'create',
        target: 'tresor:mouvement',
        targetId: tresorMouvement.id,
        detail: `Trésor — Collecte d'impôts : +${fmtMoney(montant)} ₽ ` +
          `(${detailMode}, semaine ${currentSemaine})`,
      });

      toast.success(`Collecte encaissée : ${fmtMoney(montant)} ₽ → Trésor`);
      setCollecteMontant('');
      setCollecteParTete('');
    } catch (err) {
      console.error('[ENCAISSER COLLECTE]', err);
      toast.error('Erreur lors de l\'encaissement');
    } finally {
      setCollecteBusy(false);
    }
  }

  function openBareme() {
    // Filtre défensif : ne charge que les entrées valides depuis grades
    const safe = grades
      .filter((g) => g && typeof g === 'object')
      .map((g) => ({
        rang: g.rang ?? '',
        montant: typeof g.montant === 'number' ? g.montant : 0,
      }));
    setBaremeForm(safe);
    setShowBareme(true);
  }

  async function saveBareme() {
    try {
      // 🔒 Filtre défensif : ignore les entrées avec rang manquant/vide
      const filtered = baremeForm.filter((g) => (g?.rang ?? '').trim() !== '');
      console.log('[BAREME] Tentative de save :', filtered);

      // 📜 AUDIT LOG
      const summary = filtered
        .map((g) => `${g.rang}: ${fmtMoney(g.montant)} ₽`)
        .join(', ');
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'update',
        target: 'impot_bareme',
        targetId: null,
        detail: `Modification du barème fiscal — ${filtered.length} rang(s) : ${summary || 'aucun'}`,
      });

      await dbSet(FB_GRADES, filtered);
      console.log('[BAREME] Save réussi !');
      toast.success('Barème enregistré');
      setShowBareme(false);
    } catch (err) {
      console.error('[BAREME ERREUR]', err);
      toast.error('Erreur lors de l\'enregistrement du barème');
    }
  }

  function addBaremeLine() {
    setBaremeForm([...baremeForm, { rang: '', montant: 0 }]);
  }
  function removeBaremeLine(idx: number) {
    setBaremeForm(baremeForm.filter((_, i) => i !== idx));
  }
  function updateBaremeLine(idx: number, field: 'rang' | 'montant', value: string | number) {
    const newForm = [...baremeForm];
    if (field === 'rang') newForm[idx].rang = String(value);
    else newForm[idx].montant = Number(value) || 0;
    setBaremeForm(newForm);
  }

  return (
    <>
      <Card
        title="Impôts"
        subtitle={`Registre fiscal — Semaine ${currentSemaine}`}
        actions={
          canEdit ? (
            <Button variant="outline" onClick={openBareme}>
              <Settings size={14} /> Configurer le barème
            </Button>
          ) : null
        }
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Coins size={16} />
            <div className={styles.statVal}>{fmtMoney(stats.collecteSemaine)} ₽</div>
            <div className={styles.statLbl}>Collecte semaine</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGreen}`}>
            <CheckCircle2 size={16} />
            <div className={styles.statVal}>{stats.payes} / {stats.total}</div>
            <div className={styles.statLbl}>Contribuables à jour</div>
          </div>
          <div className={`${styles.statCard} ${styles.scDanger}`}>
            <AlertCircle size={16} />
            <div className={styles.statVal}>{stats.impayes}</div>
            <div className={styles.statLbl}>Restent à payer</div>
          </div>
          <div className={`${styles.statCard} ${styles.scBlue}`}>
            <Receipt size={16} />
            <div className={styles.statVal}>{paiements.length}</div>
            <div className={styles.statLbl}>Total paiements</div>
          </div>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'registre' ? styles.tabActive : ''}`} onClick={() => setTab('registre')}>
            Registre {currentSemaine}
          </button>
          <button className={`${styles.tab} ${tab === 'historique' ? styles.tabActive : ''}`} onClick={() => setTab('historique')}>
            Historique des paiements
          </button>
        </div>

        {/* 💰 Encart de collecte groupée — crédite le Trésor sans toucher aux statuts payé */}
        {canEdit && tab === 'registre' && (
          <div className={styles.collecteBox}>
            <div className={styles.collecteHead}>
              <Banknote size={16} />
              <span>Collecte vers le Trésor</span>
              <span className={styles.collecteHint}>
                n&apos;affecte pas les statuts « payé »
              </span>
            </div>

            <div className={styles.collecteRef}>
              <span>Total dû selon le barème (tout le registre)</span>
              <strong>{fmtMoney(totalDuBareme)} ₽</strong>
              <button
                type="button"
                className={styles.collecteRefBtn}
                onClick={() => { setCollecteMode('total'); setCollecteMontant(String(totalDuBareme)); }}
              >
                Utiliser ce montant
              </button>
            </div>

            <div className={styles.collecteModes}>
              <button
                type="button"
                className={`${styles.collecteModeBtn} ${collecteMode === 'total' ? styles.collecteModeActive : ''}`}
                onClick={() => setCollecteMode('total')}
              >
                <Coins size={13} /> Montant total
              </button>
              <button
                type="button"
                className={`${styles.collecteModeBtn} ${collecteMode === 'tete' ? styles.collecteModeActive : ''}`}
                onClick={() => setCollecteMode('tete')}
              >
                <Users size={13} /> Par tête
              </button>
            </div>

            <div className={styles.collecteRow}>
              {collecteMode === 'total' ? (
                <div className={styles.collecteField}>
                  <label>Montant à encaisser (₽)</label>
                  <input
                    type="number"
                    min="0"
                    value={collecteMontant}
                    onChange={(e) => setCollecteMontant(e.target.value)}
                    placeholder="Ex: 150000"
                    className={styles.collecteInput}
                  />
                </div>
              ) : (
                <div className={styles.collecteField}>
                  <label>Montant par tête (₽) × {stats.total} contribuable(s)</label>
                  <input
                    type="number"
                    min="0"
                    value={collecteParTete}
                    onChange={(e) => setCollecteParTete(e.target.value)}
                    placeholder="Ex: 100"
                    className={styles.collecteInput}
                  />
                </div>
              )}

              <div className={styles.collecteTotal}>
                <span>Total encaissé</span>
                <strong>{fmtMoney(collecteCalcul.montant)} ₽</strong>
              </div>

              <Button onClick={encaisserCollecte} disabled={collecteBusy || collecteCalcul.montant <= 0}>
                <Banknote size={14} /> Encaisser → Trésor
              </Button>
            </div>
          </div>
        )}

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text"
            placeholder={tab === 'registre' ? 'Nom, rang, faction…' : 'Nom, semaine, agent…'}
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === 'registre' && (
          visibleRegistre.length === 0 ? (
            <div className={styles.empty}>
              <Receipt size={32} style={{ opacity: 0.3 }} />
              <p>Aucun contribuable. Ajoute des recensés dans /recensement.</p>
            </div>
          ) : (
            <table className={styles.taxTable}>
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Nom</th>
                  <th>Rang</th>
                  <th style={{ textAlign: 'right' }}>Montant dû</th>
                  {canEdit && <th aria-label="actions" />}
                </tr>
              </thead>
              <tbody>
                {visibleRegistre.map((n) => {
                  const montant = baremeByRang.get(n.rang || '') || 0;
                  const paye = paiementsCurrentSemaine.has(n.id);
                  return (
                    <tr key={n.id} className={paye ? styles.rowPaye : montant === 0 ? styles.rowExempte : styles.rowImpaye}>
                      <td>
                        {paye ? (
                          <span className={styles.statutPaye}>✓ Payé</span>
                        ) : montant === 0 ? (
                          <span className={styles.statutExempte}>Exempté</span>
                        ) : (
                          <span className={styles.statutImpaye}>⚠ Impayé</span>
                        )}
                      </td>
                      <td><strong>{n.prenom} {n.nom}</strong></td>
                      <td className={styles.muted}>{n.rang || '—'}</td>
                      <td className={styles.amount} style={{ textAlign: 'right' }}>
                        {fmtMoney(montant)} ₽
                      </td>
                      {canEdit && (
                        <td>
                          {!paye && montant > 0 ? (
                            <Button size="sm" onClick={() => markPaid(n)}>
                              <CheckCircle2 size={12} /> Marquer payé
                            </Button>
                          ) : paye ? (
                            <button className={styles.unmarkBtn} onClick={() => unmarkPaid(n)}>
                              Annuler
                            </button>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === 'historique' && (
          visibleHistorique.length === 0 ? (
            <div className={styles.empty}>
              <Receipt size={32} style={{ opacity: 0.3 }} />
              <p>Aucun paiement enregistré.</p>
            </div>
          ) : (
            <table className={styles.taxTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Semaine</th>
                  <th>Contribuable</th>
                  <th>Agent</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                  {canEdit && <th aria-label="actions" />}
                </tr>
              </thead>
              <tbody>
                {visibleHistorique.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.mono}>{fmtDateFR(p.date)}</td>
                    <td className={styles.mono}>{p.semaine || '—'}</td>
                    <td><strong>{p.prenom} {p.nom}</strong></td>
                    <td className={styles.muted}>{p.agent || '—'}</td>
                    <td className={styles.amount} style={{ textAlign: 'right' }}>
                      +{fmtMoney(p.montant)} ₽
                    </td>
                    {canEdit && (
                      <td>
                        <button className={styles.deleteBtn} onClick={() => handleDeletePaiement(p)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>

      <Modal
        open={showBareme}
        onClose={() => setShowBareme(false)}
        title="Configurer le barème fiscal"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowBareme(false)}>Annuler</Button>
            <Button onClick={saveBareme}><Save size={14} /> Enregistrer le barème</Button>
          </>
        }
      >
        <p className={styles.baremeHelp}>
          Définit le montant d&apos;impôt dû par rang. Un montant à <strong>0</strong> exempte
          ce rang d&apos;impôt (Kazekage, Apprenti, etc.).
        </p>

        <div className={styles.baremeTable}>
          <div className={styles.baremeHead}>
            <div>Rang</div>
            <div>Montant (₽)</div>
            <div></div>
          </div>
          {baremeForm.map((g, idx) => (
            <div key={idx} className={styles.baremeRow}>
              <input
                type="text"
                value={g.rang ?? ''}
                onChange={(e) => updateBaremeLine(idx, 'rang', e.target.value)}
                placeholder="Ex: Genin"
                className={styles.baremeInput}
              />
              <input
                type="number"
                min="0"
                value={g.montant ?? 0}
                onChange={(e) => updateBaremeLine(idx, 'montant', e.target.value)}
                className={styles.baremeInput}
              />
              <button
                className={styles.removeBaremeBtn}
                onClick={() => removeBaremeLine(idx)}
                aria-label="Retirer cette ligne"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button className={styles.addBaremeBtn} onClick={addBaremeLine}>
            <Plus size={12} /> Ajouter un rang
          </button>
        </div>
      </Modal>
    </>
  );
}
