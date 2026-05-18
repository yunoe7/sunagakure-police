'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebase, ensureAuthReady } from '@/lib/firebase';

interface UseAuthResult {
  user: User | null;
  loading: boolean;
}

/**
 * Hook qui expose l'utilisateur Firebase courant (anonyme dans notre cas).
 * Lance l'auth automatiquement au mount du composant.
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { auth } = getFirebase();

    // Lance l'auth anonyme en arrière-plan
    ensureAuthReady().catch(() => {
      /* erreur déjà loggée */
    });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
}
