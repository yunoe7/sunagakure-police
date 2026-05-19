'use client';

import { useEffect, useState } from 'react';
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
  // Change selon le jour pour pas avoir la même tout le temps
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

export default function DashboardPage() {
  const { data: patients } = useFirebaseValue<Record<string, Patient>>('medical/patients');
  const u = useCurrentUser();

  // Tout ce qui dépend du temps est calculé UNIQUEMENT côté client
  // pour éviter les erreurs d'hydratation (React error #418).
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

  // Stats principales
  const stats = [
    {
      label: 'Patients',
      value: patients ? Object.keys(patients).length : 0,
      hint: 'Total enregistrés',
      href: '/medical/patients',
      Icon: Users,
      tone: 'gold',
    },
    {
      label: 'Missions actives',
      value: '—',
      hint: 'À connecter',
      href: '/missions',
      Icon: Swords,
      tone: 'red',
    },
    {
      label: 'Plaintes ouvertes',
      value: '—',
      hint: 'À connecter',
      href: '/plaintes',
      Icon: FileWarning,
      tone: 'amber',
    },
    {
      label: 'Effectifs',
      value: '—',
      hint: 'À connecter',
      href: '/effectifs',
      Icon: ShieldCheck,
      tone: 'blue',
    },
  ] as const;

  // Actions rapides — sélection intelligente selon la branche
  const quickActions = pickQuickActions(u.user?.branches.map((b) => b.slug) ?? []);

  // Sous-titre du hero : "Tokubetsu Jonin · Police · Sabaku"
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
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`${styles.stat} ${styles[`tone-${s.tone}`]}`}
          >
            <div className={styles.statHeader}>
              <div className={styles.statIcon}>
                <s.Icon size={18} />
              </div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statHint}>{s.hint}</div>
          </Link>
        ))}
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

      {/* ═══ MIGRATION EN COURS ═══ */}
      <Card title="Migration en cours" subtitle="État du projet Next.js">
        <p className={styles.note}>
          Cette page est un placeholder. Les autres modules (juge, police, missions, etc.) sont
          à migrer un par un en suivant le modèle de <code>/medical/patients</code>.
        </p>
        <ul className={styles.checklist}>
          <li className={styles.done}>Coquille (sidebar, topbar, routing, Firebase, auth)</li>
          <li className={styles.done}>Page Patients (exemple complet CRUD)</li>
          <li className={styles.done}>Discord OAuth + whitelist admin (Phase B)</li>
          <li className={styles.done}>UI : sidebar enrichie (rang, branche, clan)</li>
          <li className={styles.todo}>Annonces, Histoire, Dashboard</li>
          <li className={styles.todo}>Module Médical (consultations, pharmacie, dons, psy)</li>
          <li className={styles.todo}>Missions</li>
          <li className={styles.todo}>Juge + Avocat + Police (gros morceau)</li>
          <li className={styles.todo}>Diplomatie, Impôts, Adoptions, Hiérarchie</li>
        </ul>
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
  priority: number; // plus haut = plus prioritaire
};

const ALL_ACTIONS: QuickAction[] = [
  { label: 'Dossiers', hint: 'Police', href: '/dossiers', Icon: Folder, priority: 1 },
  { label: 'Plaintes', hint: 'Justice', href: '/plaintes', Icon: FileWarning, priority: 1 },
  { label: 'Patients', hint: 'Médical', href: '/medical/patients', Icon: Stethoscope, priority: 1 },
  { label: 'Opérations', hint: 'Police', href: '/operations', Icon: Crosshair, priority: 2 },
  { label: 'Tribunal', hint: 'Justice', href: '/tribunal', Icon: Gavel, priority: 2 },
  { label: 'Recensement', hint: 'Registre', href: '/recensement', Icon: ScrollText, priority: 3 },
];

/**
 * Sélectionne 4 actions rapides selon les branches de l'utilisateur.
 * Pondère pour mettre les actions de SA branche en premier.
 */
function pickQuickActions(userBranches: string[]): QuickAction[] {
  const scored = ALL_ACTIONS.map((a) => {
    let score = a.priority;
    // Bonus si l'action est dans la branche de l'utilisateur
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
