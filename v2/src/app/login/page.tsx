'use client';

/**
 * Page de connexion personnalisée.
 *
 * Affiche un bouton "Se connecter avec Discord" qui lance le flow
 * OAuth. Après login Discord, redirige vers /dashboard (ou vers la
 * page initialement demandée via le paramètre `callbackUrl`).
 */

import { signIn, useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import styles from './page.module.css';

function LoginContent() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');

  // Si déjà connecté, redirige direct vers le dashboard
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  if (status === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loader} />
        <p>Chargement…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      <div className={styles.card}>
        <div className={styles.crest}>砂</div>
        <h1 className={styles.title}>Sunagakure</h1>
        <p className={styles.subtitle}>Intranet du Village Caché du Sable</p>

        <div className={styles.divider}>
          <span>Identification requise</span>
        </div>

        <p className={styles.intro}>
          Cet espace est réservé aux membres autorisés du village.
          Authentifiez-vous via votre compte Discord pour accéder à l&apos;intranet.
        </p>

        {error && (
          <div className={styles.error}>
            <strong>⚠ Erreur de connexion</strong>
            <p>
              {error === 'OAuthSignin' && "Impossible de démarrer la connexion Discord."}
              {error === 'OAuthCallback' && "Erreur lors du retour depuis Discord."}
              {error === 'OAuthCreateAccount' && "Impossible de créer le compte."}
              {error === 'AccessDenied' && "Accès refusé."}
              {error === 'Configuration' && "Configuration serveur incorrecte. Contacte un administrateur."}
              {!['OAuthSignin','OAuthCallback','OAuthCreateAccount','AccessDenied','Configuration'].includes(error) &&
                `Erreur inconnue : ${error}`}
            </p>
          </div>
        )}

        <button
          className={styles.discordBtn}
          onClick={() => signIn('discord', { callbackUrl })}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          <span>Se connecter avec Discord</span>
        </button>

        <p className={styles.legalNote}>
          En vous connectant, vous acceptez d&apos;être identifié dans
          l&apos;intranet sous votre pseudo Discord. Aucun mot de passe n&apos;est stocké.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Chargement…
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
