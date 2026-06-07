'use client';

/**
 * Écran affiché à un utilisateur banni du site.
 * À rendre dans le layout/guard global quand isBanned === true.
 */
export function BannedScreen({ reason }: { reason: string | null }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        padding: '2rem',
        background:
          'radial-gradient(circle at 50% 30%, rgba(120,20,20,0.15), transparent 70%)',
      }}
    >
      <div style={{ fontSize: 48 }}>⛔</div>
      <h1
        style={{
          fontFamily: 'Barlow Condensed, sans-serif',
          fontWeight: 700,
          fontSize: 32,
          color: '#fca5a5',
          margin: 0,
          letterSpacing: 1,
        }}
      >
        Accès révoqué
      </h1>
      <p
        style={{
          maxWidth: 440,
          color: 'rgba(255,255,255,0.6)',
          lineHeight: 1.6,
          fontSize: 14,
        }}
      >
        Votre accès à l&apos;intranet de Sunagakure a été retiré par
        l&apos;administration.
        {reason ? (
          <>
            <br />
            <br />
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>Motif : {reason}</span>
          </>
        ) : null}
      </p>
      <p
        style={{
          fontSize: 11,
          opacity: 0.4,
          fontFamily: 'Share Tech Mono, monospace',
        }}
      >
        Contactez un administrateur si vous pensez qu&apos;il s&apos;agit d&apos;une
        erreur.
      </p>
    </div>
  );
}
