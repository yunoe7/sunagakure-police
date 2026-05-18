'use client';

import { Card } from '@/components/ui/Card';

export default function AnnoncesPage() {
  return (
    <Card title="Annonces" subtitle="Module à migrer">
      <p style={{ color: 'var(--text2)', lineHeight: 1.6 }}>
        Page à implémenter en suivant le modèle de{' '}
        <code style={{ color: 'var(--gold)' }}>src/app/(intranet)/medical/patients/page.tsx</code>.
      </p>
    </Card>
  );
}
