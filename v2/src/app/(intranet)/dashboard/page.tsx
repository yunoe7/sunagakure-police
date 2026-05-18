'use client';

import { Card } from '@/components/ui/Card';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import type { Patient } from '@/types/medical';
import styles from './page.module.css';

export default function DashboardPage() {
  const { data: patients } = useFirebaseValue<Record<string, Patient>>('medical/patients');

  const stats = [
    {
      label: 'Patients',
      value: patients ? Object.keys(patients).length : 0,
      hint: 'Total enregistrés',
    },
    { label: 'Missions actives', value: '—', hint: 'À connecter' },
    { label: 'Plaintes ouvertes', value: '—', hint: 'À connecter' },
    { label: 'Effectifs', value: '—', hint: 'À connecter' },
  ];

  return (
    <div className={styles.wrap}>
      <Card title="Tableau de bord" subtitle="Vue d'ensemble de l'intranet">
        <div className={styles.grid}>
          {stats.map((s) => (
            <div key={s.label} className={styles.stat}>
              <div className={styles.statLabel}>{s.label}</div>
              <div className={styles.statValue}>{s.value}</div>
              <div className={styles.statHint}>{s.hint}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Migration en cours" subtitle="État du projet Next.js">
        <p className={styles.note}>
          Cette page est un placeholder. Les autres modules (juge, police, missions, etc.)
          sont à migrer un par un en suivant le modèle de <code>/medical/patients</code>.
        </p>
        <ul className={styles.checklist}>
          <li>✅ Coquille (sidebar, topbar, routing, Firebase, auth)</li>
          <li>✅ Page Patients (exemple complet CRUD)</li>
          <li>⏳ Annonces, Histoire, Dashboard</li>
          <li>⏳ Module Médical (consultations, pharmacie, dons, psy)</li>
          <li>⏳ Missions</li>
          <li>⏳ Juge + Avocat + Police (gros morceau)</li>
          <li>⏳ Diplomatie, Impôts, Adoptions, Hiérarchie</li>
          <li>⏳ Admin</li>
        </ul>
      </Card>
    </div>
  );
}
