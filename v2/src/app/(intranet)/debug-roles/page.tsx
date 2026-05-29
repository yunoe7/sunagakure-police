'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page DEBUG RÔLES — diagnostic temporaire
 * ════════════════════════════════════════════════════════════════
 *  Route : /debug-roles
 *
 *  Affiche ce que le système voit réellement pour l'utilisateur
 *  connecté : grade Kōeki détecté, drapeaux, et surtout la liste
 *  brute des rôles Discord (rolesRaw), avec un check des IDs Kōeki
 *  attendus.
 *
 *  ⚠️ PAGE TEMPORAIRE — à supprimer une fois le diagnostic terminé.
 * ════════════════════════════════════════════════════════════════
 */

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { KOEKI_ROLES } from '@/lib/roles';

export default function DebugRolesPage() {
  const { user, can, displayName, refreshRoles, isLoading } = useCurrentUser();

  const box: React.CSSProperties = {
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(212,180,74,0.3)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#e8dcc0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };
  const h: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#c8a850',
    marginBottom: 8,
    fontWeight: 700,
  };

  const rolesRaw = user?.rolesRaw ?? [];

  // Les 3 rôles Kōeki réellement branchés (les autres sont des placeholders)
  const koekiChecks = [
    { label: 'Gérant Kōeki', id: KOEKI_ROLES.GERANT },
    { label: 'Co-Gérant Kōeki', id: KOEKI_ROLES.CO_GERANT },
    { label: 'Koeki (membre)', id: KOEKI_ROLES.MEMBRE_ECO },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'monospace', color: '#c8a850', marginBottom: 4 }}>
        🔍 Debug des rôles
      </h1>
      <p style={{ color: '#8a7c5e', fontSize: 13, marginBottom: 20 }}>
        Page temporaire de diagnostic. Connecté en tant que : <strong>{displayName}</strong>
        {isLoading && ' (chargement…)'}
      </p>

      <button
        onClick={refreshRoles}
        style={{
          padding: '8px 16px',
          background: 'rgba(212,180,74,0.15)',
          border: '1px solid rgba(212,180,74,0.45)',
          borderRadius: 6,
          color: '#c8a850',
          fontFamily: 'monospace',
          cursor: 'pointer',
          marginBottom: 20,
        }}
      >
        🔄 Refresh mes rôles
      </button>

      {!user ? (
        <div style={box}>
          ❌ Aucun utilisateur intranet chargé (user === null).
          {'\n'}Soit tu n'es pas connecté, soit la session ne contient pas les données intranet.
        </div>
      ) : (
        <>
          <div style={h}>1. Vérification des rôles Kōeki attendus</div>
          <div style={box}>
            {koekiChecks.map((c) => {
              const present = rolesRaw.includes(c.id);
              return (
                <div key={c.id} style={{ marginBottom: 4 }}>
                  {present ? '✅' : '❌'} {c.label} — id {c.id} —{' '}
                  {present ? 'PRÉSENT dans rolesRaw' : 'ABSENT de rolesRaw'}
                </div>
              );
            })}
          </div>

          <div style={h}>2. Grade Kōeki détecté</div>
          <div style={box}>
            {user.koeki
              ? `grade = "${user.koeki.grade}" · pôle = "${user.koeki.pole}"`
              : '⚠️ koeki = null (aucun grade Kōeki détecté pour cet utilisateur)'}
          </div>

          <div style={h}>3. Permissions Kōeki calculées</div>
          <div style={box}>
            {`acces           : ${can.koeki.acces()}
voirEconomie    : ${can.koeki.voirEconomie()}
voirMarche      : ${can.koeki.voirMarche()}
declarerCA      : ${can.koeki.declarerCA()}
gererSocietes   : ${can.koeki.gererSocietes()}
renflouerBDM    : ${can.koeki.renflouerBDM()}  (= édition Trésor)
voirParametres  : ${can.koeki.voirParametres()}`}
          </div>

          <div style={h}>4. Drapeaux utilisateur</div>
          <div style={box}>
            {`isAdmin          : ${user.isAdmin}
isKazekage       : ${user.isKazekage}
isConseilDuVent  : ${user.isConseilDuVent}
isStaff          : ${user.isStaff}
isWhitelisted    : ${user.isWhitelisted}
isMembreServeur  : ${user.isMembreServeur}
rang             : ${user.rang ? `${user.rang.nom} (niveau ${user.rang.niveau})` : 'aucun'}`}
          </div>

          <div style={h}>5. Tous les rôles Discord bruts ({rolesRaw.length})</div>
          <div style={box}>
            {rolesRaw.length === 0
              ? '⚠️ rolesRaw est VIDE — le système ne récupère aucun rôle Discord pour cet utilisateur.'
              : rolesRaw.join('\n')}
          </div>
        </>
      )}
    </div>
  );
}
