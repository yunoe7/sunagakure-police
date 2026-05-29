'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — ÉCONOMIE : Sociétés + déclaration CA + renflouer BDM
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir          : canVoirEconomie
 * - Gérer sociétés: canGererSocietes (créer / éditer / archiver)
 * - Déclarer CA   : canDeclarerCA
 * - Renflouer BDM : canRenflouerBDM (Gérant/Co-Gérant + admin/Jonin+)
 *
 * 📜 Audit log :
 *   - koeki:societe        (create / update / archive)
 *   - koeki:declaration    (create) + tresor:mouvement (create)
 *   - koeki:bdm            (renflouement) + tresor:retrait + compta missions
 *
 * ⭐ Lien Trésor (pattern page Impôts / Vision C) :
 *   Déclarer CA  → crée TresorMouvement (TM-SOC-*, section 'koeki')
 *   Renflouer BDM→ crée TresorRetrait (sortie Trésor) + entrée comptaMissions
 *   Trésor d'abord, métier ensuite. Audit sur tous les cas.
 *
 * ⭐ Relance fiscale : une société active est "à déclarer" si elle n'a
 *   aucune DeclarationCA pour la semaine courante. Badge + compteur + filtre.
 *
 * Stockage Firebase :
 *   koeki/societes      → Societe[]
 *   koeki/declarations  → DeclarationCA[]
 *   koeki/parametres    → KoekiParametres
 *   tresorCentral       → { mouvements, retraits, prelevementRate }
 *   comptaMissions      → { transactions, archives }  (caisse BDM)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Archive, ArchiveRestore, Search, Building2, Save,
  Coins, Landmark, HandCoins, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet, dbUpdate } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Societe, type SocieteType, type KoekiParametres, type DeclarationCA,
  SOCIETE_TYPES, SOCIETE_TYPE_LABEL, SOCIETE_TYPE_ICON,
  DEFAULT_TAUX_PAR_TYPE, tauxEffectif, calculImpot, genId, fmtMoney,
} from '@/types/koeki';
import {
  type TresorCentral, type TresorMouvement, type TresorRetrait,
  type ComptaData, type ComptaTransaction,
  TRESOR_DEFAULT_RATE,
} from '@/types/compta';
import { currentWeek } from '@/types/fiscal';

import styles from './page.module.css';

const FB_SOCIETES = 'koeki/societes';
const FB_PARAMS = 'koeki/parametres';
const FB_DECLARATIONS = 'koeki/declarations';
const FB_TRESOR = 'tresorCentral';
const FB_BDM = 'comptaMissions';

type FilterActif = 'actifs' | 'archives' | 'all';

export default function KoekiEconomiePage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canGerer = u.can.koeki.gererSocietes();
  const canDeclarer = u.can.koeki.declarerCA();
  const canRenflouer = u.can.koeki.renflouerBDM();

  const { data: societesData, loading } = useFirebaseValue<Societe[] | null>(FB_SOCIETES);
  const { data: paramsData } = useFirebaseValue<KoekiParametres | null>(FB_PARAMS);
  const { data: declarationsData } = useFirebaseValue<DeclarationCA[] | null>(FB_DECLARATIONS);
  const { data: tresorData } = useFirebaseValue<TresorCentral | null>(FB_TRESOR);
  const { data: bdmData } = useFirebaseValue<ComptaData | null>(FB_BDM);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | SocieteType>('all');
  const [filterActif, setFilterActif] = useState<FilterActif>('actifs');
  const [filterRelance, setFilterRelance] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Societe | null>(null);
  const [form, setForm] = useState<Partial<Societe>>({});

  // Déclaration de CA
  const [showDeclare, setShowDeclare] = useState(false);
  const [declareSociete, setDeclareSociete] = useState<Societe | null>(null);
  const [caInput, setCaInput] = useState<string>('');

  // Renflouer BDM
  const [showBdm, setShowBdm] = useState(false);
  const [bdmMontant, setBdmMontant] = useState<string>('');
  const [bdmMotif, setBdmMotif] = useState<string>('');

  const semaineActuelle = currentWeek();

  const params = useMemo<KoekiParametres>(() => ({
    tauxParType: paramsData?.tauxParType ?? DEFAULT_TAUX_PAR_TYPE,
    paieParGrade: paramsData?.paieParGrade,
  }), [paramsData]);

  const societes = useMemo<Societe[]>(() => {
    const list = Array.isArray(societesData)
      ? societesData
      : societesData ? Object.values(societesData) : [];
    return list.filter((s): s is Societe => s !== null && typeof s === 'object' && !!s.id);
  }, [societesData]);

  const declarations = useMemo<DeclarationCA[]>(() => {
    const list = Array.isArray(declarationsData)
      ? declarationsData
      : declarationsData ? Object.values(declarationsData) : [];
    return list.filter((d): d is DeclarationCA => d !== null && typeof d === 'object' && !!d.id);
  }, [declarationsData]);

  // ⭐ Ensemble des societeId ayant déclaré cette semaine
  const declareCetteSemaine = useMemo(() => {
    const s = new Set<string>();
    for (const d of declarations) {
      if (d.semaine === semaineActuelle && d.societeId) s.add(d.societeId);
    }
    return s;
  }, [declarations, semaineActuelle]);

  function aDeclare(s: Societe): boolean {
    return declareCetteSemaine.has(s.id);
  }

  // Trésor normalisé (même pattern que /tresor et /impots)
  const tresorCurrent = useMemo<TresorCentral>(() => ({
    prelevementRate: tresorData?.prelevementRate ?? TRESOR_DEFAULT_RATE,
    mouvements: (Array.isArray(tresorData?.mouvements) ? tresorData!.mouvements :
                 tresorData?.mouvements ? Object.values(tresorData.mouvements) : [])
                 .filter((m): m is TresorMouvement => m !== null && typeof m === 'object' && !!m.id),
    retraits: (Array.isArray(tresorData?.retraits) ? tresorData!.retraits :
               tresorData?.retraits ? Object.values(tresorData.retraits) : [])
               .filter((r): r is TresorRetrait => r !== null && typeof r === 'object' && !!r.id),
  }), [tresorData]);

  // Caisse BDM normalisée
  const bdmCurrent = useMemo<ComptaData>(() => ({
    transactions: (Array.isArray(bdmData?.transactions) ? bdmData!.transactions :
                   bdmData?.transactions ? Object.values(bdmData.transactions) : [])
                   .filter((t): t is ComptaTransaction => t !== null && typeof t === 'object'),
    archives: (Array.isArray(bdmData?.archives) ? bdmData!.archives :
               bdmData?.archives ? Object.values(bdmData.archives) : []),
  }), [bdmData]);

  const visible = useMemo(() => {
    let list = societes;
    if (filterActif === 'actifs') list = list.filter((s) => s.actif);
    else if (filterActif === 'archives') list = list.filter((s) => !s.actif);
    if (filterType !== 'all') list = list.filter((s) => s.type === filterType);
    if (filterRelance) list = list.filter((s) => s.actif && !aDeclare(s));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        ((s.nom || '') + ' ' + (s.proprietaireNom || '') + ' ' + (s.type || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  }, [societes, filterActif, filterType, filterRelance, search, declareCetteSemaine]);

  const stats = useMemo(() => {
    const actives = societes.filter((s) => s.actif);
    const parType = new Map<SocieteType, number>();
    for (const s of actives) parType.set(s.type, (parType.get(s.type) || 0) + 1);
    const totalImpotCollecte = declarations.reduce((acc, d) => acc + (d.impot || 0), 0);
    const aJour = actives.filter((s) => declareCetteSemaine.has(s.id)).length;
    const aRelancer = actives.length - aJour;
    return {
      total: actives.length,
      archivees: societes.length - actives.length,
      parType,
      totalImpotCollecte,
      aJour,
      aRelancer,
    };
  }, [societes, declarations, declareCetteSemaine]);

  // ─── CRUD société ─────────────────────────────────────────────
  function openCreate() {
    setEditing(null);
    setForm({ type: 'restaurant', tauxImposition: null, actif: true });
    setShowForm(true);
  }
  function openEdit(s: Societe) {
    setEditing(s);
    setForm({ ...s });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    if (!form.type) { toast.error('Le type est obligatoire'); return; }
    if (!form.proprietaireNom?.trim()) { toast.error('Le propriétaire est obligatoire'); return; }

    let taux: number | null = null;
    if (form.tauxImposition !== null && form.tauxImposition !== undefined && String(form.tauxImposition) !== '') {
      const n = Number(form.tauxImposition);
      if (isNaN(n) || n < 0 || n > 100) {
        toast.error('Le taux doit être entre 0 et 100 (ou vide pour le taux global)');
        return;
      }
      taux = n;
    }

    try {
      if (editing) {
        const updated: Societe = {
          ...editing,
          nom: form.nom!.trim(),
          type: form.type as SocieteType,
          proprietaireId: form.proprietaireId?.trim() || editing.proprietaireId || '',
          proprietaireNom: form.proprietaireNom!.trim(),
          tauxImposition: taux,
          notes: form.notes?.trim() || undefined,
        };
        await dbSet(FB_SOCIETES, societes.map((s) => (s.id === editing.id ? updated : s)));
        logAction({
          who: CURRENT_USER, whoId: u.id ?? null,
          action: 'update', target: 'koeki:societe', targetId: updated.id,
          detail: `Kōeki — Société modifiée : "${updated.nom}" ` +
            `(${SOCIETE_TYPE_LABEL[updated.type]}, propriétaire ${updated.proprietaireNom}, ` +
            `taux ${updated.tauxImposition === null ? 'global' : updated.tauxImposition + '%'})`,
        });
        toast.success('Société mise à jour');
      } else {
        const nouvelle: Societe = {
          id: genId('SOC'),
          nom: form.nom!.trim(),
          type: form.type as SocieteType,
          proprietaireId: form.proprietaireId?.trim() || '',
          proprietaireNom: form.proprietaireNom!.trim(),
          tauxImposition: taux,
          dateCreation: Date.now(),
          actif: true,
          notes: form.notes?.trim() || undefined,
        };
        await dbSet(FB_SOCIETES, [...societes, nouvelle]);
        logAction({
          who: CURRENT_USER, whoId: u.id ?? null,
          action: 'create', target: 'koeki:societe', targetId: nouvelle.id,
          detail: `Kōeki — Société créée : "${nouvelle.nom}" ` +
            `(${SOCIETE_TYPE_LABEL[nouvelle.type]}, propriétaire ${nouvelle.proprietaireNom}, ` +
            `taux ${nouvelle.tauxImposition === null ? 'global' : nouvelle.tauxImposition + '%'})`,
        });
        toast.success('Société créée');
      }
      setShowForm(false); setForm({}); setEditing(null);
    } catch (err) {
      console.error('[KOEKI SOCIETE SAVE]', err);
      toast.error('Erreur lors de l\'enregistrement');
    }
  }

  async function toggleArchive(s: Societe) {
    const versArchive = s.actif;
    const ok = await confirmAction({
      title: versArchive ? 'Archiver la société' : 'Réactiver la société',
      message: versArchive
        ? `Archiver "${s.nom}" ? Elle n'apparaîtra plus dans la liste active mais son historique est conservé.`
        : `Réactiver "${s.nom}" ?`,
      confirmLabel: versArchive ? 'Archiver' : 'Réactiver',
      variant: versArchive ? 'danger' : undefined,
    });
    if (!ok) return;
    try {
      const updated: Societe = { ...s, actif: !s.actif };
      await dbSet(FB_SOCIETES, societes.map((x) => (x.id === s.id ? updated : x)));
      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: versArchive ? 'delete' : 'update', target: 'koeki:societe', targetId: s.id,
        detail: `Kōeki — Société ${versArchive ? 'archivée' : 'réactivée'} : "${s.nom}"`,
      });
      toast.success(versArchive ? 'Société archivée' : 'Société réactivée');
    } catch { toast.error('Erreur'); }
  }

  // ─── Déclaration de CA ────────────────────────────────────────
  function openDeclare(s: Societe) {
    setDeclareSociete(s);
    setCaInput('');
    setShowDeclare(true);
  }

  async function handleDeclare() {
    if (!declareSociete) return;
    const ca = Number(caInput);
    if (!caInput || isNaN(ca) || ca <= 0) {
      toast.error('Le chiffre d\'affaires doit être un nombre positif');
      return;
    }
    const taux = tauxEffectif(declareSociete, params);
    const impot = calculImpot(ca, taux);
    const semaine = currentWeek();

    const ok = await confirmAction({
      title: 'Déclarer le chiffre d\'affaires',
      message: `Déclarer un CA de ${fmtMoney(ca)} ₽ pour "${declareSociete.nom}" ?\n` +
        `Impôt (${taux}%) : ${fmtMoney(impot)} ₽ → versé au Trésor Central.`,
      confirmLabel: 'Déclarer',
    });
    if (!ok) return;

    try {
      const now = Date.now();
      const declId = now;

      const tresorMouvement: TresorMouvement = {
        id: 'TM-SOC-' + declId,
        section: 'koeki',
        sectionLabel: 'Fiscalité sociétés',
        amount: impot,
        date: now,
        archiveId: declareSociete.id,
        archiveLabel: `${declareSociete.nom} — CA semaine ${semaine}`,
        rate: taux,
        soldeOrigine: ca,
      };

      const declaration: DeclarationCA = {
        id: declId,
        societeId: declareSociete.id,
        societeNom: declareSociete.nom,
        type: declareSociete.type,
        chiffreAffaires: ca,
        taux,
        impot,
        date: now,
        semaine,
        agent: CURRENT_USER,
        tresorMouvementId: tresorMouvement.id,
      };

      // 1. Trésor d'abord (si échec, pas de déclaration orpheline)
      await dbUpdate(FB_TRESOR, {
        ...tresorCurrent,
        mouvements: [...tresorCurrent.mouvements, tresorMouvement],
      });

      // 2. Déclaration ensuite
      await dbSet(FB_DECLARATIONS, [...declarations, declaration]);

      // Audit — déclaration
      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: 'create', target: 'koeki:declaration', targetId: String(declaration.id),
        detail: `Kōeki — Déclaration CA "${declareSociete.nom}" : CA ${fmtMoney(ca)} ₽, ` +
          `impôt ${fmtMoney(impot)} ₽ (${taux}%, semaine ${semaine}) — versé au Trésor (${tresorMouvement.id})`,
      });
      // Audit — mouvement Trésor
      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: 'create', target: 'tresor:mouvement', targetId: tresorMouvement.id,
        detail: `Trésor — Versement Fiscalité sociétés : +${fmtMoney(impot)} ₽ ` +
          `(${declareSociete.nom}, CA ${fmtMoney(ca)} ₽, semaine ${semaine})`,
      });

      toast.success(`Impôt de ${fmtMoney(impot)} ₽ versé au Trésor`);
      setShowDeclare(false);
      setDeclareSociete(null);
      setCaInput('');
    } catch (err) {
      console.error('[KOEKI DECLARE]', err);
      toast.error('Erreur lors de la déclaration');
    }
  }

  // ─── Renflouer le BDM ─────────────────────────────────────────
  function openRenflouer() {
    setBdmMontant('');
    setBdmMotif('');
    setShowBdm(true);
  }

  async function handleRenflouer() {
    const montant = Number(bdmMontant);
    if (!bdmMontant || isNaN(montant) || montant <= 0) {
      toast.error('Le montant doit être un nombre positif');
      return;
    }
    const motif = bdmMotif.trim() || 'Renflouement BDM';

    // Solde Trésor pour avertir si dépassement
    const totalRecu = tresorCurrent.mouvements.reduce((s, m) => s + (m.amount || 0), 0);
    const totalRetire = (tresorCurrent.retraits || []).reduce((s, r) => s + (r.montant || 0), 0);
    const soldeTresor = totalRecu - totalRetire;

    let depassement = false;
    if (montant > soldeTresor) {
      const ok = await confirmAction({
        title: 'Solde Trésor insuffisant',
        message: `Le renflouement (${fmtMoney(montant)} ₽) dépasse le solde du Trésor (${fmtMoney(soldeTresor)} ₽). Confirmer quand même ?`,
        confirmLabel: 'Confirmer', variant: 'danger',
      });
      if (!ok) return;
      depassement = true;
    } else {
      const ok = await confirmAction({
        title: 'Renflouer le Bureau des Missions',
        message: `Transférer ${fmtMoney(montant)} ₽ du Trésor Central vers la caisse du BDM ?\nMotif : "${motif}"`,
        confirmLabel: 'Renflouer',
      });
      if (!ok) return;
    }

    try {
      const now = Date.now();

      const retrait: TresorRetrait = {
        id: 'TR-BDM-' + now,
        date: now,
        montant,
        motif: `Renflouement BDM — ${motif}`,
        agent: CURRENT_USER,
      };

      const entreeBdm: ComptaTransaction = {
        id: now,
        type: 'entree',
        category: 'don',
        montant,
        description: `Renflouement depuis le Trésor Central — ${motif}`,
        date: now,
        agent: CURRENT_USER,
        ref: retrait.id,
      };

      await dbUpdate(FB_TRESOR, {
        ...tresorCurrent,
        retraits: [retrait, ...(tresorCurrent.retraits || [])],
      });

      await dbUpdate(FB_BDM, {
        ...bdmCurrent,
        transactions: [entreeBdm, ...bdmCurrent.transactions],
      });

      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: 'create', target: 'tresor:retrait', targetId: retrait.id,
        detail: `Trésor — Renflouement BDM : −${fmtMoney(montant)} ₽ — Motif : "${motif}" ` +
          `(solde avant : ${fmtMoney(soldeTresor)} ₽${depassement ? ', DÉPASSEMENT' : ''})`,
      });
      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: 'create', target: 'koeki:bdm', targetId: String(entreeBdm.id),
        detail: `Kōeki — Renflouement BDM crédité : +${fmtMoney(montant)} ₽ ` +
          `dans la caisse Missions (motif "${motif}", lié au retrait ${retrait.id})`,
      });

      toast.success(`${fmtMoney(montant)} ₽ transférés au BDM`);
      setShowBdm(false);
      setBdmMontant('');
      setBdmMotif('');
    } catch (err) {
      console.error('[KOEKI RENFLOUER BDM]', err);
      toast.error('Erreur lors du renflouement');
    }
  }

  // Aperçu de l'impôt dans le modal de déclaration
  const declarePreview = useMemo(() => {
    if (!declareSociete) return null;
    const taux = tauxEffectif(declareSociete, params);
    const ca = Number(caInput);
    const impot = !isNaN(ca) && ca > 0 ? calculImpot(ca, taux) : 0;
    return { taux, impot };
  }, [declareSociete, caInput, params]);

  return (
    <>
      <Card
        title="🏯 Kōeki — Économie"
        subtitle="Registre des sociétés privées imposables"
        actions={
          <>
            {canRenflouer && (
              <Button variant="outline" onClick={openRenflouer}>
                <HandCoins size={14} /> Renflouer le BDM
              </Button>
            )}
            {canGerer && (
              <Button onClick={openCreate}>
                <Plus size={14} /> Nouvelle société
              </Button>
            )}
          </>
        }
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Building2 size={16} />
            <div className={styles.statVal}>{stats.total}</div>
            <div className={styles.statLbl}>Sociétés actives</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Coins size={16} />
            <div className={styles.statVal}>{fmtMoney(stats.totalImpotCollecte)} ₽</div>
            <div className={styles.statLbl}>Impôts collectés (total)</div>
          </div>
          <div className={`${styles.statCard} ${stats.aRelancer > 0 ? styles.scDanger : styles.scGreen}`}>
            {stats.aRelancer > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <div className={styles.statVal}>{stats.aJour} / {stats.total}</div>
            <div className={styles.statLbl}>Ont déclaré ({semaineActuelle})</div>
          </div>
          {SOCIETE_TYPES.map((t) => (
            <div key={t} className={`${styles.statCard} ${styles.scBlue}`}>
              <span style={{ fontSize: 16 }}>{SOCIETE_TYPE_ICON[t]}</span>
              <div className={styles.statVal}>{stats.parType.get(t) || 0}</div>
              <div className={styles.statLbl}>{SOCIETE_TYPE_LABEL[t]}</div>
            </div>
          ))}
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Nom, propriétaire…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={styles.filterSelect} value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | SocieteType)}>
            <option value="all">Tous les types</option>
            {SOCIETE_TYPES.map((t) => (
              <option key={t} value={t}>{SOCIETE_TYPE_ICON[t]} {SOCIETE_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <select className={styles.filterSelect} value={filterActif}
            onChange={(e) => setFilterActif(e.target.value as FilterActif)}>
            <option value="actifs">Actives</option>
            <option value="archives">Archivées</option>
            <option value="all">Toutes</option>
          </select>
          <button
            className={`${styles.relanceBtn} ${filterRelance ? styles.relanceBtnOn : ''}`}
            onClick={() => setFilterRelance((v) => !v)}
            title="N'afficher que les sociétés actives qui n'ont pas déclaré cette semaine"
          >
            <AlertTriangle size={13} /> À relancer{stats.aRelancer > 0 ? ` (${stats.aRelancer})` : ''}
          </button>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Building2 size={32} style={{ opacity: 0.3 }} />
            <p>
              {filterRelance
                ? 'Aucune société à relancer : tout le monde a déclaré cette semaine. 🎉'
                : societes.length === 0 ? 'Aucune société enregistrée.' : 'Aucune société pour ces critères.'}
              {canGerer && societes.length === 0 ? ' Utilise « Nouvelle société » pour commencer.' : ''}
            </p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Société</th>
                <th>Type</th>
                <th>Propriétaire</th>
                <th style={{ textAlign: 'center' }}>Fisc. {semaineActuelle}</th>
                <th style={{ textAlign: 'right' }}>Taux effectif</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const taux = tauxEffectif(s, params);
                const override = s.tauxImposition !== null;
                const declare = aDeclare(s);
                return (
                  <tr key={s.id} className={s.actif ? '' : styles.rowArchived}>
                    <td>
                      <strong>{s.nom}</strong>
                      {!s.actif && <span className={styles.archivedTag}>archivée</span>}
                    </td>
                    <td>
                      <span className={styles.typeChip}>
                        {SOCIETE_TYPE_ICON[s.type]} {SOCIETE_TYPE_LABEL[s.type]}
                      </span>
                    </td>
                    <td className={styles.muted}>{s.proprietaireNom || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {!s.actif ? (
                        <span className={styles.muted}>—</span>
                      ) : declare ? (
                        <span className={styles.fiscOk}><CheckCircle2 size={12} /> Déclaré</span>
                      ) : (
                        <span className={styles.fiscRelance}><AlertTriangle size={12} /> À déclarer</span>
                      )}
                    </td>
                    <td className={styles.amount} style={{ textAlign: 'right' }}>
                      {taux}%
                      {override
                        ? <span className={styles.tauxTag}>perso</span>
                        : <span className={styles.tauxTagGlobal}>global</span>}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        {canDeclarer && s.actif && (
                          <Button size="sm" onClick={() => openDeclare(s)}>
                            <Coins size={12} /> Déclarer CA
                          </Button>
                        )}
                        {canGerer && (
                          <>
                            <button className={styles.iconBtn} onClick={() => openEdit(s)} aria-label="Modifier">
                              <Pencil size={13} />
                            </button>
                            <button className={styles.iconBtn} onClick={() => toggleArchive(s)}
                              aria-label={s.actif ? 'Archiver' : 'Réactiver'}>
                              {s.actif ? <Archive size={13} /> : <ArchiveRestore size={13} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Modal création / édition société */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editing ? 'Modifier la société' : 'Nouvelle société'} size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Nom de la société *
            <input type="text" value={form.nom ?? ''} autoFocus
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="Ex: Ramen Ichiraku" />
          </label>
          <label>Type *
            <select value={form.type ?? 'restaurant'}
              onChange={(e) => setForm({ ...form, type: e.target.value as SocieteType })}>
              {SOCIETE_TYPES.map((t) => (
                <option key={t} value={t}>{SOCIETE_TYPE_ICON[t]} {SOCIETE_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label>Propriétaire *
            <input type="text" value={form.proprietaireNom ?? ''}
              onChange={(e) => setForm({ ...form, proprietaireNom: e.target.value })}
              placeholder="Nom du ninja propriétaire" />
          </label>
          <label>Taux d'imposition personnalisé (%)
            <input type="number" min="0" max="100" step="1" value={form.tauxImposition ?? ''}
              onChange={(e) => setForm({ ...form, tauxImposition: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder={`Vide = taux global (${form.type ? params.tauxParType[form.type as SocieteType] : '—'}%)`} />
          </label>
          <p className={styles.help}>
            Laisse vide pour utiliser le taux global du type
            {form.type ? ` (${SOCIETE_TYPE_LABEL[form.type as SocieteType]} : ${params.tauxParType[form.type as SocieteType]}%)` : ''}.
          </p>
          <label>Notes
            <textarea rows={2} value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optionnel" />
          </label>
        </div>
      </Modal>

      {/* Modal déclaration de CA */}
      <Modal open={showDeclare} onClose={() => setShowDeclare(false)}
        title={declareSociete ? `Déclarer un CA — ${declareSociete.nom}` : 'Déclarer un CA'} size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDeclare(false)}>Annuler</Button>
            <Button onClick={handleDeclare}><Coins size={14} /> Déclarer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Chiffre d'affaires (₽) *
            <input type="number" min="1" step="1" value={caInput} autoFocus
              onChange={(e) => setCaInput(e.target.value)} placeholder="Ex: 50000" />
          </label>
          {declarePreview && (
            <div className={styles.declarePreview}>
              <div className={styles.previewRow}>
                <span>Taux appliqué</span>
                <strong>{declarePreview.taux}%</strong>
              </div>
              <div className={styles.previewRow}>
                <span>Impôt dû (→ Trésor)</span>
                <strong className={styles.previewImpot}>{fmtMoney(declarePreview.impot)} ₽</strong>
              </div>
            </div>
          )}
          <p className={styles.help}>
            L'impôt sera ajouté au Trésor Central (section Kōeki). La déclaration
            est consultable dans <strong>Comptas → Déclarations</strong>.
          </p>
        </div>
      </Modal>

      {/* Modal renflouer le BDM */}
      <Modal open={showBdm} onClose={() => setShowBdm(false)}
        title="Renflouer le Bureau des Missions" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowBdm(false)}>Annuler</Button>
            <Button onClick={handleRenflouer}><Landmark size={14} /> Renflouer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <p className={styles.help}>
            Transfère de l'argent du <strong>Trésor Central</strong> vers la caisse
            du <strong>Bureau des Missions</strong>. Crée un retrait côté Trésor et une
            entrée côté BDM.
          </p>
          <label>Montant (₽) *
            <input type="number" min="1" step="1" value={bdmMontant} autoFocus
              onChange={(e) => setBdmMontant(e.target.value)} placeholder="Ex: 100000" />
          </label>
          <label>Motif
            <textarea rows={2} value={bdmMotif}
              onChange={(e) => setBdmMotif(e.target.value)}
              placeholder="Raison du renflouement (optionnel)" />
          </label>
        </div>
      </Modal>
    </>
  );
}
