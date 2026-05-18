'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';

/**
 * Config Firebase — récupérée depuis les variables d'environnement.
 * Toutes les vars NEXT_PUBLIC_* sont injectées au build et accessibles côté client.
 *
 * ⚠️ Ces clés sont publiques par design (Firebase web) — la sécurité passe
 * par les RÈGLES Firebase (Database Rules) côté serveur, pas par cacher la clé.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!,
};

// Pattern singleton : Next.js peut re-importer ce fichier plusieurs fois
// (hot reload en dev, multiples routes en prod), on évite la double init.
let app: FirebaseApp;
let db: Database;
let auth: Auth;

function init() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0]!;
  }
  db = getDatabase(app);
  auth = getAuth(app);
  return { app, db, auth };
}

// Init paresseuse : seulement quand on accède aux exports
export function getFirebase() {
  if (!app) init();
  return { app, db, auth };
}

/**
 * Promise qui résout quand l'utilisateur anonyme est authentifié.
 * Indispensable parce que les règles Firebase exigent `auth != null`.
 *
 * Usage typique :
 *   await ensureAuthReady();
 *   // → maintenant tu peux lire/écrire en toute sécurité
 */
let authReadyPromise: Promise<void> | null = null;

export function ensureAuthReady(): Promise<void> {
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = new Promise((resolve, reject) => {
    const { auth } = getFirebase();

    // Si déjà connecté, résout immédiatement
    if (auth.currentUser) {
      resolve();
      return;
    }

    signInAnonymously(auth)
      .then(() => resolve())
      .catch((err) => {
        console.error('[FB-AUTH] Échec auth anonyme:', err.code, err.message);
        if (
          err.code === 'auth/admin-restricted-operation' ||
          err.code === 'auth/operation-not-allowed'
        ) {
          console.error(
            '⚠️ Active la connexion "Anonyme" dans la console Firebase (Authentication → Sign-in method)'
          );
        }
        reject(err);
      });
  });

  return authReadyPromise;
}
