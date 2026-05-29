'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page DEBUG RÔLES — diagnostic temporaire
 * ════════════════════════════════════════════════════════════════
 *  Route : /debug-roles
 *
 *  Affiche :
 *   - ce que le système voit (grade Kōeki, drapeaux, rolesRaw du JWT)
 *   - ⭐ la RÉPONSE DISCORD BRUTE en direct (via /api/debug-discord)
 *     pour comparer ce que Discord renvoie VS ce qui est dans le JWT.
 *
 *  ⚠️ PAGE TEMPORAIRE — à supprimer une fois le diagnostic terminé.
 * ════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { KOEKI_ROLES } from '@/lib/roles';

export default function DebugRolesPage() {
  const { user, can, displayName, refreshRoles, isLoading } = useCurrentUser();

  const [liveData, setLiveData] = useState<unknown>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  async function fetchLive() {
    setLiveLoading(true);
    setLiveError(null);
    setLiveData(null);
    try {
      const res = await fetch('/api/debug-discord', { cache: 'no-store' });
      const json = await res.json();
      setLiveData(json);
    } catch (err) {
      setLiveError(String(err));
    } finally {
      setLiveLoading(false);
    }
  }

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
  const btn: React.CSSProperties = {
    padding: '8px 16px',
    background: 'rgba(212,180,74,0.15)',
    border: '1px solid rgba(212,180,74,0.45)',
    borderRadius: 6,
    color: '#c8a850',
    fontFamily: 'monospace',
    cursor: 'pointer',
    marginRight: 10,
    marginBottom: 20,
  };

  const rolesRaw = user?.rolesRaw ?? [];

  const koekiChecks = [
    { label: 'Gérant Kōeki', id: KOEKI_ROLES.GERANT },
    { label: 'Co-Gérant Kōeki', id: KOEKI_ROLES.CO_GERANT },
    { label: 'Koeki (membre)', id: KOEKI_ROLES.MEMBRE_ECO },
  ];

  // Si on a la réponse live, on vérifie aussi les rôles Kōeki dedans
  const liveRoles: string[] =
    liveData && typeof liveData === 'object' && Array.isArray((liveData as { roles?: string[] }).roles)
      ? (liveData as { roles: string[] }).roles
      : [];

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'monospace', color: '#c8a850', marginBottom: 4 }}>
        🔍 Debug des rôles
      </h1>
      <p style={{ color: '#8a7c5e', fontSize: 13, marginBottom: 20 }}>
        Page temporaire de diagnostic. Connecté en tant que : <strong>{displayName}</strong>
        {isLoading && ' (chargement…)'}
      </p>

      <div>
        <button onClick={refreshRoles} style={btn}>
          🔄 Refresh mes rôles (JWT)
        </button>
        <button onClick={fetchLive} style={btn}>
          📡 Interroger Discord EN DIRECT
        </button>
      </div>

      {/* ⭐ RÉPONSE DISCORD BRUTE EN DIRECT */}
      <div style={h}>⭐ 0. Réponse Discord BRUTE (en direct)</div>
      <div style={box}>
        {liveLoading
          ? 'Interrogation de Discord en cours…'
          : liveError
            ? `❌ Erreur : ${liveError}`
            : !liveData
              ? 'Clique sur « 📡 Interroger Discord EN DIRECT » pour voir ce que Discord répond maintenant.'
              : (() => {
                  const d = liveData as {
                    httpStatus?: number;
                    rolesCount?: number;
                    error?: string;
                  };
                  if (d.error) return `❌ ${d.error}`;
                  const checks = koekiChecks
                    .map((c) => `   ${liveRoles.includes(c.id) ? '✅' : '❌'} ${c.label} (${c.id})`)
                    .join('\n');
                  return (
                    `HTTP ${d.httpStatus}\n` +
                    `Nombre de rôles renvoyés par Discord : ${d.rolesCount}\n\n` +
                    `Rôles Kōeki dans la réponse Discord :\n${checks}\n\n` +
                    `Liste brute renvoyée par Discord :\n${liveRoles.join('\n')}`
                  );
                })()}
      </div>

      {!user ? (
        <div style={box}>
          ❌ Aucun utilisateur intranet chargé (user === null).
        </div>
      ) : (
        <>
          <div style={h}>1. Vérification des rôles Kōeki (dans le JWT)</div>
          <div style={box}>
            {koekiChecks.map((c) => {
              const present = rolesRaw.includes(c.id);
              return (
                <div key={c.id} style={{ marginBottom: 4 }}>
                  {present ? '✅' : '❌'} {c.label} — id {c.id} —{' '}
                  {present ? 'PRÉSENT' : 'ABSENT'}
                </div>
              );
            })}
          </div>

          <div style={h}>2. Grade Kōeki détecté</div>
          <div style={box}>
            {user.koeki
              ? `grade = "${user.koeki.grade}" · pôle = "${user.koeki.pole}"`
              : '⚠️ koeki = null (aucun grade Kōeki détecté)'}
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

          <div style={h}>5. Rôles bruts dans le JWT ({rolesRaw.length})</div>
          <div style={box}>
            {rolesRaw.length === 0
              ? '⚠️ rolesRaw VIDE'
              : rolesRaw.join('\n')}
          </div>
        </>
      )}
    </div>
  );
}
