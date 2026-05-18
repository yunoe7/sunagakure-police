'use client';

import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <Card title="Page à migrer">
      <p style={{ color: 'var(--text2)', lineHeight: 1.6 }}>
        Pars du modèle <code style={{ color: 'var(--gold)' }}>medical/patients</code> :
        copie le fichier, adapte les types et le chemin Firebase.
      </p>
    </Card>
  );
}
