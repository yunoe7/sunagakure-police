'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — COMPTAS (onglets : Fiches membres + Déclarations CA)
 * ════════════════════════════════════════════════════════════════
 *
 * Onglet « Fiches membres » (Phase 4) :
 *   - Gérant ajoute manuellement les membres (nom + grade)
 *   - Fiche par membre : solde + historique de mouvements
 *   - Paie hebdo : bouton « Verser la paie » (tous les membres non payés cette semaine)
 *     → débite le Trésor (UN TresorRetrait groupé) + crédite chaque fiche
 *   - Pointage manuel : prime / sanction / remboursement / ajustement
 *   - Case « a organisé un event » par membre → paie 25k au lieu du grade
 *
 * Onglet « Déclarations CA » (Phase 3) :
 *   - Historique des déclarations + suppression symétrique (mouvement Trésor lié)
 *
 * Permissions :
 *   - Voir global / gérer fiches / payer : canVoirComptaGlobale + canPointerCompta
 *   - Simple membre : voit seulement sa propre fiche
 *
 * 📜 Audit : koeki:compta (membre/mouvement), koeki:paie, tresor:retrait,
 *            koeki:declaration + tresor:mouvement (suppression).
 *
 * Stockage Firebase :
 *   koeki/comptas       → Record<id, ComptaKoeki>  (ou ComptaKoeki[])
 *   koeki/declarations  → DeclarationCA[]
 *   tresorCentral       → { mouvements, retraits, prelevementRate }
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Search, Receipt, Coins, Users, Wallet, Save,
  TrendingUp, TrendingDown, Banknote, UserPlus,
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
  type DeclarationCA, type SocieteType,
  type ComptaKoeki, type MouvementCompta, type MouvementComptaType, type KoekiGrade,
  SOCIETE_TYPES, SOCIETE_TYPE_LABEL, SOCIETE_TYPE_ICON,
  KOEKI_GRADE_LABEL, MOUVEMENT_COMPTA_LABEL,
  DEFAULT_PAIE_PAR_GRADE, PAIE_ORGANISATEUR_EVENT,
  paieDeLaSemaine, recomputeSolde, genId,
  fmtMoney, fmtDateFR, fmtDateTimeFR,
} from '@/types/koeki';
import {
  type TresorCentral, type TresorMouvement, type TresorRetrait,
  TRESOR_DEFAULT_RATE,
} from '@/types/compta';
import { currentWeek } from '@/types/fiscal';

import styles from './page.module.css';

const FB_DECLARATIONS = 'koeki/declarations';
const FB_COMPTAS = 'koeki/comptas';
const FB_TRESOR = 'tresorCentral';

const GRADES_LISTE: KoekiGrade[] = [
  'gerant', 'co-gerant', 'superviseur-eco', 'superviseur-event',
  'chef-eco', 'chef-event', 'membre-eco', 'membre-event',
];

type Tab = 'membres' | 'declarations';

export default function KoekiComptaPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const CURRENT_USER_ID = u.id;
  const canVoirGlobal = u.can.koeki.voirComptaGlobale();
  const canPointer = u.can.koeki.pointerCompta();
  const canDeleteDecl = u.can.koeki.gererSocietes();

  const { data: comptasData, loading: loadingComptas } = useFirebaseValue<ComptaKoeki[] | Record<string, ComptaKoeki> | null>(FB_COMPTAS);
  const { data: declarationsData } = useFirebaseValue<DeclarationCA[] | null>(FB_DECLARATIONS);
  const { data: tresorData } = useFirebaseValue<TresorCentral | null>(FB_TRESOR);

  const [tab, setTab] = useState<Tab>('membres');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | SocieteType>('all');

  // Ajout membre
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberNom, setNewMemberNom] = useState('');
  const [newMemberGrade, setNewMemberGrade] = useState<KoekiGrade>('membre-eco');

  // Pointage
  const [showPoint, setShowPoint] = useState(false);
  const [pointFiche, setPointFiche] = useState<ComptaKoeki | null>(null);
  const [pointType, setPointType] = useState<MouvementComptaType>('prime');
  const [pointMontant, setPointMontant] = useState('');
  const [pointMotif, setPointMotif] = useState('');

  // Détail fiche
  const [detailFiche, setDetailFiche] = useState<ComptaKoeki | null>(null);

  // Events de la semaine (coché par membre, en mémoire locale jusqu'au versement)
  const [eventChecks, setEventChecks] = useState<Record<string, boolean>>({});

  const comptas = useMemo<ComptaKoeki[]>(() => {
    const list = Array.isArray(comptasData)
      ? comptasData
      : comptasData ? Object.values(comptasData) : [];
    return list.filter((c): c is ComptaKoeki => c !== null && typeof c === 'object' && !!c.discordId)
      .map((c) => ({
        ...c,
        mouvements: Array.isArray(c.mouvements) ? c.mouvements : (c.mouvements ? Object.values(c.mouvements) : []),
        solde: typeof c.solde === 'number' ? c.solde : recomputeSolde(Array.isArray(c.mouvements) ? c.mouvements : []),
      }));
  }, [comptasData]);

  const declarations = useMemo<DeclarationCA[]>(() => {
    const list = Array.isArray(declarationsData)
      ? declarationsData
      : declarationsData ? Object.values(declarationsData) : [];
    return list.filter((d): d is DeclarationCA => d !== null && typeof d === 'object' && !!d.id);
  }, [declarationsData]);

  const tresorCurrent = useMemo<TresorCentral>(() => ({
    prelevementRate: tresorData?.prelevementRate ?? TRESOR_DEFAULT_RATE,
    mouvements: (Array.isArray(tresorData?.mouvements) ? tresorData!.mouvements :
                 tresorData?.mouvements ? Object.values(tresorData.mouvements) : [])
                 .filter((m): m is TresorMouvement => m !== null && typeof m === 'object' && !!m.id),
    retraits: (Array.isArray(tresorData?.retraits) ? tresorData!.retraits :
               tresorData?.retraits ? Object.values(tresorData.retraits) : [])
               .filter((r): r is TresorRetrait => r !== null && typeof r === 'object' && !!r.id),
  }), [tresorData]);

  const semaine = currentWeek();

  // Fiche du user courant (si simple membre)
  const maFiche = useMemo(
    () => comptas.find((c) => c.discordId === CURRENT_USER_ID) ?? null,
    [comptas, CURRENT_USER_ID]
  );

  // ─── Helpers persistance comptas ──────────────────────────────
  async function persistComptas(next: ComptaKoeki[]) {
    await dbSet(FB_COMPTAS, next);
  }

  // ─── Ajout d'un membre ────────────────────────────────────────
  async function handleAddMember() {
    if (!newMemberNom.trim()) { toast.error('Le nom est obligatoire'); return; }
    const id = genId('KM'); // identifiant compta (pas un discordId réel tant qu'on n'a pas lié)
    const fiche: ComptaKoeki = {
      discordId: id,
      username: newMemberNom.trim(),
      grade: newMemberGrade,
      mouvements: [],
      solde: 0,
    };
    try {
      await persistComptas([...comptas, fiche]);
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'create', target: 'koeki:compta', targetId: id,
        detail: `Kōeki — Fiche compta créée : ${fiche.username} (${KOEKI_GRADE_LABEL[newMemberGrade]})`,
      });
      toast.success('Membre ajouté');
      setShowAddMember(false);
      setNewMemberNom('');
      setNewMemberGrade('membre-eco');
    } catch { toast.error('Erreur'); }
  }

  async function handleRemoveMember(c: ComptaKoeki) {
    const ok = await confirmAction({
      title: 'Retirer le membre',
      message: `Retirer la fiche de ${c.username} ? Son historique (${c.mouvements.length} mouvement(s), solde ${fmtMoney(c.solde)} ₽) sera supprimé.`,
      confirmLabel: 'Retirer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await persistComptas(comptas.filter((x) => x.discordId !== c.discordId));
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'delete', target: 'koeki:compta', targetId: c.discordId,
        detail: `Kōeki — Fiche compta supprimée : ${c.username} (solde était ${fmtMoney(c.solde)} ₽)`,
      });
      toast.success('Membre retiré');
    } catch { toast.error('Erreur'); }
  }

  // ─── Pointage manuel (prime / sanction / etc.) ────────────────
  function openPoint(c: ComptaKoeki) {
    setPointFiche(c);
    setPointType('prime');
    setPointMontant('');
    setPointMotif('');
    setShowPoint(true);
  }

  async function handlePoint() {
    if (!pointFiche) return;
    const montantAbs = Number(pointMontant);
    if (!pointMontant || isNaN(montantAbs) || montantAbs <= 0) {
      toast.error('Le montant doit être positif'); return;
    }
    // Sanction = débit (négatif), le reste = crédit (positif)
    const signe = pointType === 'sanction' ? -1 : 1;
    const montant = signe * montantAbs;

    const mouvement: MouvementCompta = {
      id: genId('MC'),
      type: pointType,
      montant,
      motif: pointMotif.trim() || undefined,
      date: Date.now(),
      agent: CURRENT_USER,
    };

    try {
      const next = comptas.map((c) => {
        if (c.discordId !== pointFiche.discordId) return c;
        const mouvements = [mouvement, ...c.mouvements];
        return { ...c, mouvements, solde: recomputeSolde(mouvements) };
      });
      await persistComptas(next);

      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'create', target: 'koeki:compta', targetId: pointFiche.discordId,
        detail: `Kōeki — ${MOUVEMENT_COMPTA_LABEL[pointType]} pour ${pointFiche.username} : ` +
          `${montant >= 0 ? '+' : ''}${fmtMoney(montant)} ₽` +
          (pointMotif.trim() ? ` — "${pointMotif.trim()}"` : ''),
      });

      toast.success(`${MOUVEMENT_COMPTA_LABEL[pointType]} enregistrée`);
      setShowPoint(false);
      setPointFiche(null);
    } catch { toast.error('Erreur'); }
  }

  // ─── Paie hebdo ───────────────────────────────────────────────
  async function handleVerserPaie() {
    // Membres pas encore payés cette semaine
    const aPayer = comptas.filter((c) => c.dernierVersement !== semaine && c.grade);
    if (aPayer.length === 0) {
      toast.info('Tous les membres ont déjà été payés cette semaine.');
      return;
    }

    // Calcul du total + détail
    const details = aPayer.map((c) => {
      const organisaEvent = !!eventChecks[c.discordId];
      const montant = paieDeLaSemaine({
        grade: c.grade,
        organisaEvent,
        bareme: DEFAULT_PAIE_PAR_GRADE,
      });
      return { fiche: c, montant, organisaEvent };
    }).filter((d) => d.montant > 0);

    const total = details.reduce((s, d) => s + d.montant, 0);
    if (total === 0) {
      toast.info('Aucun montant à verser.');
      return;
    }

    // Solde Trésor
    const totalRecu = tresorCurrent.mouvements.reduce((s, m) => s + (m.amount || 0), 0);
    const totalRetire = (tresorCurrent.retraits || []).reduce((s, r) => s + (r.montant || 0), 0);
    const soldeTresor = totalRecu - totalRetire;

    let depassement = false;
    if (total > soldeTresor) {
      const ok = await confirmAction({
        title: 'Solde Trésor insuffisant',
        message: `La paie totale (${fmtMoney(total)} ₽ pour ${details.length} membre(s)) dépasse le solde du Trésor (${fmtMoney(soldeTresor)} ₽). Confirmer quand même ?`,
        confirmLabel: 'Confirmer', variant: 'danger',
      });
      if (!ok) return;
      depassement = true;
    } else {
      const ok = await confirmAction({
        title: 'Verser la paie de la semaine',
        message: `Verser ${fmtMoney(total)} ₽ à ${details.length} membre(s) pour la semaine ${semaine} ?\nCe montant sera débité du Trésor Central.`,
        confirmLabel: 'Verser la paie',
      });
      if (!ok) return;
    }

    try {
      const now = Date.now();

      // 1. Débit Trésor : UN retrait groupé
      const retrait: TresorRetrait = {
        id: 'TR-PAIE-' + now,
        date: now,
        montant: total,
        motif: `Paie Kōeki semaine ${semaine} — ${details.length} membre(s)`,
        agent: CURRENT_USER,
      };
      await dbUpdate(FB_TRESOR, {
        ...tresorCurrent,
        retraits: [retrait, ...(tresorCurrent.retraits || [])],
      });

      // 2. Crédit chaque fiche + marque la semaine payée
      const idsPayes = new Set(details.map((d) => d.fiche.discordId));
      const next = comptas.map((c) => {
        const d = details.find((x) => x.fiche.discordId === c.discordId);
        if (!d) return c;
        const mouvement: MouvementCompta = {
          id: genId('MC'),
          type: 'paie',
          montant: d.montant,
          motif: d.organisaEvent ? `Paie semaine ${semaine} (organisateur d'event)` : `Paie semaine ${semaine}`,
          date: now,
          agent: CURRENT_USER,
          semaine,
        };
        const mouvements = [mouvement, ...c.mouvements];
        return { ...c, mouvements, solde: recomputeSolde(mouvements), dernierVersement: semaine };
      });
      await persistComptas(next);

      // Audit — retrait Trésor
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'create', target: 'tresor:retrait', targetId: retrait.id,
        detail: `Trésor — Paie Kōeki semaine ${semaine} : −${fmtMoney(total)} ₽ ` +
          `(${details.length} membre(s)${depassement ? ', DÉPASSEMENT' : ''})`,
      });
      // Audit — paie globale
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'create', target: 'koeki:paie', targetId: semaine,
        detail: `Kōeki — Paie versée semaine ${semaine} : ${fmtMoney(total)} ₽ à ${details.length} membre(s) ` +
          `(${details.map((d) => `${d.fiche.username}: ${fmtMoney(d.montant)}`).join(', ')})`,
      });

      toast.success(`Paie versée : ${fmtMoney(total)} ₽ à ${details.length} membre(s)`);
      setEventChecks({});
    } catch (err) {
      console.error('[KOEKI PAIE]', err);
      toast.error('Erreur lors du versement de la paie');
    }
  }

  // ─── Suppression déclaration (Phase 3, inchangé) ──────────────
  async function handleDeleteDeclaration(d: DeclarationCA) {
    const ok = await confirmAction({
      title: 'Supprimer la déclaration',
      message: `Supprimer la déclaration de "${d.societeNom}" (CA ${fmtMoney(d.chiffreAffaires)} ₽, impôt ${fmtMoney(d.impot)} ₽) ?` +
        (d.tresorMouvementId ? ' Le mouvement Trésor associé sera aussi supprimé.' : ''),
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      if (d.tresorMouvementId) {
        const existeEncore = tresorCurrent.mouvements.some((m) => m.id === d.tresorMouvementId);
        if (existeEncore) {
          await dbUpdate(FB_TRESOR, {
            ...tresorCurrent,
            mouvements: tresorCurrent.mouvements.filter((m) => m.id !== d.tresorMouvementId),
          });
          logAction({
            who: CURRENT_USER, whoId: CURRENT_USER_ID,
            action: 'delete', target: 'tresor:mouvement', targetId: d.tresorMouvementId,
            detail: `Trésor — Suppression versement Fiscalité sociétés : −${fmtMoney(d.impot)} ₽ ` +
              `(suppression déclaration ${d.societeNom}, semaine ${d.semaine})`,
          });
        }
      }
      await dbSet(FB_DECLARATIONS, declarations.filter((x) => x.id !== d.id));
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'delete', target: 'koeki:declaration', targetId: String(d.id),
        detail: `Kōeki — Suppression déclaration "${d.societeNom}" : ` +
          `CA ${fmtMoney(d.chiffreAffaires)} ₽, impôt ${fmtMoney(d.impot)} ₽ (semaine ${d.semaine})` +
          (d.tresorMouvementId ? ` — mouvement Trésor lié supprimé (${d.tresorMouvementId})` : ''),
      });
      toast.success('Déclaration supprimée');
    } catch { toast.error('Erreur'); }
  }

  // ─── Vues filtrées ────────────────────────────────────────────
  const visibleMembres = useMemo(() => {
    let list = comptas;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) =>
      ((c.username || '') + ' ' + (c.grade ? KOEKI_GRADE_LABEL[c.grade] : '')).toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  }, [comptas, search]);

  const visibleDeclarations = useMemo(() => {
    let list = declarations;
    if (filterType !== 'all') list = list.filter((d) => d.type === filterType);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) =>
      ((d.societeNom || '') + ' ' + (d.semaine || '') + ' ' + (d.agent || '')).toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => b.date - a.date);
  }, [declarations, filterType, search]);

  const statsMembres = useMemo(() => {
    const totalSolde = comptas.reduce((s, c) => s + (c.solde || 0), 0);
    const payesSemaine = comptas.filter((c) => c.dernierVersement === semaine).length;
    return { count: comptas.length, totalSolde, payesSemaine };
  }, [comptas, semaine]);

  const statsDecl = useMemo(() => {
    const totalCA = declarations.reduce((s, d) => s + (d.chiffreAffaires || 0), 0);
    const totalImpot = declarations.reduce((s, d) => s + (d.impot || 0), 0);
    return { count: declarations.length, totalCA, totalImpot };
  }, [declarations]);

  // ─── Vue simple membre (pas d'accès global) ───────────────────
  if (!canVoirGlobal) {
    return (
      <Card title="🏯 Kōeki — Ma compta" subtitle="Ta fiche personnelle">
        {maFiche ? (
          <FicheDetail fiche={maFiche} />
        ) : (
          <div className={styles.empty}>
            <Wallet size={32} style={{ opacity: 0.3 }} />
            <p>Aucune fiche compta à ton nom pour l'instant. Contacte un Gérant Kōeki.</p>
          </div>
        )}
      </Card>
    );
  }

  return (
    <>
      <Card
        title="🏯 Kōeki — Comptas"
        subtitle="Fiches des membres & déclarations fiscales"
        actions={
          tab === 'membres' ? (
            <>
              {canPointer && (
                <Button variant="outline" onClick={handleVerserPaie}>
                  <Banknote size={14} /> Verser la paie ({semaine})
                </Button>
              )}
              {canPointer && (
                <Button onClick={() => setShowAddMember(true)}>
                  <UserPlus size={14} /> Ajouter un membre
                </Button>
              )}
            </>
          ) : null
        }
      >
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'membres' ? styles.tabActive : ''}`} onClick={() => setTab('membres')}>
            <Users size={13} /> Fiches membres <span className={styles.tabCount}>{comptas.length}</span>
          </button>
          <button className={`${styles.tab} ${tab === 'declarations' ? styles.tabActive : ''}`} onClick={() => setTab('declarations')}>
            <Receipt size={13} /> Déclarations CA <span className={styles.tabCount}>{declarations.length}</span>
          </button>
        </div>

        {/* ───── ONGLET FICHES MEMBRES ───── */}
        {tab === 'membres' && (
          <>
            <div className={styles.statRow}>
              <div className={`${styles.statCard} ${styles.scGold}`}>
                <Users size={16} />
                <div className={styles.statVal}>{statsMembres.count}</div>
                <div className={styles.statLbl}>Membres</div>
              </div>
              <div className={`${styles.statCard} ${styles.scBlue}`}>
                <Wallet size={16} />
                <div className={styles.statVal}>{fmtMoney(statsMembres.totalSolde)} ₽</div>
                <div className={styles.statLbl}>Soldes cumulés</div>
              </div>
              <div className={`${styles.statCard} ${styles.scGold}`}>
                <Banknote size={16} />
                <div className={styles.statVal}>{statsMembres.payesSemaine} / {statsMembres.count}</div>
                <div className={styles.statLbl}>Payés cette semaine</div>
              </div>
            </div>

            <div className={styles.toolbar}>
              <div className={styles.searchBox}>
                <Search size={14} />
                <input type="text" placeholder="Nom, grade…" value={search}
                  onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            {loadingComptas ? (
              <p className={styles.empty}>Chargement…</p>
            ) : visibleMembres.length === 0 ? (
              <div className={styles.empty}>
                <Users size={32} style={{ opacity: 0.3 }} />
                <p>{comptas.length === 0 ? 'Aucun membre. Ajoute des membres pour gérer leur paie.' : 'Aucun membre pour ces critères.'}</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Membre</th>
                    <th>Grade</th>
                    <th style={{ textAlign: 'center' }}>Event semaine</th>
                    <th style={{ textAlign: 'center' }}>Payé {semaine}</th>
                    <th style={{ textAlign: 'right' }}>Solde</th>
                    <th aria-label="actions" />
                  </tr>
                </thead>
                <tbody>
                  {visibleMembres.map((c) => {
                    const paye = c.dernierVersement === semaine;
                    return (
                      <tr key={c.discordId}>
                        <td>
                          <button className={styles.linkName} onClick={() => setDetailFiche(c)}>
                            {c.username}
                          </button>
                        </td>
                        <td className={styles.muted}>{c.grade ? KOEKI_GRADE_LABEL[c.grade] : '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {canPointer && !paye ? (
                            <input
                              type="checkbox"
                              checked={!!eventChecks[c.discordId]}
                              onChange={(e) => setEventChecks({ ...eventChecks, [c.discordId]: e.target.checked })}
                              title="A organisé un event cette semaine (paie 25k)"
                            />
                          ) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {paye ? <span className={styles.payeTag}>✓</span> : <span className={styles.muted}>—</span>}
                        </td>
                        <td className={`${styles.amount} ${c.solde >= 0 ? styles.amtPos : styles.amtNeg}`} style={{ textAlign: 'right' }}>
                          {c.solde >= 0 ? '+' : ''}{fmtMoney(c.solde)} ₽
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            {canPointer && (
                              <Button size="sm" variant="outline" onClick={() => openPoint(c)}>
                                <Plus size={12} /> Pointer
                              </Button>
                            )}
                            {canPointer && (
                              <button className={styles.deleteBtn} onClick={() => handleRemoveMember(c)} aria-label="Retirer">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <p className={styles.paieHelp}>
              💡 « Verser la paie » paie tous les membres non encore payés cette semaine selon leur grade
              (Membre {fmtMoney(DEFAULT_PAIE_PAR_GRADE['membre-eco'])} ₽, responsables {fmtMoney(DEFAULT_PAIE_PAR_GRADE['chef-eco'])} ₽,
              organisateur d'event {fmtMoney(PAIE_ORGANISATEUR_EVENT)} ₽). Coche « Event semaine » avant de verser pour appliquer le tarif organisateur.
            </p>
          </>
        )}

        {/* ───── ONGLET DÉCLARATIONS CA ───── */}
        {tab === 'declarations' && (
          <>
            <div className={styles.statRow}>
              <div className={`${styles.statCard} ${styles.scGold}`}>
                <Receipt size={16} />
                <div className={styles.statVal}>{statsDecl.count}</div>
                <div className={styles.statLbl}>Déclarations</div>
              </div>
              <div className={`${styles.statCard} ${styles.scBlue}`}>
                <Coins size={16} />
                <div className={styles.statVal}>{fmtMoney(statsDecl.totalCA)} ₽</div>
                <div className={styles.statLbl}>CA déclaré (total)</div>
              </div>
              <div className={`${styles.statCard} ${styles.scGold}`}>
                <Coins size={16} />
                <div className={styles.statVal}>{fmtMoney(statsDecl.totalImpot)} ₽</div>
                <div className={styles.statLbl}>Impôts collectés</div>
              </div>
            </div>

            <div className={styles.toolbar}>
              <div className={styles.searchBox}>
                <Search size={14} />
                <input type="text" placeholder="Société, semaine, agent…" value={search}
                  onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className={styles.filterSelect} value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | SocieteType)}>
                <option value="all">Tous les types</option>
                {SOCIETE_TYPES.map((t) => (
                  <option key={t} value={t}>{SOCIETE_TYPE_ICON[t]} {SOCIETE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>

            {visibleDeclarations.length === 0 ? (
              <div className={styles.empty}>
                <Receipt size={32} style={{ opacity: 0.3 }} />
                <p>{declarations.length === 0 ? 'Aucune déclaration. Les CA déclarés depuis Économie apparaîtront ici.' : 'Aucune déclaration pour ces critères.'}</p>
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th><th>Semaine</th><th>Société</th><th>Type</th>
                    <th style={{ textAlign: 'right' }}>CA</th>
                    <th style={{ textAlign: 'right' }}>Taux</th>
                    <th style={{ textAlign: 'right' }}>Impôt</th>
                    <th>Agent</th>
                    {canDeleteDecl && <th aria-label="actions" />}
                  </tr>
                </thead>
                <tbody>
                  {visibleDeclarations.map((d) => (
                    <tr key={d.id}>
                      <td className={styles.mono}>{fmtDateFR(d.date)}</td>
                      <td className={styles.mono}>{d.semaine || '—'}</td>
                      <td><strong>{d.societeNom}</strong></td>
                      <td><span className={styles.typeChip}>{SOCIETE_TYPE_ICON[d.type]} {SOCIETE_TYPE_LABEL[d.type]}</span></td>
                      <td className={styles.amount} style={{ textAlign: 'right' }}>{fmtMoney(d.chiffreAffaires)} ₽</td>
                      <td className={styles.mono} style={{ textAlign: 'right' }}>{d.taux}%</td>
                      <td className={`${styles.amount} ${styles.amtPos}`} style={{ textAlign: 'right' }}>+{fmtMoney(d.impot)} ₽</td>
                      <td className={styles.muted}>{d.agent || '—'}</td>
                      {canDeleteDecl && (
                        <td>
                          <button className={styles.deleteBtn} onClick={() => handleDeleteDeclaration(d)} aria-label="Supprimer">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Card>

      {/* Modal ajout membre */}
      <Modal open={showAddMember} onClose={() => setShowAddMember(false)}
        title="Ajouter un membre" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAddMember(false)}>Annuler</Button>
            <Button onClick={handleAddMember}><Save size={14} /> Ajouter</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Nom du membre *
            <input type="text" value={newMemberNom} autoFocus
              onChange={(e) => setNewMemberNom(e.target.value)} placeholder="Pseudo / nom RP" />
          </label>
          <label>Grade *
            <select value={newMemberGrade} onChange={(e) => setNewMemberGrade(e.target.value as KoekiGrade)}>
              {GRADES_LISTE.map((g) => (
                <option key={g} value={g}>{KOEKI_GRADE_LABEL[g]}</option>
              ))}
            </select>
          </label>
          <p className={styles.help}>
            Le grade détermine la paie hebdo : Membre {fmtMoney(DEFAULT_PAIE_PAR_GRADE['membre-eco'])} ₽,
            responsables {fmtMoney(DEFAULT_PAIE_PAR_GRADE['chef-eco'])} ₽.
          </p>
        </div>
      </Modal>

      {/* Modal pointage */}
      <Modal open={showPoint} onClose={() => setShowPoint(false)}
        title={pointFiche ? `Pointer — ${pointFiche.username}` : 'Pointer'} size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowPoint(false)}>Annuler</Button>
            <Button onClick={handlePoint}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Type *
            <select value={pointType} onChange={(e) => setPointType(e.target.value as MouvementComptaType)}>
              <option value="prime">Prime (+)</option>
              <option value="sanction">Sanction (−)</option>
              <option value="remboursement">Remboursement (+)</option>
              <option value="ajustement">Ajustement (+)</option>
            </select>
          </label>
          <label>Montant (₽) *
            <input type="number" min="1" step="1" value={pointMontant}
              onChange={(e) => setPointMontant(e.target.value)} placeholder="Montant positif" />
          </label>
          <label>Motif
            <textarea rows={2} value={pointMotif}
              onChange={(e) => setPointMotif(e.target.value)} placeholder="Raison (optionnel)" />
          </label>
          <p className={styles.help}>
            {pointType === 'sanction'
              ? 'Une sanction retire le montant du solde du membre.'
              : 'Ce montant sera ajouté au solde du membre.'}
            {' '}Ce pointage n'affecte pas le Trésor Central (seule la paie hebdo le débite).
          </p>
        </div>
      </Modal>

      {/* Modal détail fiche */}
      <Modal open={!!detailFiche} onClose={() => setDetailFiche(null)}
        title={detailFiche ? `Fiche — ${detailFiche.username}` : 'Fiche'} size="lg"
        footer={<Button variant="outline" onClick={() => setDetailFiche(null)}>Fermer</Button>}
      >
        {detailFiche && <FicheDetail fiche={comptas.find((c) => c.discordId === detailFiche.discordId) ?? detailFiche} />}
      </Modal>
    </>
  );
}

// ─── Composant détail d'une fiche (réutilisé en modal et en vue membre) ───
function FicheDetail({ fiche }: { fiche: ComptaKoeki }) {
  const mouvements = Array.isArray(fiche.mouvements) ? fiche.mouvements : [];
  const sorted = [...mouvements].sort((a, b) => b.date - a.date);
  return (
    <div>
      <div className={styles.ficheHeader}>
        <div>
          <div className={styles.ficheGrade}>{fiche.grade ? KOEKI_GRADE_LABEL[fiche.grade] : '—'}</div>
          <div className={styles.ficheSolde}>
            {fiche.solde >= 0 ? '+' : ''}{fmtMoney(fiche.solde)} ₽
          </div>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className={styles.empty}>Aucun mouvement.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Motif</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.id}>
                <td className={styles.mono}>{fmtDateTimeFR(m.date)}</td>
                <td>{MOUVEMENT_COMPTA_LABEL[m.type]}</td>
                <td className={styles.muted}>{m.motif || '—'}</td>
                <td className={`${styles.amount} ${m.montant >= 0 ? styles.amtPos : styles.amtNeg}`} style={{ textAlign: 'right' }}>
                  {m.montant >= 0 ? '+' : ''}{fmtMoney(m.montant)} ₽
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
