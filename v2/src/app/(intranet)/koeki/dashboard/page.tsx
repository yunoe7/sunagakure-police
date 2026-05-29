'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — TABLEAU DE BORD (cockpit + graphiques SVG)
 * ════════════════════════════════════════════════════════════════
 *  Indicateurs : Trésor, sociétés, fiscalité, marché, membres, masse salariale.
 *  Graphiques (SVG pur, zéro dépendance) :
 *   - Camembert : sociétés par type
 *   - Courbe    : impôts collectés par semaine
 *   - Barres    : entrées (impôts) vs sorties (retraits Trésor)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Landmark, Building2, Receipt, Store, Users, Banknote,
  TrendingUp, TrendingDown, ArrowRight, Wallet, Coins, Handshake, CheckCircle2,
  PieChart, LineChart, BarChart3,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card } from '@/components/ui/Card';
import {
  type Societe, type DeclarationCA, type ComptaKoeki, type DemandeMarche,
  type SocieteType,
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

// Couleurs des types de société (cohérent avec la palette)
const TYPE_COLORS: Record<SocieteType, string> = {
  restaurant: '#d4b44a',
  service: '#93c5fd',
  biens: '#c4b5fd',
};

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

  // ─── Calculs indicateurs ───
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
    const masse = comptas
      .filter((c) => c.dernierVersement !== semaine && c.grade)
      .reduce((s, c) => s + paieDeLaSemaine({ grade: c.grade, organisaEvent: false, bareme: DEFAULT_PAIE_PAR_GRADE }), 0);
    return { count, soldes, payes, masse };
  }, [comptas, semaine]);

  // ─── Données graphiques ───

  // 1. Camembert sociétés par type
  const pieData = useMemo(() => {
    const entries = SOCIETE_TYPES
      .map((t) => ({ type: t, value: societeStats.parType[t], color: TYPE_COLORS[t] }))
      .filter((e) => e.value > 0);
    const total = entries.reduce((s, e) => s + e.value, 0);
    return { entries, total };
  }, [societeStats]);

  // 2. Courbe impôts par semaine (les 8 dernières semaines présentes dans les déclarations)
  const lineData = useMemo(() => {
    const parSemaine = new Map<string, number>();
    for (const d of declarations) {
      if (!d.semaine) continue;
      parSemaine.set(d.semaine, (parSemaine.get(d.semaine) || 0) + (d.impot || 0));
    }
    const points = Array.from(parSemaine.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([sem, montant]) => ({ sem, montant }));
    const max = points.reduce((m, p) => Math.max(m, p.montant), 0);
    return { points, max };
  }, [declarations]);

  // 3. Barres entrées vs sorties (Trésor) — par section pour les entrées, total retraits
  const barData = useMemo(() => {
    // Entrées par section (mouvements), sorties = retraits
    const entreesKoeki = tresor.mouvements.filter((m) => m.section === 'koeki').reduce((s, m) => s + (m.amount || 0), 0);
    const entreesAutres = tresor.mouvements.filter((m) => m.section !== 'koeki').reduce((s, m) => s + (m.amount || 0), 0);
    const sorties = (tresor.retraits || []).reduce((s, r) => s + (r.montant || 0), 0);
    const bars = [
      { label: 'Entrées Kōeki', value: entreesKoeki, color: '#d4b44a' },
      { label: 'Entrées autres', value: entreesAutres, color: '#93c5fd' },
      { label: 'Sorties', value: sorties, color: '#fca5a5' },
    ];
    const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
    return { bars, max };
  }, [tresor]);

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
        <Link href="/koeki/economie" className={styles.block}>
          <div className={styles.blockHead}><Building2 size={16} /><span>Sociétés actives</span></div>
          <div className={styles.blockBig}>{societeStats.total}</div>
          <div className={styles.blockBreak}>
            {SOCIETE_TYPES.map((t) => (<span key={t} className={styles.miniStat}>{SOCIETE_TYPE_ICON[t]} {societeStats.parType[t]} {SOCIETE_TYPE_LABEL[t]}</span>))}
          </div>
          <div className={styles.blockGo}>Gérer <ArrowRight size={12} /></div>
        </Link>

        <Link href="/koeki/compta" className={styles.block}>
          <div className={styles.blockHead}><Receipt size={16} /><span>Impôts collectés</span></div>
          <div className={styles.blockBig}>{fmtMoney(fiscalStats.semaineImpot)} ₽</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Coins size={11} /> {fmtMoney(fiscalStats.totalImpot)} ₽ au total</span>
            <span className={styles.miniStat}>{fiscalStats.count} déclaration(s)</span>
          </div>
          <div className={styles.blockGo}>Cette semaine · voir détail <ArrowRight size={12} /></div>
        </Link>

        <Link href="/koeki/marche" className={styles.block}>
          <div className={styles.blockHead}><Store size={16} /><span>Marché</span></div>
          <div className={styles.blockBig}>{marcheStats.ouvertes}<span className={styles.bigUnit}> ouvertes</span></div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Handshake size={11} /> {marcheStats.enCours} en cours</span>
            <span className={styles.miniStat}><CheckCircle2 size={11} /> {marcheStats.cloturees} clôturées</span>
          </div>
          <div className={styles.blockGo}>Voir le marché <ArrowRight size={12} /></div>
        </Link>

        <Link href="/koeki/compta" className={styles.block}>
          <div className={styles.blockHead}><Users size={16} /><span>Membres</span></div>
          <div className={styles.blockBig}>{membreStats.count}</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Wallet size={11} /> {fmtMoney(membreStats.soldes)} ₽ cumulés</span>
            <span className={styles.miniStat}><Banknote size={11} /> {membreStats.payes}/{membreStats.count} payés</span>
          </div>
          <div className={styles.blockGo}>Voir les fiches <ArrowRight size={12} /></div>
        </Link>

        <div className={`${styles.block} ${styles.blockStatic}`}>
          <div className={styles.blockHead}><Banknote size={16} /><span>Masse salariale à verser</span></div>
          <div className={styles.blockBig}>{fmtMoney(membreStats.masse)} ₽</div>
          <div className={styles.blockBreak}><span className={styles.miniStat}>Paie restante semaine {semaine}</span></div>
          <div className={styles.blockNote}>{membreStats.masse === 0 ? 'Tous les membres sont payés cette semaine.' : `Coût de la paie des ${membreStats.count - membreStats.payes} membre(s) non encore payé(s).`}</div>
        </div>

        <div className={`${styles.block} ${styles.blockStatic}`}>
          <div className={styles.blockHead}><Coins size={16} /><span>Chiffre d'affaires déclaré</span></div>
          <div className={styles.blockBig}>{fmtMoney(fiscalStats.totalCA)} ₽</div>
          <div className={styles.blockBreak}><span className={styles.miniStat}>Cumul de toutes les déclarations</span></div>
          <div className={styles.blockNote}>Taux de prélèvement Trésor : {tresor.prelevementRate}%</div>
        </div>
      </div>

      {/* ─── GRAPHIQUES ─── */}
      <div className={styles.chartsGrid}>

        {/* Camembert sociétés par type */}
        <div className={styles.chartCard}>
          <div className={styles.chartHead}><PieChart size={15} /> Sociétés par type</div>
          {pieData.total === 0 ? (
            <div className={styles.chartEmpty}>Aucune société active.</div>
          ) : (
            <div className={styles.pieWrap}>
              <Pie entries={pieData.entries} total={pieData.total} />
              <div className={styles.pieLegend}>
                {pieData.entries.map((e) => (
                  <div key={e.type} className={styles.legendRow}>
                    <span className={styles.legendDot} style={{ background: e.color }} />
                    <span>{SOCIETE_TYPE_LABEL[e.type]}</span>
                    <span className={styles.legendVal}>{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Courbe impôts par semaine */}
        <div className={styles.chartCard}>
          <div className={styles.chartHead}><LineChart size={15} /> Impôts collectés par semaine</div>
          {lineData.points.length === 0 ? (
            <div className={styles.chartEmpty}>Aucune déclaration enregistrée.</div>
          ) : (
            <LineChartSvg points={lineData.points} max={lineData.max} />
          )}
        </div>

        {/* Barres entrées/sorties */}
        <div className={styles.chartCard}>
          <div className={styles.chartHead}><BarChart3 size={15} /> Trésor — entrées & sorties</div>
          {barData.max === 0 ? (
            <div className={styles.chartEmpty}>Aucun mouvement Trésor.</div>
          ) : (
            <BarsSvg bars={barData.bars} max={barData.max} />
          )}
        </div>

      </div>
    </Card>
  );
}

/* ════════════ COMPOSANTS GRAPHIQUES SVG (zéro dépendance) ════════════ */

// Camembert
function Pie({ entries, total }: { entries: { type: SocieteType; value: number; color: string }[]; total: number }) {
  const R = 60, CX = 70, CY = 70;
  let angle = -90; // commence en haut
  const slices = entries.map((e) => {
    const frac = e.value / total;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    const large = end - start > 180 ? 1 : 0;
    const x1 = CX + R * Math.cos((Math.PI * start) / 180);
    const y1 = CY + R * Math.sin((Math.PI * start) / 180);
    const x2 = CX + R * Math.cos((Math.PI * end) / 180);
    const y2 = CY + R * Math.sin((Math.PI * end) / 180);
    // cas une seule tranche = cercle complet
    if (frac >= 0.999) {
      return <circle key={e.type} cx={CX} cy={CY} r={R} fill={e.color} />;
    }
    const d = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
    return <path key={e.type} d={d} fill={e.color} stroke="#15110b" strokeWidth="1.5" />;
  });
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      {slices}
      <circle cx={CX} cy={CY} r="28" fill="#15110b" />
      <text x={CX} y={CY - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="#d4b44a" fontFamily="Cinzel, serif">{total}</text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize="8" fill="#9a8c6a" fontFamily="monospace">SOCIÉTÉS</text>
    </svg>
  );
}

// Courbe
function LineChartSvg({ points, max }: { points: { sem: string; montant: number }[]; max: number }) {
  const W = 320, H = 140, padL = 40, padB = 28, padT = 12, padR = 12;
  const innerW = W - padL - padR;
  const innerH = H - padB - padT;
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (max === 0 ? 0 : (v / max) * innerH);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.montant)}`).join(' ');
  const area = `${path} L ${x(n - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {/* grille horizontale */}
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={padL} y1={padT + innerH * (1 - f)} x2={W - padR} y2={padT + innerH * (1 - f)} stroke="#9a8c6a" strokeOpacity="0.15" strokeWidth="1" />
      ))}
      {/* labels Y */}
      <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="8" fill="#9a8c6a" fontFamily="monospace">{fmtMoney(max)}</text>
      <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" fontSize="8" fill="#9a8c6a" fontFamily="monospace">0</text>
      {/* aire + ligne */}
      <path d={area} fill="#d4b44a" fillOpacity="0.12" />
      <path d={path} fill="none" stroke="#d4b44a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* points + labels X */}
      {points.map((p, i) => (
        <g key={p.sem}>
          <circle cx={x(i)} cy={y(p.montant)} r="3" fill="#d4b44a" stroke="#15110b" strokeWidth="1.5" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="7.5" fill="#9a8c6a" fontFamily="monospace">{p.sem.replace(/^\d{4}-/, '')}</text>
        </g>
      ))}
    </svg>
  );
}

// Barres
function BarsSvg({ bars, max }: { bars: { label: string; value: number; color: string }[]; max: number }) {
  const W = 320, H = 140, padB = 30, padT = 16, padL = 10, padR = 10;
  const innerW = W - padL - padR;
  const innerH = H - padB - padT;
  const slot = innerW / bars.length;
  const barW = Math.min(60, slot * 0.5);
  const y = (v: number) => padT + innerH - (max === 0 ? 0 : (v / max) * innerH);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#9a8c6a" strokeOpacity="0.2" strokeWidth="1" />
      {bars.map((b, i) => {
        const cx = padL + slot * i + slot / 2;
        const h = padT + innerH - y(b.value);
        return (
          <g key={b.label}>
            <rect x={cx - barW / 2} y={y(b.value)} width={barW} height={h} rx="3" fill={b.color} fillOpacity="0.85" />
            <text x={cx} y={y(b.value) - 5} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#e8dcc0" fontFamily="monospace">{fmtMoney(b.value)}</text>
            <text x={cx} y={H - 10} textAnchor="middle" fontSize="8" fill="#9a8c6a" fontFamily="monospace">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
