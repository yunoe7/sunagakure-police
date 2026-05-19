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
 *  ⚠️ Les données peuvent contenir des champs manquants (anciens enregistrements
 *  écrits avant que certains champs existent, ex: avant le fix de buildIntranetUser).
 *  On normalise chaque membre pour garantir que tous les champs ont une valeur
 *  par défaut sûre, sinon les composants UI crashent sur `undefined.length` etc.
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
 
/**
 * Garantit qu'un membre brut venu de Firebase a tous les champs requis,
 * avec des valeurs par défaut sûres pour éviter les crashs UI.
 */
function normalizeMember(raw: unknown): Member | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
 
  const discordId = typeof r.discordId === 'string' ? r.discordId : null;
  if (!discordId) return null;
 
  return {
    discordId,
    username: typeof r.username === 'string' ? r.username : 'Inconnu',
    avatarUrl: typeof r.avatarUrl === 'string' ? r.avatarUrl : null,
    rangNom: typeof r.rangNom === 'string' ? r.rangNom : null,
    rangNiveau: typeof r.rangNiveau === 'number' ? r.rangNiveau : null,
    branches: Array.isArray(r.branches) ? (r.branches as string[]) : [],
    clan: typeof r.clan === 'string' ? r.clan : null,
    gerantDe: Array.isArray(r.gerantDe) ? (r.gerantDe as string[]) : [],
    coGerantDe: Array.isArray(r.coGerantDe) ? (r.coGerantDe as string[]) : [],
    isAdmin: r.isAdmin === true,
    isStaff: r.isStaff === true,
    isKazekage: r.isKazekage === true,
    firstLogin: typeof r.firstLogin === 'number' ? r.firstLogin : 0,
    lastLogin: typeof r.lastLogin === 'number' ? r.lastLogin : 0,
  };
}
 
export function useMembers() {
  const { data, loading } = useFirebaseValue<Record<string, unknown> | null>(FB_PATH);
 
  const members = useMemo<Member[]>(() => {
    if (!data) return [];
    return Object.values(data)
      .map(normalizeMember)
      .filter((m): m is Member => m !== null);
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
