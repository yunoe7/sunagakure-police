'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ensureAuthReady } from '@/lib/firebase';
import styles from './page.module.css';

/**
 * Page de login.
 * Pour l'instant : auth anonyme automatique au montage, redirection vers /dashboard.
 * Si plus tard tu veux un vrai login (email/password, Google, etc.), c'est ici.
 */
export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    ensureAuthReady()
      .then(() => router.push('/dashboard'))
      .catch((err) => console.error('Échec auth :', err));
  }, [router]);

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        <div className={styles.badge}>砂</div>
        <h1>SUNAGAKURE</h1>
        <p>Connexion en cours…</p>
      </div>
    </div>
  );
}
