import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        color: 'var(--text)',
      }}
    >
      <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 48, color: 'var(--gold2)' }}>404</h1>
      <p style={{ color: 'var(--muted)' }}>Cette page n&apos;existe pas.</p>
      <Link
        href="/dashboard"
        style={{
          padding: '10px 18px',
          background: 'linear-gradient(180deg, var(--accent2), var(--accent))',
          color: '#fff',
          borderRadius: 6,
          fontFamily: 'Barlow Condensed, sans-serif',
          fontWeight: 600,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          fontSize: 13,
        }}
      >
        Retour au tableau de bord
      </Link>
    </div>
  );
}
