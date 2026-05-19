'use client';
 
/**
 * ═══════════════════════════════════════════════════════════════════
 *  Audit Log — traçabilité des actions admin
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Stocke les actions sensibles dans Firebase à `/audit_log` (racine).
 *  Chaque entrée garde qui, quoi, quand, sur quel objet, et un détail.
 *
 *  Usage :
 *
 *    import { logAction } from '@/lib/audit';
 *    import { useCurrentUser } from '@/hooks/useCurrentUser';
 *
 *    const u = useCurrentUser();
 *
 *    // Avant de supprimer un dossier
 *    await logAction({
 *      who: u.displayName,
 *      whoId: u.id,
 *      action: 'delete',
 *      target: 'dossier',
 *      targetId: String(d.id),
 *      detail: `Suppression du dossier de ${d.nom}`,
 *    });
 *    await dbSet(FB_PATH, all.filter(x => x.id !== d.id));
 *
 *  ⚠️ Le log est non-bloquant : si Firebase est lent, on continue.
 *  ⚠️ On n'écrit JAMAIS de données sensibles dans `detail` (pas de mdp, etc).
 * ═══════════════════════════════════════════════════════════════════
 */
 
const AUDIT_PATH = '/audit_log';
 
export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'export' | 'import' | 'compress';
 
export type AuditEntry = {
  /** Timestamp ms */
  when: number;
  /** Pseudo Discord ou displayName de l'utilisateur */
  who: string;
  /** Discord ID (peut être null si inconnu) */
  whoId: string | null;
  /** Type d'action */
  action: AuditAction;
  /** Type d'objet ciblé (ex: "dossier", "operation", "membre") */
  target: string;
  /** ID de l'objet ciblé (peut être null) */
  targetId: string | null;
  /** Description courte de l'action (humaine) */
  detail: string;
};
 
/**
 * Log une action dans Firebase. Non-bloquant : si l'écriture échoue,
 * on log seulement dans la console.
 */
export async function logAction(params: {
  who: string;
  whoId?: string | null;
  action: AuditAction;
  target: string;
  targetId?: string | null;
  detail: string;
}): Promise<void> {
  const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    console.warn('[Audit] DATABASE_URL manquant → skip');
    return;
  }
 
  const entry: AuditEntry = {
    when: Date.now(),
    who: params.who,
    whoId: params.whoId ?? null,
    action: params.action,
    target: params.target,
    targetId: params.targetId ?? null,
    detail: params.detail,
  };
 
  // Clé : timestamp + suffixe random pour éviter collisions
  const key = `${entry.when}_${Math.random().toString(36).slice(2, 8)}`;
  const url = `${dbUrl}${AUDIT_PATH}/${key}.json`;
 
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      console.warn('[Audit] Échec écriture log :', await res.text());
    }
  } catch (err) {
    console.warn('[Audit] Erreur réseau :', err);
  }
}
 
/**
 * Helpers labels pour l'UI.
 */
export const ACTION_LABEL: Record<AuditAction, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  login: 'Connexion',
  export: 'Export',
  import: 'Import',
  compress: 'Compression',
};
 
export const ACTION_COLOR: Record<AuditAction, string> = {
  create: '#22c55e',
  update: '#3b82f6',
  delete: '#ef4444',
  login: '#a78bfa',
  export: '#c9a227',
  import: '#f59e0b',
  compress: '#06b6d4',
};
 
