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
 *  - applique automatiquement le préfixe DB_PREFIX
 *  - garde des types TypeScript propres
 *  - exporte aussi les primitives Firebase pour les cas avancés
 *
 * Ces helpers remplacent les `window._fbSet`, `window._fbUpdate`, etc.
 * de l'ancien intranet.
 *
 * ─── PRÉFIXE GLOBAL ───
 * L'ancien intranet stocke toutes ses données sous `sunagakure/` dans Firebase.
 * Pour rester compatible, tous nos chemins sont automatiquement préfixés.
 *
 * Donc tu écris : useFirebaseValue('annonces')
 * En réalité, c'est : sunagakure/annonces qui est lu
 *
 * Cas spécial : `.info/connected` (chemin système Firebase) n'est PAS préfixé.
 * Et tout chemin commençant par `/` est traité comme absolu (sans préfixe),
 * au cas où tu aurais besoin d'accéder à la racine.
 */
const DB_PREFIX = 'sunagakure';

/**
 * Applique le préfixe à un chemin, sauf cas spéciaux.
 * - '.info/connected' → '.info/connected' (chemin système Firebase)
 * - '/foo' → 'foo' (chemin absolu explicite, sans préfixe)
 * - 'annonces' → 'sunagakure/annonces' (préfixe ajouté)
 */
function resolvePath(path: string): string {
  // Chemins système Firebase (.info/connected, .info/serverTimeOffset, etc.)
  if (path.startsWith('.')) return path;

  // Chemin absolu (commence par /) → on enlève le / et on ne préfixe pas
  if (path.startsWith('/')) return path.slice(1);

  // Sinon : préfixe automatique
  return `${DB_PREFIX}/${path}`;
}

function getRef(path: string): DatabaseReference {
  const { db } = getFirebase();
  return ref(db, resolvePath(path));
}

export async function dbGet<T = unknown>(path: string): Promise<T | null> {
  await ensureAuthReady();
  const snap = await get(getRef(path));
  return snap.exists() ? (snap.val() as T) : null;
}
/**
 * Firebase RTDB refuse les valeurs `undefined`. Cette fonction parcourt
 * récursivement un objet et retire toutes les clés dont la valeur est undefined.
 * Les chaînes vides et 0 sont conservés (ce sont des valeurs valides).
 */
function stripUndefined<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((v) => v !== undefined) as T;
  }
  if (typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefined(v);
      }
    }
    return cleaned as T;
  }
  return value;
}
export async function dbSet<T>(path: string, value: T): Promise<void> {
  await ensureAuthReady();
  await set(getRef(path), stripUndefined(value));
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
