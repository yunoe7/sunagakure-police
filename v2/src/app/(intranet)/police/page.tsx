'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page POLICE — TABLEAU DE BORD
 * ════════════════════════════════════════════════════════════════
 *  Vue d'ensemble de l'activité police :
 *   - Dossiers (total, par statut)
 *   - Casiers (total, par statut)
 *   - Amendes (dû / encaissé / impayé / taux de recouvrement)
 *   - Caisse police (solde, entrées/sorties)
 *  Graphiques SVG (zéro dépendance) :
 *   - Camembert : casiers par statut
 *   - Courbe    : encaissements (caisse) par semaine
 *   - Barres    : caisse entrées vs sorties par type
 *
 *  Sécurité : réservé aux membres de la police.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  FolderOpen, ScrollText, Coins, Wallet, TrendingUp, TrendingDown,
  ArrowRight, AlertTriangle, PieChart, LineChart, BarChart3,
  ShieldAlert, Gavel, Receipt,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { RequireMembreBranche } from '@/components/Require';
import { Card } from '@/components/ui/Card';
import {
  type Dossier, computeAmendeTotals,
} from '@/types/dossier';
import {
  type Casier, type CasierStatut, CASIER_STATUT_LABEL, computeCasierTotals,
} from '@/types/casier';
import {
  type Transaction, isEntree, fmtMoney,
} from '@/types/caisse';

import styles from './page.module.css';

const FB_DOSSIERS = 'dossiers';
const FB_CASIERS = 'casiers';
const FB_CAISSE = 'caisse_police/transactions';

// Couleurs par statut de casier
const CASIER_STATUT_COLORS: Record<CasierStatut, string> = {
  vierge: '#86efac',
  antecedents: '#d4b44a',
  surveillance: '#fcd34d',
  interdit_village: '#fca5a5',
  rehabilite: '#93c5fd',
};

// Numéro de semaine ISO d'un timestamp → "2026-Wxx"
function isoWeekOf(ts: number): string {
  const d = new Date(ts);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default function PoliceDashboardPage() {
  return (
    <RequireMembreBranche
      branche="police"
      fallback={
        <Card title="Accès refusé">
          <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.7 }}>
            Cette page est réservée aux membres de la police.
          </p>
        </Card>
      }
    >
      <PoliceDashboard />
    </RequireMembreBranche>
  );
}

function PoliceDashboard() {
  useCurrentUser();

  const { data: dossiersData } = useFirebaseValue<Dossier[] | null>(FB_DOSSIERS);
  const { data: casiersData } = useFirebaseValue<Casier[] | null>(FB_CASIERS);
  const { data: caisseData } = useFirebaseValue<Transaction[] | null>(FB_CAISSE);

  const dossiers = useMemo<Dossier[]>(() => {
    const list = Array.isArray(dossiersData) ? dossiersData : dossiersData ? Object.values(dossiersData) : [];
    return list.filter((d): d is Dossier => d !== null && typeof d === 'object' && !!d.id);
  }, [dossiersData]);

  const casiers = useMemo<Casier[]>(() => {
    const list = Array.isArray(casiersData) ? casiersData : casiersData ? Object.values(casiersData) : [];
    return list.filter((c): c is Casier => c !== null && typeof c === 'object' && !!c.id);
  }, [casiersData]);

  const transactions = useMemo<Transaction[]>(() => {
    const list = Array.isArray(caisseData) ? caisseData : caisseData ? Object.values(caisseData) : [];
    return list.filter((t): t is Transaction => t !== null && typeof t === 'object' && !!t.id);
  }, [caisseData]);

  // ─── Stats dossiers ───
  const dossierStats = useMemo(() => {
    const total = dossiers.length;
    const parStatut: Record<string, number> = {};
    for (const d of dossiers) parStatut[d.statut] = (parStatut[d.statut] || 0) + 1;
    const actifs = dossiers.filter((d) => d.statut !== 'classe' && d.statut !== 'defunt').length;
    const recherches = parStatut['recherche'] || 0;
    return { total, parStatut, actifs, recherches };
  }, [dossiers]);

  // ─── Stats casiers ───
  const casierStats = useMemo(() => {
    const total = casiers.length;
    const parStatut: Record<CasierStatut, number> = {
      vierge: 0, antecedents: 0, surveillance: 0, interdit_village: 0, rehabilite: 0,
    };
    for (const c of casiers) {
      if (parStatut[c.statut] !== undefined) parStatut[c.statut]++;
    }
    return { total, parStatut };
  }, [casiers]);

  // ─── Amendes (dossiers + casiers) ───
  const amendeStats = useMemo(() => {
    let total = 0;
    let payee = 0;
    for (const d of dossiers) {
      const t = computeAmendeTotals(d.infractionsList || []);
      total += t.total;
      payee += t.payee;
    }
    for (const c of casiers) {
      const t = computeCasierTotals(c);
      total += t.total;
      payee += t.payee;
    }
    const impayee = Math.max(0, total - payee);
    const taux = total > 0 ? Math.round((payee / total) * 100) : 0;
    return { total, payee, impayee, taux };
  }, [dossiers, casiers]);

  // ─── Caisse ───
  const caisseStats = useMemo(() => {
    let entrees = 0;
    let sorties = 0;
    for (const t of transactions) {
      if (isEntree(t.type)) entrees += t.montant;
      else sorties += t.montant;
    }
    return { entrees, sorties, solde: entrees - sorties, count: transactions.length };
  }, [transactions]);

  // ─── Top infractions (dossiers + casiers) ───
  const topInfractions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dossiers) {
      for (const i of d.infractionsList || []) {
        const nom = (i.nom || '').trim();
        if (nom) counts.set(nom, (counts.get(nom) || 0) + 1);
      }
    }
    for (const c of casiers) {
      for (const i of c.infractions || []) {
        const nom = (i.nom || '').trim();
        if (nom) counts.set(nom, (counts.get(nom) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([nom, count]) => ({ nom, count }));
  }, [dossiers, casiers]);

  // ─── Données graphiques ───

  // Camembert casiers par statut
  const pieData = useMemo(() => {
    const entries = (Object.keys(casierStats.parStatut) as CasierStatut[])
      .map((s) => ({ statut: s, value: casierStats.parStatut[s], color: CASIER_STATUT_COLORS[s] }))
      .filter((e) => e.value > 0);
    const total = entries.reduce((s, e) => s + e.value, 0);
    return { entries, total };
  }, [casierStats]);

  // Courbe encaissements (entrées caisse) par semaine — 8 dernières
  const lineData = useMemo(() => {
    const parSemaine = new Map<string, number>();
    for (const t of transactions) {
      if (!isEntree(t.type)) continue;
      const sem = isoWeekOf(t.date);
      parSemaine.set(sem, (parSemaine.get(sem) || 0) + t.montant);
    }
    const points = Array.from(parSemaine.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([sem, montant]) => ({ sem, montant }));
    const max = points.reduce((m, p) => Math.max(m, p.montant), 0);
    return { points, max };
  }, [transactions]);

  // Barres caisse : entrées vs sorties
  const barData = useMemo(() => {
    const bars = [
      { label: 'Entrées', value: caisseStats.entrees, color: '#86efac' },
      { label: 'Sorties', value: caisseStats.sorties, color: '#fca5a5' },
    ];
    const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
    return { bars, max };
  }, [caisseStats]);

  return (
    <Card title="🛡️ Police — Tableau de bord" subtitle="Vue d'ensemble de l'activité du commissariat">
      {/* HERO : Caisse */}
      <div className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroLbl}>Solde de la Caisse Police</div>
          <div className={styles.heroVal}>{caisseStats.solde >= 0 ? '+' : '−'}{fmtMoney(caisseStats.solde)} ₽</div>
          <div className={styles.heroSubs}>
            <span className={styles.heroSub}><TrendingUp size={13} className={styles.green} /> +{fmtMoney(caisseStats.entrees)} ₽ entrées</span>
            <span className={styles.heroSub}><TrendingDown size={13} className={styles.red} /> −{fmtMoney(caisseStats.sorties)} ₽ sorties</span>
          </div>
        </div>
        <Link href="/caisse" className={styles.heroLink}><Wallet size={14} /> Ouvrir la caisse <ArrowRight size={14} /></Link>
      </div>

      {/* GRILLE DE BLOCS */}
      <div className={styles.grid}>
        <Link href="/dossiers" className={styles.block}>
          <div className={styles.blockHead}><FolderOpen size={16} /><span>Dossiers</span></div>
          <div className={styles.blockBig}>{dossierStats.total}</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Gavel size={11} /> {dossierStats.actifs} actifs</span>
            <span className={styles.miniStat}><ShieldAlert size={11} /> {dossierStats.recherches} recherché(s)</span>
          </div>
          <div className={styles.blockGo}>Voir les dossiers <ArrowRight size={12} /></div>
        </Link>

        <Link href="/casiers" className={styles.block}>
          <div className={styles.blockHead}><ScrollText size={16} /><span>Casiers</span></div>
          <div className={styles.blockBig}>{casierStats.total}</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}>{casierStats.parStatut.surveillance} sous surveillance</span>
            <span className={styles.miniStat}>{casierStats.parStatut.interdit_village} interdit(s)</span>
          </div>
          <div className={styles.blockGo}>Voir les casiers <ArrowRight size={12} /></div>
        </Link>

        <div className={`${styles.block} ${styles.blockStatic}`}>
          <div className={styles.blockHead}><Coins size={16} /><span>Amendes encaissées</span></div>
          <div className={styles.blockBig}>{fmtMoney(amendeStats.payee)} ₽</div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}><Receipt size={11} /> {fmtMoney(amendeStats.total)} ₽ prononcées</span>
            <span className={styles.miniStat}>Taux de recouvrement : {amendeStats.taux}%</span>
          </div>
        </div>

        <div className={`${styles.block} ${styles.blockStatic}`}>
          <div className={styles.blockHead}><AlertTriangle size={16} /><span>Amendes impayées</span></div>
          <div className={styles.blockBig} style={{ color: amendeStats.impayee > 0 ? '#fca5a5' : '#86efac' }}>
            {fmtMoney(amendeStats.impayee)} ₽
          </div>
          <div className={styles.blockBreak}>
            <span className={styles.miniStat}>{amendeStats.impayee > 0 ? 'Reste à recouvrer' : 'Tout est recouvré'}</span>
          </div>
        </div>
      </div>

      {/* ─── GRAPHIQUES ─── */}
      <div className={styles.chartsGrid}>
        {/* Camembert casiers par statut */}
        <div className={styles.chartCard}>
          <div className={styles.chartHead}><PieChart size={15} /> Casiers par statut</div>
          {pieData.total === 0 ? (
            <div className={styles.chartEmpty}>Aucun casier enregistré.</div>
          ) : (
            <div className={styles.pieWrap}>
              <Pie entries={pieData.entries} total={pieData.total} />
              <div className={styles.pieLegend}>
                {pieData.entries.map((e) => (
                  <div key={e.statut} className={styles.legendRow}>
                    <span className={styles.legendDot} style={{ background: e.color }} />
                    <span>{CASIER_STATUT_LABEL[e.statut]}</span>
                    <span className={styles.legendVal}>{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Courbe encaissements par semaine */}
        <div className={styles.chartCard}>
          <div className={styles.chartHead}><LineChart size={15} /> Encaissements par semaine</div>
          {lineData.points.length === 0 ? (
            <div className={styles.chartEmpty}>Aucun encaissement enregistré.</div>
          ) : (
            <LineChartSvg points={lineData.points} max={lineData.max} />
          )}
        </div>

        {/* Barres entrées/sorties */}
        <div className={styles.chartCard}>
          <div className={styles.chartHead}><BarChart3 size={15} /> Caisse — entrées & sorties</div>
          {barData.max === 0 ? (
            <div className={styles.chartEmpty}>Aucun mouvement de caisse.</div>
          ) : (
            <BarsSvg bars={barData.bars} max={barData.max} />
          )}
        </div>

        {/* Top infractions */}
        <div className={styles.chartCard}>
          <div className={styles.chartHead}><ShieldAlert size={15} /> Infractions les plus fréquentes</div>
          {topInfractions.length === 0 ? (
            <div className={styles.chartEmpty}>Aucune infraction enregistrée.</div>
          ) : (
            <div className={styles.topList}>
              {topInfractions.map((it, idx) => {
                const maxCount = topInfractions[0].count || 1;
                const pct = Math.round((it.count / maxCount) * 100);
                return (
                  <div key={it.nom} className={styles.topRow}>
                    <span className={styles.topRank}>{idx + 1}</span>
                    <div className={styles.topBody}>
                      <div className={styles.topName}>{it.nom}</div>
                      <div className={styles.topBarTrack}>
                        <div className={styles.topBarFill} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className={styles.topCount}>{it.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ════════════ COMPOSANTS GRAPHIQUES SVG ════════════ */

function Pie({ entries, total }: { entries: { statut: CasierStatut; value: number; color: string }[]; total: number }) {
  const R = 60, CX = 70, CY = 70;
  let angle = -90;
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
    if (frac >= 0.999) {
      return <circle key={e.statut} cx={CX} cy={CY} r={R} fill={e.color} />;
    }
    const d = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
    return <path key={e.statut} d={d} fill={e.color} stroke="#15110b" strokeWidth="1.5" />;
  });
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      {slices}
      <circle cx={CX} cy={CY} r="28" fill="#15110b" />
      <text x={CX} y={CY - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="#d4b44a" fontFamily="Cinzel, serif">{total}</text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize="8" fill="#9a8c6a" fontFamily="monospace">CASIERS</text>
    </svg>
  );
}

function LineChartSvg({ points, max }: { points: { sem: string; montant: number }[]; max: number }) {
  const W = 320, H = 140, padL = 44, padB = 28, padT = 12, padR = 12;
  const innerW = W - padL - padR;
  const innerH = H - padB - padT;
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (max === 0 ? 0 : (v / max) * innerH);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.montant)}`).join(' ');
  const area = `${path} L ${x(n - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={padL} y1={padT + innerH * (1 - f)} x2={W - padR} y2={padT + innerH * (1 - f)} stroke="#9a8c6a" strokeOpacity="0.15" strokeWidth="1" />
      ))}
      <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="8" fill="#9a8c6a" fontFamily="monospace">{fmtMoney(max)}</text>
      <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" fontSize="8" fill="#9a8c6a" fontFamily="monospace">0</text>
      <path d={area} fill="#86efac" fillOpacity="0.12" />
      <path d={path} fill="none" stroke="#86efac" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.sem}>
          <circle cx={x(i)} cy={y(p.montant)} r="3" fill="#86efac" stroke="#15110b" strokeWidth="1.5" />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="7.5" fill="#9a8c6a" fontFamily="monospace">{p.sem.replace(/^\d{4}-/, '')}</text>
        </g>
      ))}
    </svg>
  );
}

function BarsSvg({ bars, max }: { bars: { label: string; value: number; color: string }[]; max: number }) {
  const W = 320, H = 140, padB = 30, padT = 16, padL = 10, padR = 10;
  const innerW = W - padL - padR;
  const innerH = H - padB - padT;
  const slot = innerW / bars.length;
  const barW = Math.min(70, slot * 0.5);
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
