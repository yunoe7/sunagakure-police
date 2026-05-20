'use client';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Hook useAdminWhitelist
 * ═══════════════════════════════════════════════════════════════════
 *  Hook pour lire / écrire la whitelist Firebase depuis l'UI.
 *
 *  Usage :
 *    const { entries, loading, addAdmin, removeAdmin } = useAdminWhitelist();
 *
 *    await addAdmin('1234...', 'Hyo Ryuzen');
 *    await removeAdmin('1234...');
 *
 *  📜 Audit log : toute action sensible (ajout/retrait d'admin) est
 *     tracée dans /audit_log Firebase. C'est la fonctionnalité LA
 *     plus sensible du projet : qui peut accéder à toute l'intranet.
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  ADMIN_WHITELIST_HARDCODED,
  type WhitelistEntry,
} from '@/lib/whitelist';

const FB_PATH = 'admin_whitelist';

export type WhitelistDisplayEntry = {
  discordId: string;
  note: string;
  addedAt: number | null;
  addedBy: string | null;
  isHardcoded: boolean;
};

export function useAdminWhitelist() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const { data, loading } = useFirebaseValue<Record<string, WhitelistEntry> | null>(FB_PATH);
  const [saving, setSaving] = useState(false);

  // Combiner hardcoded + Firebase pour l'affichage
  const entries: WhitelistDisplayEntry[] = [];

  // 1. D'abord les hardcodés (toujours en premier, non supprimables)
  for (const id of ADMIN_WHITELIST_HARDCODED) {
    entries.push({
      discordId: id,
      note: 'Kazekage technique (en dur dans le code)',
      addedAt: null,
      addedBy: null,
      isHardcoded: true,
    });
  }

  // 2. Puis les entries Firebase
  if (data) {
    for (const [discordId, entry] of Object.entries(data)) {
      // Évite les doublons si quelqu'un est hardcodé ET en Firebase
      if (ADMIN_WHITELIST_HARDCODED.includes(discordId)) continue;
      entries.push({
        discordId,
        note: entry.note,
        addedAt: entry.addedAt,
        addedBy: entry.addedBy,
        isHardcoded: false,
      });
    }
  }

  // Trier : hardcodés en premier, puis par date d'ajout décroissante
  entries.sort((a, b) => {
    if (a.isHardcoded !== b.isHardcoded) return a.isHardcoded ? -1 : 1;
    return (b.addedAt ?? 0) - (a.addedAt ?? 0);
  });

  /**
   * Ajoute un Discord ID à la whitelist Firebase.
   * 📜 Action loggée dans /audit_log.
   */
  async function addAdmin(discordId: string, note: string): Promise<boolean> {
    const cleanId = discordId.trim();
    const cleanNote = note.trim();

    // Validations
    if (!/^\d{17,19}$/.test(cleanId)) {
      toast.error('Discord ID invalide (17-19 chiffres attendus)');
      return false;
    }
    if (!cleanNote) {
      toast.error('Note obligatoire (pseudo Discord)');
      return false;
    }
    if (ADMIN_WHITELIST_HARDCODED.includes(cleanId)) {
      toast.error('Cet utilisateur est déjà admin en dur');
      return false;
    }
    if (data && data[cleanId]) {
      toast.error('Cet utilisateur est déjà dans la whitelist');
      return false;
    }

    setSaving(true);
    try {
      const newData = {
        ...(data ?? {}),
        [cleanId]: {
          note: cleanNote,
          addedAt: Date.now(),
          addedBy: CURRENT_USER ?? 'Inconnu',
        } as WhitelistEntry,
      };

      // 📜 AUDIT LOG (avant l'écriture — action très sensible)
      logAction({
        who: CURRENT_USER ?? 'Inconnu',
        whoId: u.id ?? null,
        action: 'create',
        target: 'admin_whitelist',
        targetId: cleanId,
        detail: `🔒 Ajout d'un administrateur technique : ${cleanNote} (Discord ID: ${cleanId})`,
      });

      await dbSet(FB_PATH, newData);
      toast.success(`${cleanNote} ajouté(e) à la whitelist`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'ajout');
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Retire un Discord ID de la whitelist Firebase.
   * Impossible de retirer un hardcodé.
   * 📜 Action loggée dans /audit_log.
   */
  async function removeAdmin(discordId: string): Promise<boolean> {
    if (ADMIN_WHITELIST_HARDCODED.includes(discordId)) {
      toast.error('Impossible de retirer un admin hardcodé');
      return false;
    }
    if (!data || !data[discordId]) {
      toast.error('Utilisateur introuvable');
      return false;
    }

    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [discordId]: removed, ...rest } = data;

      // 📜 AUDIT LOG (avant l'écriture — action très sensible)
      logAction({
        who: CURRENT_USER ?? 'Inconnu',
        whoId: u.id ?? null,
        action: 'delete',
        target: 'admin_whitelist',
        targetId: discordId,
        detail: `🔒 Retrait d'un administrateur technique : ${removed.note} (Discord ID: ${discordId}, ajouté(e) par ${removed.addedBy ?? 'inconnu'})`,
      });

      await dbSet(FB_PATH, rest);
      toast.success(`${removed.note} retiré(e) de la whitelist`);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors du retrait');
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    entries,
    loading,
    saving,
    addAdmin,
    removeAdmin,
  };
}
