'use client';
 
/**
 * ═══════════════════════════════════════════════════════════════════
 *  Hook useMembers
 * ═══════════════════════════════════════════════════════════════════
 *  Lit la liste des membres enregistrés depuis Firebase (/members).
 *  Chaque user est ajouté/mis à jour à chaque login via auth.ts.
 *
 *  ⚠️ Le path commence par "/" → chemin absolu, donc on contourne le
 *  préfixe global "sunagakure/" appliqué par db.ts.
 *  Ceci s'aligne sur ce qu'écrit auth.ts (qui écrit dans /members/{id}
 *  à la racine via fetch direct, pas via le SDK Firebase préfixé).
 *
 *  Usage :
 *    const { members, loading, stats } = useMembers();
 * ═══════════════════════════════════════════════════════════════════
 */
 
import { useMemo } from 'react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
 
const FB_PATH = '/members';
 
export type Member = {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  rangNom: string | null;
  rangNiveau: number | null;
  branches: string[];
  clan: string | null;
  gerantDe: string[];
  coGerantDe: string[];
  isAdmin: boolean;
  isStaff: boolean;
  isKazekage: boolean;
  firstLogin: number;
  lastLogin: number;
};
 
export function useMembers() {
  const { data, loading } = useFirebaseValue<Record<string, Member> | null>(FB_PATH);
 
  const members = useMemo<Member[]>(() => {
    if (!data) return [];
    return Object.values(data).filter(
      (m): m is Member => !!m && typeof m === 'object' && !!m.discordId
    );
  }, [data]);
 
  const stats = useMemo(() => {
    const total = members.length;
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const actifs7j = members.filter((m) => now - m.lastLogin < sevenDays).length;
    const actifs30j = members.filter((m) => now - m.lastLogin < thirtyDays).length;
    const admins = members.filter((m) => m.isAdmin).length;
    return { total, actifs7j, actifs30j, admins };
  }, [members]);
 
  return { members, loading, stats };
}
 
