'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Swords,
  FileWarning,
  ShieldCheck,
  ArrowRight,
  Folder,
  Gavel,
  Stethoscope,
  Crosshair,
  ScrollText,
  Sparkles,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { Patient } from '@/types/medical';
import styles from './page.module.css';

// ─── Citations RP qui rotationnent ─────────────────────────────────
const CITATIONS = [
  '« Le sable se souvient toujours. »',
  '« Là où le vent souffle, Suna règne. »',
  '« Un grain de sable peut arrêter une montagne. »',
  '« Le désert n\'oublie ni les hommes ni leurs actes. »',
  '« Sous le soleil de Suna, aucune ombre ne se cache. »',
  '« Le silence du désert vaut tous les serments. »',
];

function pickCitation(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return CITATIONS[dayOfYear % CITATIONS.length];
}

function getSalutation(h: number): string {
  if (h < 6) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

// ─── Types légers pour les compteurs ───────────────────────────────
type MemberEntry = {
  firstLogin?: number;
  lastLogin?: number;
};

type MissionEntry = {
  id?: number;
  statut?: string;
};

type PlainteEntry = {
  id?: number;
  statut?: string;
  date?: number;
};

// ─── Helpers de calcul de bornes temporelles ──────────────────────
function startOfDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeekMs(): number {
  // Lundi 00:00 (norme française)
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export default function DashboardPage() {
  const u = useCurrentUser();

  // ─── Données Firebase ───
  const { data: patients } = useFirebaseValue<Record<string, Patient> | null>('medical/patients');
  const { data: members } = useFirebaseValue<Record<string, MemberEntry> | null>('/members'); // racine, pas sunagakure/
  const { data: missionsData } = useFirebaseValue<MissionEntry[] | Record<string, MissionEntry> | null>('missions');
  const { data: plaintesData } = useFirebaseValue<PlainteEntry[] | Record<string, PlainteEntry> | null>('plaintes');

  // ─── Stats Effectifs ───
  const effStats = useMemo(() => {
    if (!members) return { total: 0, today: 0, week: 0 };
    const list = Object.values(members).filter((m): m is MemberEntry => m !== null && typeof m === 'object');
    const today0 = startOfDayMs();
    const week0 = startOfWeekMs();
    const total = list.length;
    const today = list.filter((m) => (m.lastLogin ?? 0) >= today0).length;
    const week = list.filter((m) => (m.lastLogin ?? 0) >= week0 || (m.firstLogin ?? 0) >= week0).length;
    return { total, today, week };
  }, [members]);

  // ─── Stats Patients ───
  const patStats = useMemo(() => {
    if (!patients) return { total: 0 };
    const list = Object.values(patients).filter((p) => p !== null && typeof p === 'object');
    return { total: list.length };
  }, [patients]);

  // ─── Stats Missions ───
  const missionStats = useMemo(() => {
    const list = (Array.isArray(missionsData)
      ? missionsData
      : missionsData
      ? Object.values(missionsData)
      : []
    ).filter((m): m is MissionEntry => m !== null && typeof m === 'object');
    const statusOf = (s?: string) => (s ?? '').toLowerCase();
    const enCours = list.filter((m) =>
      ['acceptee', 'acceptée', 'en_cours', 'en-cours', 'encours'].includes(statusOf(m.statut))
    ).length;
    const dispo = list.filter((m) =>
      ['disponible', 'ouverte', 'a_prendre', 'à_prendre'].includes(statusOf(m.statut))
    ).length;
    const terminees = list.filter((m) =>
      ['terminee', 'terminée', 'reussie', 'réussie', 'completed'].includes(statusOf(m.statut))
    ).length;
    return { enCours, dispo, terminees, total: list.length };
  }, [missionsData]);

  // ─── Stats Plaintes ───
  const plaintesStats = useMemo(() => {
    const list = (Array.isArray(plaintesData)
      ? plaintesData
      : plaintesData
      ? Object.values(plaintesData)
      : []
    ).filter((p): p is PlainteEntry => p !== null && typeof p === 'object');
    const statusOf = (s?: string) => (s ?? '').toLowerCase();
    const week0 = startOfWeekMs();
    const ouvertes = list.filter((p) => ['ouverte', 'en_cours', 'a_traiter'].includes(statusOf(p.statut))).length;
    const nouvelles = list.filter((p) => (p.date ?? 0) >= week0).length;
    const closes = list.filter((p) => ['fermee', 'fermée', 'classee', 'classée', 'close'].includes(statusOf(p.statut))).length;
    return { ouvertes, nouvelles, closes };
  }, [plaintesData]);

  // ─── Time-aware (client only) ───
  const [now, setNow] = useState<Date | null>(null);
  const [citation, setCitation] = useState<string>('');
  const [salutation, setSalutation] = useState<string>('');

  useEffect(() => {
    const d = new Date();
    setNow(d);
    setCitation(pickCitation());
    setSalutation(getSalutation(d.getHours()));

    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ─── Stats principales (4 cards) ───
  // ⚠️ href = '#' pour ne PAS naviguer (juste lecture)
  // ⚠️ on garde le Link mais on bloque la nav via onClick preventDefault
  const stats = [
    {
      label: 'Patients',
      value: patStats.total,
      hint: 'Total enregistrés',
      subhint: '',
      Icon: Users,
      tone: 'gold' as const,
      href: '/medical/patients',
    },
    {
      label: 'Missions actives',
      value: missionStats.enCours,
      hint: 'En cours',
      subhint:
        missionStats.dispo > 0 || missionStats.terminees > 0
          ? `${missionStats.dispo} dispo · ${missionStats.terminees} finies`
          : '',
      Icon: Swords,
      tone: 'red' as const,
      href: '/missions',
    },
    {
      label: 'Plaintes ouvertes',
      value: plaintesStats.ouvertes,
      hint: 'À traiter',
      subhint:
        plaintesStats.nouvelles > 0 || plaintesStats.closes > 0
          ? `${plaintesStats.nouvelles} cette semaine · ${plaintesStats.closes} closes`
          : '',
      Icon: FileWarning,
      tone: 'amber' as const,
      href: '/plaintes',
    },
    {
      label: 'Effectifs',
      value: effStats.total,
      hint: 'Inscrits',
      subhint:
        effStats.total > 0
          ? `${effStats.today} aujourd'hui · ${effStats.week} cette semaine`
          : '',
      Icon: ShieldCheck,
      tone: 'blue' as const,
      // pas de href → card non-cliquable
      href: null,
    },
  ];

  // Actions rapides
  const quickActions = pickQuickActions(u.user?.branches.map((b) => b.slug) ?? []);

  // Sous-titre hero
  const heroSubtitleParts: string[] = [];
  if (u.user?.rang?.nom) heroSubtitleParts.push(u.user.rang.nom);
  if (u.user?.branches[0]) heroSubtitleParts.push(u.user.branches[0].nom);
  if (u.user?.clan) heroSubtitleParts.push(u.user.clan);
  const heroSubtitle = heroSubtitleParts.join(' · ');

  return (
    <div className={styles.wrap}>
      {/* ═══ HERO ═══ */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.heroContent}>
          <div className={styles.heroLeft}>
            <div className={styles.heroSalute}>
              {salutation ? `${salutation}, ` : 'Bienvenue, '}
              <span className={styles.heroName}>{u.displayName}</span>
              {u.user?.isAdmin && (
                <span className={styles.heroAdminPin} title="Administrateur technique">
                  <Sparkles size={11} /> Admin
                </span>
              )}
            </div>
            {heroSubtitle && <div className={styles.heroRang}>{heroSubtitle}</div>}
            {citation && <div className={styles.heroQuote}>{citation}</div>}
          </div>
          <div className={styles.heroRight}>
            {now && (
              <>
                <div className={styles.heroTime}>
                  {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className={styles.heroDate}>
                  {now.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className={styles.statsGrid}>
        {stats.map((s) => {
          const content = (
            <>
              <div className={styles.statHeader}>
                <div className={styles.statIcon}>
                  <s.Icon size={18} />
                </div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statHint}>{s.hint}</div>
              {s.subhint && (
                <div className={styles.statSubhint}>{s.subhint}</div>
              )}
            </>
          );

          // Card cliquable (avec href) ou statique (sans href)
          if (s.href) {
            return (
              <Link
                key={s.label}
                href={s.href}
                className={`${styles.stat} ${styles[`tone-${s.tone}`]}`}
              >
                {content}
              </Link>
            );
          }
          return (
            <div
              key={s.label}
              className={`${styles.stat} ${styles[`tone-${s.tone}`]} ${styles.statStatic}`}
            >
              {content}
            </div>
          );
        })}
      </section>

      {/* ═══ ACTIONS RAPIDES ═══ */}
      <Card title="Accès rapides" subtitle="Vos modules les plus utilisés">
        <div className={styles.quickGrid}>
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className={styles.quickTile}>
              <div className={styles.quickIcon}>
                <a.Icon size={20} />
              </div>
              <div className={styles.quickText}>
                <div className={styles.quickLabel}>{a.label}</div>
                <div className={styles.quickHint}>{a.hint}</div>
              </div>
              <ArrowRight size={14} className={styles.quickArrow} />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

type QuickAction = {
  label: string;
  hint: string;
  href: string;
  Icon: typeof Folder;
  priority: number;
};

const ALL_ACTIONS: QuickAction[] = [
  { label: 'Dossiers', hint: 'Police', href: '/dossiers', Icon: Folder, priority: 1 },
  { label: 'Plaintes', hint: 'Justice', href: '/plaintes', Icon: FileWarning, priority: 1 },
  { label: 'Patients', hint: 'Médical', href: '/medical/patients', Icon: Stethoscope, priority: 1 },
  { label: 'Opérations', hint: 'Police', href: '/operations', Icon: Crosshair, priority: 2 },
  { label: 'Tribunal', hint: 'Justice', href: '/tribunal', Icon: Gavel, priority: 2 },
  { label: 'Recensement', hint: 'Registre', href: '/recensement', Icon: ScrollText, priority: 3 },
];

function pickQuickActions(userBranches: string[]): QuickAction[] {
  const scored = ALL_ACTIONS.map((a) => {
    let score = a.priority;
    const isPolice = a.href.includes('dossier') || a.href.includes('operation') || a.href.includes('sanction');
    const isJustice = a.href.includes('plainte') || a.href.includes('tribunal');
    const isMedical = a.href.includes('medical');
    if (userBranches.includes('police') && isPolice) score += 10;
    if ((userBranches.includes('police') || userBranches.includes('stratege')) && isJustice) score += 5;
    if (userBranches.includes('medecin') && isMedical) score += 10;
    return { action: a, score };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, 4).map((x) => x.action);
}
