'use client';

import { useFirebaseValue } from './useFirebaseValue';

/**
 * Détecte l'état de connexion à Firebase Realtime Database.
 * Utilise le chemin spécial `.info/connected` exposé par Firebase.
 *
 * Remplace ta logique `_wasConnected` + onValue sur .info/connected.
 */
export function useFirebaseConnection(): boolean {
  const { data } = useFirebaseValue<boolean>('.info/connected');
  return data === true;
}
