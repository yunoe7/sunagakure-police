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
 * Deux sections :
 *   1. Taux d'imposition globaux par type de société
 *   2. Barème de paie hebdo par grade Kōeki + bonus organisateur d'event
 *
 * 📜 Audit log : update sur koeki:parametres.
 *
 * Stockage Firebase : sunagakure/koeki/parametres → KoekiParametres
 * ════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { Save, Percent, ShieldAlert, Banknote, Coins } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbUpdate } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  type KoekiParametres, type TauxParType, type KoekiGrade,
  SOCIETE_TYPES, SOCIETE_TYPE_LABEL, SOCIETE_TYPE_ICON,
  DEFAULT_TAUX_PAR_TYPE,
  KOEKI_GRADE_LABEL, DEFAULT_PAIE_PAR_GRADE, PAIE_ORGANISATEUR_EVENT,
  fmtMoney,
} from '@/types/koeki';

import styles from './page.module.css';

const FB_PARAMS = 'koeki/parametres';

const GRADES_LISTE: KoekiGrade[] = [
  'gerant', 'co-gerant', 'superviseur-eco', 'superviseur-event',
  'chef-eco', 'chef-event', 'membre-eco', 'membre-event',
];

export default function KoekiParametresPage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.koeki.modifierTaux();

  const { data, loading } = useFirebaseValue<KoekiParametres | null>(FB_PARAMS);

  const [taux, setTaux] = useState<TauxParType>(DEFAULT_TAUX_PAR_TYPE);
  const [paie, setPaie] = useState<Record<KoekiGrade, number>>(DEFAULT_PAIE_PAR_GRADE);
  const [paieEvent, setPaieEvent] = useState<number>(PAIE_ORGANISATEUR_EVENT);

  // Synchronise le form local quand les données Firebase arrivent
  useEffect(() => {
    if (data?.tauxParType) {
      setTaux({ ...DEFAULT_TAUX_PAR_TYPE, ...data.tauxParType });
    }
    if (data?.paieParGrade) {
      setPaie({ ...DEFAULT_PAIE_PAR_GRADE, ...data.paieParGrade });
    }
    if (typeof data?.paieOrganisateurEvent === 'number') {
      setPaieEvent(data.paieOrganisateurEvent);
    }
  }, [data]);

  async function handleSaveTaux() {
    for (const t of SOCIETE_TYPES) {
      const v = taux[t];
      if (typeof v !== 'number' || isNaN(v) || v < 0 || v > 100) {
        toast.error(`Le taux ${SOCIETE_TYPE_LABEL[t]} doit être entre 0 et 100`);
        return;
      }
    }
    const ancien = data?.tauxParType ?? DEFAULT_TAUX_PAR_TYPE;
    try {
      await dbUpdate(FB_PARAMS, { tauxParType: taux });
      const resume = SOCIETE_TYPES
        .map((t) => `${SOCIETE_TYPE_LABEL[t]}: ${ancien[t] ?? '—'}%→${taux[t]}%`)
        .join(', ');
      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: 'update', target: 'koeki:parametres', targetId: 'tauxParType',
        detail: `Kōeki — Taux d'imposition modifiés (${resume}). S'applique aux futures déclarations de CA sans taux personnalisé.`,
      });
      toast.success('Taux enregistrés');
    } catch (err) {
      console.error('[KOEKI PARAMS TAUX]', err);
      toast.error('Erreur lors de l\'enregistrement');
    }
  }

  async function handleSavePaie() {
    for (const g of GRADES_LISTE) {
      const v = paie[g];
      if (typeof v !== 'number' || isNaN(v) || v < 0) {
        toast.error(`La paie ${KOEKI_GRADE_LABEL[g]} doit être un nombre positif`);
        return;
      }
    }
    if (isNaN(paieEvent) || paieEvent < 0) {
      toast.error('Le bonus organisateur doit être un nombre positif');
      return;
    }
    try {
      await dbUpdate(FB_PARAMS, { paieParGrade: paie, paieOrganisateurEvent: paieEvent });
      logAction({
        who: CURRENT_USER, whoId: u.id ?? null,
        action: 'update', target: 'koeki:parametres', targetId: 'paieParGrade',
        detail: `Kōeki — Barème de paie modifié. ` +
          GRADES_LISTE.map((g) => `${KOEKI_GRADE_LABEL[g]}: ${fmtMoney(paie[g])}`).join(', ') +
          ` ; bonus event: ${fmtMoney(paieEvent)}. S'applique aux prochains versements de paie.`,
      });
      toast.success('Barème de paie enregistré');
    } catch (err) {
      console.error('[KOEKI PARAMS PAIE]', err);
      toast.error('Erreur lors de l\'enregistrement');
    }
  }

  return (
    <>
      <Card
        title="🏯 Kōeki — Paramètres"
        subtitle="Taux d'imposition & barème de paie"
      >
        {!canEdit && (
          <div className={styles.lockBanner}>
            <ShieldAlert size={16} />
            <span>
              Lecture seule — seuls les Gérants, Co-Gérants et Superviseurs économie
              peuvent modifier les paramètres.
            </span>
          </div>
        )}

        {/* ───── SECTION 1 : TAUX D'IMPOSITION ───── */}
        <div className={styles.sectionTitle}><Percent size={15} /> Taux d'imposition par type</div>
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
                    type="number" min="0" max="100" step="1"
                    value={taux[t] ?? 0}
                    disabled={!canEdit}
                    onChange={(e) => setTaux({ ...taux, [t]: Number(e.target.value) || 0 } as TauxParType)}
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
            <Button onClick={handleSaveTaux}><Save size={14} /> Enregistrer les taux</Button>
          </div>
        )}

        {/* ───── SECTION 2 : BARÈME DE PAIE ───── */}
        <div className={styles.sep} />
        <div className={styles.sectionTitle}><Banknote size={15} /> Barème de paie hebdomadaire</div>
        <p className={styles.intro}>
          Montant versé à chaque membre selon son grade lors d'un versement de paie.
          Le <strong>bonus organisateur d'event</strong> remplace la paie de grade pour
          un membre ayant organisé un événement dans la semaine (pas de cumul).
        </p>

        {loading ? (
          <p className={styles.muted}>Chargement…</p>
        ) : (
          <>
            <div className={styles.paieGrid}>
              {GRADES_LISTE.map((g) => (
                <div key={g} className={styles.paieCard}>
                  <div className={styles.paieGradeName}>{KOEKI_GRADE_LABEL[g]}</div>
                  <div className={styles.paieInputWrap}>
                    <input
                      type="number" min="0" step="1000"
                      value={paie[g] ?? 0}
                      disabled={!canEdit}
                      onChange={(e) => setPaie({ ...paie, [g]: Number(e.target.value) || 0 })}
                      className={styles.paieInput}
                    />
                    <span className={styles.ryoIcon}>₽</span>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.eventCard}>
              <div className={styles.eventHead}><Coins size={15} /> Bonus organisateur d'event</div>
              <div className={styles.paieInputWrap}>
                <input
                  type="number" min="0" step="1000"
                  value={paieEvent}
                  disabled={!canEdit}
                  onChange={(e) => setPaieEvent(Number(e.target.value) || 0)}
                  className={styles.paieInput}
                />
                <span className={styles.ryoIcon}>₽</span>
              </div>
              <p className={styles.eventNote}>Remplace la paie de grade si la case « Event semaine » est cochée.</p>
            </div>
          </>
        )}

        {canEdit && (
          <div className={styles.actions}>
            <Button onClick={handleSavePaie}><Save size={14} /> Enregistrer le barème de paie</Button>
          </div>
        )}
      </Card>
    </>
  );
}
