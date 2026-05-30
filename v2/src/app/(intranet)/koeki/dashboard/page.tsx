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
 *
 *  🆕 Barre de recherche globale Kōeki (en haut) : cherche en parallèle
 *     dans les sociétés, les demandes de marché et les membres Kōeki
 *     (fusion koeki/comptas + koeki/grades). Champ vide = dashboard normal.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Landmark, Building2, Receipt, Store, Users, Banknote,
  TrendingUp, TrendingDown, ArrowRight, Wallet, Coins, Handshake, CheckCircle2,
  PieChart, LineChart, BarChart3, AlertTriangle, Search, X,
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
import { KOEKI_GRADES_PATH, gradeLabel, type KoekiGradeOverride } from '@/types/koekiGrades';
import type { KoekiGrade } from '@/lib/roles';

import styles from './page.module.css';

const FB_SOCIETES = 'koeki/societes';
const FB_DECLARATIONS = 'koeki/declarations';
const FB_COMPTAS = 'koeki/comptas';
const FB_MARCHE = 'koeki/marche';
const FB_TRESOR = 'tresorCentral';

const TYPE_COLORS: Record<SocieteType, string> = {
  restaurant: '#d4b44a',
  service: '#93c5fd',
  biens: '#c4b5fd',
};

// Normalisation pour la recherche (minuscules + sans accents)
function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function KoekiDashboardPage() {
  const u = useCurrentUser();
  const semaine = currentWeek();

  const [query, setQuery] = useState('');

  const { data: societesData } = useFirebaseValue<Societe[] | null>(FB_SOCIETES);
  const { data: declarationsData } = useFirebaseValue<DeclarationCA[] | null>(FB_DECLARATIONS);
  const { data: comptasData } = useFirebaseValue<ComptaKoeki[] | Record<string, ComptaKoeki> | null>(FB_COMPTAS);
  const { data: marcheData } = useFirebaseValue<DemandeMarche[] | null>(FB_MARCHE);
  const { data: tresorData } = useFirebaseValue<TresorCentral | null>(FB_TRESOR);
  const { data: gradesData } = useFirebaseValue<Record<string, KoekiGradeOverride> | null>(KOEKI_GRADES_PATH);

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

  // ─── 🆕 Membres Kōeki fusionnés (comptas + grades) ───
  const membresKoeki = useMemo(() => {
    // Map discordId → { nom, grade, solde }
    const map = new Map<string, { discordId: string; nom: string; grade: KoekiGrade | null; solde: number | null }>();
    // 1. À partir des comptas (ont username + grade + solde)
    for (const c of comptas) {
      map.set(c.discordId, {
        discordId: c.discordId,
        nom: c.username || c.discordId,
        grade: (c.grade as KoekiGrade) ?? null,
        solde: typeof c.solde === 'number' ? c.solde : null,
      });
    }
    // 2. Compléter / ajouter avec les grades en base (koeki/grades)
    if (gradesData) {
      for (const [discordId, ov] of Object.entries(gradesData)) {
        const g = ov?.grade ?? null;
        if (!g) continue; // grade null = pas membre
        const existing = map.get(discordId);
        if (existing) {
          // le grade en base prime sur celui de la compta
          existing.grade = g;
        } else {
          map.set(discordId, { discordId, nom: discordId, grade: g, solde: null });
        }
      }
    }
    return Array.from(map.values());
  }, [comptas, gradesData]);

  // ─── 🆕 Résultats de recherche ───
  const isSearching = query.trim().length >= 2;
  const results = useMemo(() => {
    if (!isSearching) return { societes: [], demandes: [], membres: [] };
    const q = norm(query);
    const matchSoc = societes.filter((s) =>
      norm(`${s.nom} ${s.proprietaireNom || ''} ${SOCIETE_TYPE_LABEL[s.type] || ''}`).includes(q)
    ).slice(0, 12);
    const matchDem = demandes.filter((d) =>
      norm(`${d.objet} ${d.auteurNom || ''} ${d.description || ''}`).includes(q)
    ).slice(0, 12);
    const matchMem = membresKoeki.filter((m) =>
      norm(`${m.nom} ${m.grade ? gradeLabel(m.grade) : ''}`).includes(q)
    ).slice(0, 12);
    return { societes: matchSoc, demandes: matchDem, membres: matchMem };
  }, [isSearching, query, societes, demandes, membresKoeki]);

  const totalResults = results.societes.length + results.demandes.length + results.membres.length;

  // ─── Calculs indicateurs (inchangés) ───
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

  const relanceStats = useMemo(() => {
    const declareSet = new Set<string>();
    for (const d of declarations) if (d.semaine === semaine && d.societeId) declareSet.add(d.societeId);
    const actives = societes.filter((s) => s.actif !== false);
    const aJour = actives.filter((s) => declareSet.has(s.id)).length;
    return { total: actives.length, aJour, aRelancer: actives.length - aJour };
  }, [societes, declarations, semaine]);

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

  // ─── Données graphiques (inchangées) ───
  const pieData = useMemo(() => {
    const entries = SOCIETE_TYPES
      .map((t) => ({ type: t, value: societeStats.parType[t], color: TYPE_COLORS[t] }))
      .filter((e) => e.value > 0);
    const total = entries.reduce((s, e) => s + e.value, 0);
    return { entries, total };
  }, [societeStats]);

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

  const barData = useMemo(() => {
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
      {/* 🆕 Barre de recherche globale */}
      <div className={styles.searchBar}>
        <Search size={16} />
        <input
          type="text"
          placeholder="Rechercher une société, une demande du marché, un membre Kōeki…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className={styles.searchClear} onClick={() => setQuery('')} aria-label="Effacer">
            <X size={15} />
          </button>
        )}
      </div>

      {isSearching ? (
        /* ─── Mode résultats de recherche ─── */
        <div className={styles.searchResults}>
          <div className={styles.searchSummary}>
            {totalResults === 0
              ? `Aucun résultat pour « ${query} »`
              : `${totalResults} résultat${totalResults > 1 ? 's' : ''} pour « ${query} »`}
          </div>

          {results.societes.length > 0 && (
            <div className={styles.resGroup}>
              <div className={styles.resGroupHead}><Building2 size={14} /> Sociétés ({results.societes.length})</div>
              {results.societes.map((s) => (
                <Link key={s.id} href="/koeki/economie" className={styles.resItem}>
                  <span className={styles.resIcon}>{SOCIETE_TYPE_ICON[s.type]}</span>
                  <span className={styles.resMain}>{s.nom}</span>
                  <span className={styles.resMeta}>
                    {SOCIETE_TYPE_LABEL[s.type]}{s.proprietaireNom ? ` · ${s.proprietaireNom}` : ''}
                  </span>
                  <ArrowRight size={13} className={styles.resArrow} />
                </Link>
              ))}
            </div>
          )}

          {results.demandes.length > 0 && (
            <div className={styles.resGroup}>
              <div className={styles.resGroupHead}><Store size={14} /> Marché ({results.demandes.length})</div>
              {results.demandes.map((d) => (
                <Link key={d.id} href="/koeki/marche" className={styles.resItem}>
                  <span className={styles.resIcon}>{d.sens === 'vente' ? '🏷️' : '🔍'}</span>
                  <span className={styles.resMain}>{d.objet}</span>
                  <span className={styles.resMeta}>
                    {d.prix !== undefined ? `${fmtMoney(d.prix)} ₽` : 'Négociable'}{d.auteurNom ? ` · ${d.auteurNom}` : ''}
                  </span>
                  <ArrowRight size={13} className={styles.resArrow} />
                </Link>
              ))}
            </div>
          )}

          {results.membres.length > 0 && (
            <div className={styles.resGroup}>
              <div className={styles.resGroupHead}><Users size={14} /> Membres Kōeki ({results.membres.length})</div>
              {results.membres.map((m) => (
                <Link key={m.discordId} href="/koeki/compta" className={styles.resItem}>
                  <span className={styles.resIcon}>🥷</span>
                  <span className={styles.resMain}>{m.nom}</span>
                  <span className={styles.resMeta}>
                    {m.grade ? gradeLabel(m.grade) : 'Sans grade'}
                    {typeof m.solde === 'number' ? ` · ${fmtMoney(m.solde)} ₽` : ''}
                  </span>
                  <ArrowRight size={13} className={styles.resArrow} />
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ─── Mode dashboard normal ─── */
        <>
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

            <Link href="/koeki/economie" className={styles.block}>
              <div className={styles.blockHead}><AlertTriangle size={16} /><span>Relance fiscale</span></div>
              <div className={styles.blockBig} style={{ color: relanceStats.aRelancer > 0 ? '#fca5a5' : '#86efac' }}>
                {relanceStats.aRelancer}<span className={styles.bigUnit}> à relancer</span>
              </div>
              <div className={styles.blockBreak}>
                <span className={styles.miniStat}>{relanceStats.aJour}/{relanceStats.total} ont déclaré cette semaine</span>
              </div>
              <div className={styles.blockGo}>
                {relanceStats.aRelancer > 0 ? 'Voir qui relancer' : 'Tout le monde est à jour'} <ArrowRight size={12} />
              </div>
            </Link>
          </div>

          {/* ─── GRAPHIQUES ─── */}
          <div className={styles.chartsGrid}>
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

            <div className={styles.chartCard}>
              <div className={styles.chartHead}><LineChart size={15} /> Impôts collectés par semaine</div>
              {lineData.points.length === 0 ? (
                <div className={styles.chartEmpty}>Aucune déclaration enregistrée.</div>
              ) : (
                <LineChartSvg points={lineData.points} max={lineData.max} />
              )}
            </div>

            <div className={styles.chartCard}>
              <div className={styles.chartHead}><BarChart3 size={15} /> Trésor — entrées & sorties</div>
              {barData.max === 0 ? (
                <div className={styles.chartEmpty}>Aucun mouvement Trésor.</div>
              ) : (
                <BarsSvg bars={barData.bars} max={barData.max} />
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* ════════════ COMPOSANTS GRAPHIQUES SVG (zéro dépendance) ════════════ */

function Pie({ entries, total }: { entries: { type: SocieteType; value: number; color: string }[]; total: number }) {
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
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={padL} y1={padT + innerH * (1 - f)} x2={W - padR} y2={padT + innerH * (1 - f)} stroke="#9a8c6a" strokeOpacity="0.15" strokeWidth="1" />
      ))}
      <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="8" fill="#9a8c6a" fontFamily="monospace">{fmtMoney(max)}</text>
      <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" fontSize="8" fill="#9a8c6a" fontFamily="monospace">0</text>
      <path d={area} fill="#d4b44a" fillOpacity="0.12" />
      <path d={path} fill="none" stroke="#d4b44a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.sem}>
          <circle cx={x(i)} cy={y(p.montant)} r="3" fill="#d4b44a" stroke="#15110b" strokeWidth="1.5" />
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
