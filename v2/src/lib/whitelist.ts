/**
 * ═══════════════════════════════════════════════════════════════════
 *  Whitelist Admin — accès admin technique garanti
 * ═══════════════════════════════════════════════════════════════════
 *  Deux niveaux de stockage :
 *
 *  1. HARDCODÉ (ADMIN_WHITELIST_HARDCODED) :
 *     Toi (le Kazekage technique). Cette liste est toujours active,
 *     même si Firebase est en panne, ce qui garantit que tu gardes
 *     toujours accès à l'intranet pour réparer en cas de souci.
 *
 *  2. FIREBASE (sunagakure/admin_whitelist) :
 *     Liste dynamique gérée via /admin/whitelist (UI).
 *     Tu peux ajouter/retirer des admins sans toucher au code.
 *
 *  Logique : isInWhitelist = isInHardcoded || isInFirebase
 *
 *  ⚠️ Note technique : isInWhitelist est appelée depuis NextAuth
 *  (côté serveur) au moment du login. Si Firebase est lent, on
 *  préfère timeout et accepter UNIQUEMENT les hardcodés plutôt
 *  que bloquer le login.
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Whitelist hardcodée — TOUJOURS active, fallback de sécurité.
 * Pour ajouter quelqu'un en dur (admin de secours), ajoute son ID ici.
 */
export const ADMIN_WHITELIST_HARDCODED: string[] = [
  "1239889177055596607", // Toi (Tokubetsu Jonin RP, admin technique permanent)
];

/**
 * Vérifie si un Discord User ID est dans la whitelist hardcodée.
 * Synchrone, ne nécessite pas Firebase.
 */
export function isInHardcodedWhitelist(discordId: string): boolean {
  return ADMIN_WHITELIST_HARDCODED.includes(discordId);
}

/**
 * Vérifie si un Discord User ID est dans la whitelist Firebase.
 * Asynchrone, lit `sunagakure/admin_whitelist` dans Firebase.
 * Timeout de 5 secondes pour ne pas bloquer le login si Firebase est lent.
 *
 * 🔧 Fix : on lit dans `sunagakure/admin_whitelist/{discordId}` pour
 * matcher l'écriture faite par useAdminWhitelist (qui passe par dbSet
 * et qui préfixe automatiquement par "sunagakure/").
 */
export async function isInFirebaseWhitelist(discordId: string): Promise<boolean> {
  try {
    const { getDatabase, ref, get, child } = await import("firebase/database");
    const { initializeApp, getApps } = await import("firebase/app");

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!,
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
    const db = getDatabase(app);

    // 🔧 FIX : chemin préfixé par "sunagakure/" pour correspondre à où la UI écrit
    const fetchPromise = get(child(ref(db), `sunagakure/admin_whitelist/${discordId}`));
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000)
    );

    const snapshot = await Promise.race([fetchPromise, timeoutPromise]);

    if (!snapshot || !("exists" in snapshot)) return false;
    return snapshot.exists();
  } catch (err) {
    console.error("[Whitelist] Firebase check failed:", err);
    return false;
  }
}

/**
 * Fonction principale : vérifie si un Discord User ID a l'accès admin.
 * Combine hardcodé + Firebase.
 *
 * Utilisée par NextAuth (callback signIn et jwt) côté serveur.
 */
export async function isInWhitelist(discordId: string): Promise<boolean> {
  if (isInHardcodedWhitelist(discordId)) return true;
  return await isInFirebaseWhitelist(discordId);
}

// ═══════════════════════════════════════════════════════════════════
//  Types pour l'UI /admin/whitelist
// ═══════════════════════════════════════════════════════════════════

/**
 * Entrée dans la whitelist Firebase.
 * Key = discordId, Value = WhitelistEntry
 */
export type WhitelistEntry = {
  /** Pseudo Discord écrit à la main quand on ajoute (ex: "Hyo Ryuzen") */
  note: string;
  /** Date d'ajout (timestamp ms) */
  addedAt: number;
  /** Qui a ajouté (displayName de l'admin qui a fait l'action) */
  addedBy: string;
};
