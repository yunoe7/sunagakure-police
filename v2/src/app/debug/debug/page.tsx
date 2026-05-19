'use client';

import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function DebugPage() {
  const data = useCurrentUser();

  return (
    <main style={{ padding: 20, color: 'white', background: '#0e0a06', minHeight: '100vh' }}>
      <h1 style={{ color: '#d4ac0d' }}>Debug IntranetUser</h1>
      <pre style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
{JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}
