'use client';
 
/**
 * ═══════════════════════════════════════════════════════════════════
 *  Hook useAuditLog
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Lit le journal d'audit depuis Firebase (/audit_log à la racine).
 *  Retourne les entrées triées par date (plus récente en premier).
 *
 *  Usage :
 *    const { entries, loading } = useAuditLog();
 *    const { entries, loading } = useAuditLog({ limit: 100 });
 *
 *  ⚠️ Si tu as beaucoup d'entrées (10 000+), pense à ajouter un filtre côté
 *  serveur (Firebase rules + query.limitToLast()). Pour l'instant on lit tout.
 * ═══════════════════════════════════════════════════════════════════
 */
 
import { useMemo } from 'react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import type { AuditEntry } from '@/lib/audit';
 
const FB_PATH = '/audit_log';
 
export function useAuditLog(options?: { limit?: number }) {
  const { data, loading } = useFirebaseValue<Record<string, AuditEntry> | null>(FB_PATH);
  const limit = options?.limit ?? 200;
 
  const entries = useMemo<(AuditEntry & { id: string })[]>(() => {
    if (!data) return [];
    return Object.entries(data)
      .map(([id, e]) => ({ ...e, id }))
      .filter(
        (e): e is AuditEntry & { id: string } =>
          !!e && typeof e === 'object' && typeof e.when === 'number'
      )
      .sort((a, b) => b.when - a.when)
      .slice(0, limit);
  }, [data, limit]);
 
  return { entries, loading };
}
