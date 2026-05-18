'use client';

import {
  ref,
  set,
  update,
  push,
  remove,
  get,
  onValue,
  serverTimestamp,
  type DatabaseReference,
} from 'firebase/database';
import { getFirebase, ensureAuthReady } from './firebase';

/**
 * Helpers Realtime Database — version "ergonomique" qui :
 *  - attend automatiquement que l'auth anonyme soit prête
 *  - garde des types TypeScript propres
 *  - exporte aussi les primitives Firebase pour les cas avancés
 *
 * Ces helpers remplacent les `window._fbSet`, `window._fbUpdate`, etc.
 * de l'ancien intranet.
 */

function getRef(path: string): DatabaseReference {
  const { db } = getFirebase();
  return ref(db, path);
}

export async function dbGet<T = unknown>(path: string): Promise<T | null> {
  await ensureAuthReady();
  const snap = await get(getRef(path));
  return snap.exists() ? (snap.val() as T) : null;
}

export async function dbSet<T>(path: string, value: T): Promise<void> {
  await ensureAuthReady();
  await set(getRef(path), value);
}

export async function dbUpdate(path: string, updates: Record<string, unknown>): Promise<void> {
  await ensureAuthReady();
  await update(getRef(path), updates);
}

/**
 * Pousse un nouvel enfant avec un ID auto-généré.
 * Retourne l'ID du nouvel enregistrement.
 */
export async function dbPush<T>(path: string, value: T): Promise<string> {
  await ensureAuthReady();
  const newRef = push(getRef(path));
  await set(newRef, value);
  return newRef.key!;
}

export async function dbRemove(path: string): Promise<void> {
  await ensureAuthReady();
  await remove(getRef(path));
}

/**
 * S'abonner aux changements en temps réel.
 * Retourne une fonction de cleanup à appeler dans le `return` du useEffect.
 *
 * Préfère le hook `useFirebaseValue` plutôt que d'utiliser ça directement.
 */
export function dbSubscribe<T = unknown>(
  path: string,
  callback: (value: T | null) => void
): () => void {
  // Note : onValue accepte aussi un ref non-authentifié, il déclenche juste
  // une erreur silencieuse si les règles bloquent. On lance ensureAuthReady
  // en arrière-plan, le listener réagira dès que les données sont accessibles.
  ensureAuthReady().catch(() => {
    /* déjà loggé dans firebase.ts */
  });

  const unsubscribe = onValue(
    getRef(path),
    (snap) => callback(snap.exists() ? (snap.val() as T) : null),
    (err) => {
      console.error(`[FB-READ] Erreur sur ${path}:`, err);
      callback(null);
    }
  );

  return unsubscribe;
}

// Re-export du timestamp serveur pour les écritures
export { serverTimestamp };
