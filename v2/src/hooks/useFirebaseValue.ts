'use client';

import { useEffect, useState } from 'react';
import { dbSubscribe } from '@/lib/db';

interface UseFirebaseValueResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook principal pour lire de la donnée Firebase en temps réel.
 *
 * Le composant se re-render automatiquement à chaque changement de la donnée.
 * Le listener est nettoyé proprement au démontage (ou si le path change).
 *
 * @example
 * const { data: patients, loading } = useFirebaseValue<Record<string, Patient>>('medical/patients');
 * if (loading) return <Spinner />;
 * return <div>{Object.values(patients ?? {}).length} patients</div>;
 */
export function useFirebaseValue<T = unknown>(
  path: string | null
): UseFirebaseValueResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = dbSubscribe<T>(path, (value) => {
        setData(value);
        setLoading(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [path]);

  return { data, loading, error };
}
