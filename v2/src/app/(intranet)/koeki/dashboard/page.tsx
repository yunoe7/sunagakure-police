'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — TABLEAU DE BORD (cockpit, lecture seule)
 * ════════════════════════════════════════════════════════════════
 *  Vue d'ensemble du pôle économique :
 *   - Trésor Central (solde, reçu, retiré)
 *   - Sociétés (actives, par type)
 *   - Fiscalité (impôts collectés : semaine + total)
 *   - Marché (demandes ouvertes / en cours / clôturées)
 *   - Membres (effectif, soldes cumulés, masse salariale de la semaine)
 *  Raccourcis vers les sous-pages.
 *  Lecture seule — aucune action ici.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Landmark, Building2, Receipt, Store, Users, Banknote,
  TrendingUp, TrendingDown, ArrowRight, Wallet, Coins, Handshake, CheckCircle2,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card } from '@/components/ui/Card';
import {
  type Societe, type DeclarationCA, type ComptaKoeki, type DemandeMarche,
  type SocieteType, type KoekiParametres,
  SOCIETE_TYPES, SOCIETE_TYPE_LABEL, SOCIETE_TYPE_ICON,
  DEFAULT_PAIE_PAR_GRADE, paieDeLaSemaine, recomputeSolde,
  fmtMoney,
} from '@/types/koeki';
import { type TresorCentral, type TresorMouvement, type TresorRetrait, TRESOR_DEFAULT_RATE } from '@/types/compta';
import { currentWeek } from '@/types/fiscal';

import styles from './page.module.css';

const FB_SOCIETES = 'koeki/societes';
const FB_DECLARATIONS = 'koeki/declarations';
const FB_COMPTAS = 'koeki/comptas';
const FB_MARCHE = 'koeki/marche';
const FB_TRESOR = 'tresorCentral';

export default function KoekiDashboardPage() {
  const u = useCurrentUser();
  const semaine = currentWeek();

  const { data: societesData } = useFirebaseValue<Societe[] | null>(FB_SOCIETES);
  const { data: declarationsData } = useFirebaseValue<DeclarationCA[] | null>(FB_DECLARATIONS);
  const { data: comptasData } = useFirebaseValue<ComptaKoeki[] | Record<string, ComptaKoeki> | null>(FB_COMPTAS);
  const { data: marcheData } = useFirebaseValue<DemandeMarche[] | null>(FB_MARCHE);
  const { data: tresorData } = useFirebaseValue<TresorCentral | null>(FB_TRESOR);

  const societes = useMemo<Societe[]>(() => {
    const list = Array.isArray(societesData) ? societesData : societesData ? Object.values(societesData) : [];
    return list.filter((s): s is Societe => s !== null && typeof s === 'object' && !!s.id);
  }, [societesData]);

  const declarations = useMemo<DeclarationCA[]>(() => {
    const list = Array.isArray(declarationsData) ? declarationsData : declarationsData ? Object.values(declarationsData) : [];
    return list.filter((d): d is DeclarationCA => d !== null && typeof d === 'object' && !!d.id);
  }, [declarationsData]);

  const comptas = useMemo<ComptaKoeki[]>(() => {
    const list = Array.isArray(comptasData) ? comptasData : comptasData ? Object.values(comptasData) : [];
    return list.filter((c): c is ComptaKoeki => c !== null && typeof c === 'object' && !!c.discordId)
      .map((c) => ({ ...c, mouvements: Array.isArray(c.mouvements) ? c.mouvements : [], solde: typeof c.solde === 'number' ? c.solde : recomputeSolde(Array.isArray(c.mouvements) ? c.mouvements : []) }));
  }, [comptasData]);

  const demandes = useMemo<DemandeMarche[]>(() => {
    const list = Array.isArray(marcheData) ? marcheData : marcheData ? Object.values(marcheData) : [];
    return list.filter((d): d is DemandeMarche => d !== null && typeof d === 'object' && !!d.id);
  }, [marcheData]);

  const tresor = useMemo<TresorCentral>(() => ({
    prelevementRate: tresorData?.prelevementRate ?? TRESOR_DEFAULT_RATE,
    mouvements: (Array.isArray(tresorData?.mouvements) ? tresorData!.mouvements : tresorData?.mouvements ? Object.values(tresorData.mouvements) : []).filter((m): m is TresorMouvement => m !== null && typeof m === 'object' && !!m.id),
    retraits: (Array.isArray(tresorData?.retraits) ? tresorData!.retraits : tresorData?.retraits ? Object.values(tresorData.retraits) : []).filter((r): r is TresorRetrait => r !== null && typeof r === 'object' && !!r.id),
  }), [tresorData]);

  // ─── Calculs ───
  const tresorStats = useMemo(() => {
    const recu = tresor.mouvements.reduce((s, m) => s + (m.amount || 0), 0);
    const retire = (tresor.retraits || []).reduce((s, r) => s + (r.montant || 0), 0);
    return { recu, retire, solde: recu - retire };
  }, [tresor]);

  const societeStats = useMemo(() => {
    const actives = societes.filter((s) => s.actif !== false);
    const parType: Record<SocieteType, number> = { restaurant: 0, service: 0, biens: 0 };
    for (const s of actives) parType[s.type] = (parType[s.type] || 0) + 1;
    return { total: actives.length, parType };
  }, [societes]);

  const fiscalStats = useMemo(() => {
    const totalImpot = declarations.reduce((s, d) => s + (d.impot || 0), 0);
    const semaineImpot = declarations.filter((d) => d.semaine === semaine).reduce((s, d) => s + (d.impot || 0), 0);
    const totalCA = declarations.reduce((s, d) => s + (d.chiffreAffaires || 0), 0);
    return { totalImpot, semaineImpot, totalCA, count: declarations.length };
  }, [declarations, semaine]);

  const marcheStats = useMemo(() => {
    const ouvertes = demandes.filter((d) => d.statut === 'ouverte').length;
    const enCours = demandes.filter((d) => d.statut === 'acceptee' || d.statut === 'rdv').length;
    const cloturees = demandes.filter((d) => d.statut === 'cloturee').length;
    return { ouvertes, enCours, cloturees };
  }, [demandes]);

  const membreStats = useMemo(() => {
    const count = comptas.length;
    const soldes = comptas.reduce((s, c) => s + (c.solde || 0), 0);
    const payes = comptas.filter((c) => c.dernierVersement === semaine).length;
    // Masse salariale = ce que coûterait la paie des membres NON encore payés cette semaine
    const masse = comptas
      .filter((c) => c.dernierVersement !== semaine && c.grade)
      .reduce((s, c) => s + paieDeLaSemaine({ grade: c.grade, organisaEvent: false, bareme: DEFAULT_PAIE_PAR_GRADE }), 0);
    return { count, soldes, payes, masse };
  }, [comptas, semaine]);

  return (
    <Card title="🏯 Kōeki — Tableau de bord" subtitle={`Vue d'ensemble du pôle économique — Semaine ${semaine}`}>
      {/* HERO : Trésor */}
      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroLbl}>Solde du Trésor Central</div>
          <div className={styles.heroVal}>{tresorStats.solde >= 0 ? '+' : ''}{fmtMoney(tresorStats.solde)} ₽</div>
          <div className={styles.heroSubs}>
            <span className={styles.heroSub}><TrendingUp size={13} className={styles.green} /> +{fmtMoney(tresorStats.recu)} ₽ reçus</span>
            <span className={styles.heroSub}><TrendingDown size={13} className={styles.red} /> −{fmtMoney(tresorStats.retire)} ₽ retirés</span>
          </div>
        </div>
        <Link href="/tresor" className={styles.heroLink}><Landmark size={14} /> Ouvrir le Trésor <ArrowRight size={14} /></Link>
      </div>

      {/* GRILLE DE BLOCS */}
      <div className={styles.grid}>

        {/* Sociétés */}
        <Link href="/koeki/economie" className={styles.block}>
          <div className={styles.blockHead}><Building2 size={16} /><span>Sociétés actives</span></div>
          <div className={styles.blockBig}>{societeStats.total}</div>
          <div className={styles.blockBreak}>
            {SOCIETE_TYPES.map((t) => (
              <span key={t} className={styles.miniStat}>{SOCIETE_TYPE_ICON[t]} {societeStats.parType[t]} {SOCIETE_TYPE_LABEL[t]}</span>
            ))}
          </div>
          <div className={styles.blockGo}>Gérer <ArrowRight size={12} /></div>
        </Link>

        {/* Fiscalité */}
        <Link href="/koeki/compta" className={styles.block}>
          <div className={styles.blockHead}><Receipt size={16} /><span>Impôts collectés</span></div>
          <div className={styles.blockBig}>{fmtMoney(fiscalStats.semaineImpot)} ₽</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Coins size={11} /> {fmtMoney(fiscalStats.totalImpot)} ₽ au total</span>
            <span className={styles.miniStat}>{fiscalStats.count} déclaration(s)</span>
          </div>
          <div className={styles.blockGo}>Cette semaine · voir détail <ArrowRight size={12} /></div>
        </Link>

        {/* Marché */}
        <Link href="/koeki/marche" className={styles.block}>
          <div className={styles.blockHead}><Store size={16} /><span>Marché</span></div>
          <div className={styles.blockBig}>{marcheStats.ouvertes}<span className={styles.bigUnit}> ouvertes</span></div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Handshake size={11} /> {marcheStats.enCours} en cours</span>
            <span className={styles.miniStat}><CheckCircle2 size={11} /> {marcheStats.cloturees} clôturées</span>
          </div>
          <div className={styles.blockGo}>Voir le marché <ArrowRight size={12} /></div>
        </Link>

        {/* Membres */}
        <Link href="/koeki/compta" className={styles.block}>
          <div className={styles.blockHead}><Users size={16} /><span>Membres</span></div>
          <div className={styles.blockBig}>{membreStats.count}</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Wallet size={11} /> {fmtMoney(membreStats.soldes)} ₽ cumulés</span>
            <span className={styles.miniStat}><Banknote size={11} /> {membreStats.payes}/{membreStats.count} payés</span>
          </div>
          <div className={styles.blockGo}>Voir les fiches <ArrowRight size={12} /></div>
        </Link>

        {/* Masse salariale */}
        <div className={`${styles.block} ${styles.blockStatic}`}>
          <div className={styles.blockHead}><Banknote size={16} /><span>Masse salariale à verser</span></div>
          <div className={styles.blockBig}>{fmtMoney(membreStats.masse)} ₽</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}>Paie restante semaine {semaine}</span>
          </div>
          <div className={styles.blockNote}>
            {membreStats.masse === 0
              ? 'Tous les membres sont payés cette semaine.'
              : `Coût de la paie des ${membreStats.count - membreStats.payes} membre(s) non encore payé(s).`}
          </div>
        </div>

        {/* CA déclaré */}
        <div className={`${styles.block} ${styles.blockStatic}`}>
          <div className={styles.blockHead}><Coins size={16} /><span>Chiffre d'affaires déclaré</span></div>
          <div className={styles.blockBig}>{fmtMoney(fiscalStats.totalCA)} ₽</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}>Cumul de toutes les déclarations</span>
          </div>
          <div className={styles.blockNote}>Taux de prélèvement Trésor : {tresor.prelevementRate}%</div>
        </div>

      </div>
    </Card>
  );
}
