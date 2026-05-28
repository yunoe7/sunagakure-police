'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — PARAMÈTRES
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir / modifier : canModifierTaux (Gérant, Co-Gérant, Superviseur éco,
 *   + admin technique / Jonin+ via hasAllPerm).
 *
 * 📜 Audit log : update sur koeki:parametres (changement de taux).
 *
 * Stockage Firebase : sunagakure/koeki/parametres → KoekiParametres
 * ════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { Save, Percent, ShieldAlert } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbUpdate } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  type KoekiParametres, type TauxParType, type SocieteType,
  SOCIETE_TYPES, SOCIETE_TYPE_LABEL, SOCIETE_TYPE_ICON,
  DEFAULT_TAUX_PAR_TYPE,
} from '@/types/koeki';

import styles from './page.module.css';

const FB_PARAMS = 'koeki/parametres';

export default function KoekiParametresPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.koeki.modifierTaux();

  const { data, loading } = useFirebaseValue<KoekiParametres | null>(FB_PARAMS);

  const [taux, setTaux] = useState<TauxParType>(DEFAULT_TAUX_PAR_TYPE);

  // Synchronise le form local quand les données Firebase arrivent
  useEffect(() => {
    if (data?.tauxParType) {
      setTaux({ ...DEFAULT_TAUX_PAR_TYPE, ...data.tauxParType });
    }
  }, [data]);

  async function handleSave() {
    // Validation
    for (const t of SOCIETE_TYPES) {
      const v = taux[t];
      if (typeof v !== 'number' || isNaN(v) || v < 0 || v > 100) {
        toast.error(`Le taux ${SOCIETE_TYPE_LABEL[t]} doit être entre 0 et 100`);
        return;
      }
    }

    const ancien = data?.tauxParType ?? DEFAULT_TAUX_PAR_TYPE;

    try {
      // dbUpdate fusionne : on ne touche qu'à tauxParType, paieParGrade est préservé
      await dbUpdate(FB_PARAMS, { tauxParType: taux });

      const resume = SOCIETE_TYPES
        .map((t) => `${SOCIETE_TYPE_LABEL[t]}: ${ancien[t] ?? '—'}%→${taux[t]}%`)
        .join(', ');

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'update',
        target: 'koeki:parametres',
        targetId: 'tauxParType',
        detail: `Kōeki — Taux d'imposition modifiés (${resume}). ` +
          `S'applique aux futures déclarations de CA des sociétés sans taux personnalisé.`,
      });

      toast.success('Taux enregistrés');
    } catch (err) {
      console.error('[KOEKI PARAMS SAVE]', err);
      toast.error('Erreur lors de l\'enregistrement');
    }
  }

  return (
    <Card
      title="🏯 Kōeki — Paramètres"
      subtitle="Taux d'imposition globaux par type de société"
    >
      {!canEdit && (
        <div className={styles.lockBanner}>
          <ShieldAlert size={16} />
          <span>
            Lecture seule — seuls les Gérants, Co-Gérants et Superviseurs économie
            peuvent modifier les taux.
          </span>
        </div>
      )}

      <p className={styles.intro}>
        Ces taux s'appliquent automatiquement au calcul de l'impôt lors d'une
        déclaration de chiffre d'affaires, <strong>sauf</strong> si la société a
        un taux personnalisé défini sur sa fiche (qui a alors priorité).
      </p>

      {loading ? (
        <p className={styles.muted}>Chargement…</p>
      ) : (
        <div className={styles.tauxGrid}>
          {SOCIETE_TYPES.map((t) => (
            <div key={t} className={styles.tauxCard}>
              <div className={styles.tauxHead}>
                <span className={styles.tauxIcon}>{SOCIETE_TYPE_ICON[t]}</span>
                <span className={styles.tauxName}>{SOCIETE_TYPE_LABEL[t]}</span>
              </div>
              <div className={styles.tauxInputWrap}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={taux[t] ?? 0}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setTaux({ ...taux, [t]: Number(e.target.value) || 0 } as TauxParType)
                  }
                  className={styles.tauxInput}
                />
                <Percent size={14} className={styles.percentIcon} />
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className={styles.actions}>
          <Button onClick={handleSave}>
            <Save size={14} /> Enregistrer les taux
          </Button>
        </div>
      )}
    </Card>
  );
}
