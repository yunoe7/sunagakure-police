'use client';

/**
 * Page COMPTABILITÉ MÉDICAL
 *
 * Paiements en Ryōs des soins hospitaliers.
 *
 * Comportement permissions :
 *   - Gérant médecin / Co-gérant médecin / Admin → accès complet
 *   - Autres → page non visible
 *
 * ⚠️ Pour l'instant on bloque la page entière car ComptaModule n'a pas
 * de prop readOnly. À terme, idéalement, ComptaModule devrait connaître
 * la branche associée à sa section et masquer ses propres boutons.
 */

import ComptaModule from '@/components/compta/ComptaModule';
import { RequireBranche } from '@/components/Require';
import { Card } from '@/components/ui/Card';

export default function MedicalComptabilitePage() {
  return (
    <RequireBranche
      branche="medecin"
      fallback={
        <Card title="Accès refusé">
          <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.7 }}>
            Cette page est réservée aux gérants de la branche Médecin.
          </p>
        </Card>
      }
    >
      <ComptaModule section="medical" />
    </RequireBranche>
  );
}
