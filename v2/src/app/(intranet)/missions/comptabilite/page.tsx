'use client';
/**
 * Page COMPTABILITÉ MISSIONS
 * Récompenses et budget missions.
 *
 * Permission : Membres Bureau des missions uniquement (accès page).
 * ⚠️ Note : les permissions internes au ComptaModule restent à faire
 *           (voir tâche "ComptaModule à analyser" dans le récap).
 */
import ComptaModule from '@/components/compta/ComptaModule';
import { RequireMembreBranche } from '@/components/Require';

export default function MissionsComptabilitePage() {
  return (
    <RequireMembreBranche branche="bureau-missions">
      <ComptaModule section="missions" />
    </RequireMembreBranche>
  );
}
