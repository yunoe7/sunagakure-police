'use client';
/**
 * Page COMPTABILITÉ DIPLOMATIE
 * Échanges financiers avec les autres villages.
 *
 * Permission : Membres Diplomate uniquement (accès page).
 * ⚠️ Note : les permissions internes au ComptaModule restent à faire
 *           (voir tâche "ComptaModule à analyser" dans le récap).
 */
import ComptaModule from '@/components/compta/ComptaModule';
import { RequireMembreBranche } from '@/components/Require';

export default function DiploComptabilitePage() {
  return (
    <RequireMembreBranche branche="diplomate">
      <ComptaModule section="diplo" />
    </RequireMembreBranche>
  );
}
