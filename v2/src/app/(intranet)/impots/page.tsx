'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page IMPÔTS — Registre fiscal de Sunagakure
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase :
 *   sunagakure/impots/grades    (barème par rang)
 *   sunagakure/impots/ninjas    (registre des contribuables)
 *   sunagakure/impots/paiements (historique paiements)
 *
 * Features :
 *   - Tableau du barème par rang (éditable)
 *   - Liste des contribuables avec statut payé/impayé
 *   - Bouton "Marquer payé" qui crée un paiement
 *   - Historique des paiements de la semaine
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Receipt, Coins,
  CheckCircle2, AlertCircle, Settings,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type GradeBareme, type NinjaImpot, type PaiementImpot,
  DEFAULT_BAREME, currentWeek, fmtMoney, fmtDateFR,
} from '@/types/fiscal';
import type { Recense } from '@/types/recense';

import styles from './page.module.css';

const FB_GRADES = 'impots/grades';
const FB_PAIEMENTS = 'impots/paiements';
type Tab = 'registre' | 'historique' | 'bareme';

export default function ImpotsPage() {
  const CURRENT_USER = useCurrentUser().displayName;
  const { data: gradesData } = useFirebaseValue<GradeBareme[] | null>(FB_GRADES);
  const { data: paiementsData } = useFirebaseValue<PaiementImpot[] | null>(FB_PAIEMENTS);
  const { data: recensesData } = useFirebaseValue<Recense[] | null>('recenses');

  const [tab, setTab] = useState<Tab>('registre');
  const [search, setSearch] = useState('');
  const [showBareme, setShowBareme] = useState(false);
  const [baremeForm, setBaremeForm] = useState<GradeBareme[]>([]);

  // ─── Données ───
  const grades = useMemo<GradeBareme[]>(() => {
    if (!gradesData) return DEFAULT_BAREME;
    return Array.isArray(gradesData) ? gradesData : Object.values(gradesData);
  }, [gradesData]);

  const paiements = useMemo<PaiementImpot[]>(
    () => (Array.isArray(paiementsData) ? paiementsData : paiementsData ? Object.values(paiementsData) : []).filter(
      (p): p is PaiementImpot => p !== null && typeof p === 'object' && !!p.id
    ),
    [paiementsData]
  );

  // Contribuables = recensés actifs (vivants, non-exemptés)
  const contribuables = useMemo<NinjaImpot[]>(() => {
    const recenses = (Array.isArray(recensesData) ? recensesData : recensesData ? Object.values(recensesData) : [])
      .filter((r): r is Recense => r !== null && typeof r === 'object' && !!r.id);
    return recenses
      .filter((r) => !r.defuntStatut || r.defuntStatut === '')  // vivants seulement
      .map((r) => ({
        id: r.id,
        prenom: r.prenom || '',
        nom: r.nom || '',
        rang: r.rang || 'Inconnu',
        faction: r.faction || '',
        notes: r.notes,
      }));
  }, [recensesData]);

  // Map des paiements par ninjaId pour la semaine en cours
  const currentSemaine = currentWeek();
  const paiementsCurrentSemaine = useMemo(() => {
    const m = new Map<number, PaiementImpot>();
    for (const p of paiements) {
      if (p.semaine === currentSemaine) m.set(p.ninjaId, p);
    }
    return m;
  }, [paiements, currentSemaine]);

  // Barème par rang (map)
  const baremeByRang = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of grades) m.set(g.rang, g.montant);
    return m;
  }, [grades]);

  // Filtres + tri du registre
  const visibleRegistre = useMemo(() => {
    let list = contribuables;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((n) =>
        ((n.prenom || '') + ' ' + (n.nom || '') + ' ' + (n.rang || '') + ' ' + (n.faction || ''))
          .toLowerCase().includes(q)
      );
    }
    // Tri : impayés en premier, puis alphabétique
    return [...list].sort((a, b) => {
      const pa = paiementsCurrentSemaine.has(a.id) ? 1 : 0;
      const pb = paiementsCurrentSemaine.has(b.id) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return (a.nom || '').localeCompare(b.nom || '');
    });
  }, [contribuables, search, paiementsCurrentSemaine]);

  // Historique trié
  const visibleHistorique = useMemo(() => {
    let list = paiements;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        ((p.prenom || '') + ' ' + (p.nom || '') + ' ' + (p.semaine || '') + ' ' + (p.agent || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.date - a.date);
  }, [paiements, search]);

  // Stats
  const stats = useMemo(() => {
    const total = contribuables.length;
    const payes = contribuables.filter((c) => paiementsCurrentSemaine.has(c.id)).length;
    const impayes = total - payes;
    const collecteSemaine = Array.from(paiementsCurrentSemaine.values()).reduce((s, p) => s + p.montant, 0);
    return { total, payes, impayes, collecteSemaine };
  }, [contribuables, paiementsCurrentSemaine]);

  // ─── Handlers ───
  async function markPaid(n: NinjaImpot) {
    const montant = baremeByRang.get(n.rang || '') || 0;
    if (montant === 0) {
      toast.info(`${n.prenom} ${n.nom} est exempté (montant 0)`);
      return;
    }
    const ok = await confirmAction({
      title: 'Enregistrer le paiement',
      message: `Marquer ${n.prenom} ${n.nom} comme ayant payé ${fmtMoney(montant)} ₽ pour la semaine ${currentSemaine} ?`,
      confirmLabel: 'Confirmer',
    });
    if (!ok) return;
    try {
      const newPaiement: PaiementImpot = {
        id: Date.now(),
        ninjaId: n.id,
        prenom: n.prenom,
        nom: n.nom,
        montant,
        date: Date.now(),
        semaine: currentSemaine,
        agent: CURRENT_USER,
      };
      await dbSet(FB_PAIEMENTS, [...paiements, newPaiement]);
      toast.success(`Paiement enregistré : ${fmtMoney(montant)} ₽`);
    } catch {
      toast.error('Erreur');
    }
  }

  async function unmarkPaid(n: NinjaImpot) {
    const p = paiementsCurrentSemaine.get(n.id);
    if (!p) return;
    const ok = await confirmAction({
      title: 'Annuler le paiement ?',
      message: `Retirer le paiement de ${n.prenom} ${n.nom} pour la semaine ${currentSemaine} ?`,
      confirmLabel: 'Annuler le paiement', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PAIEMENTS, paiements.filter((x) => x.id !== p.id));
      toast.success('Paiement annulé');
    } catch {
      toast.error('Erreur');
    }
  }

  async function handleDeletePaiement(p: PaiementImpot) {
    const ok = await confirmAction({
      title: 'Supprimer le paiement',
      message: `Supprimer le paiement de ${p.prenom} ${p.nom} (${fmtMoney(p.montant)} ₽) ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PAIEMENTS, paiements.filter((x) => x.id !== p.id));
      toast.success('Supprimé');
    } catch { toast.error('Erreur'); }
  }

  function openBareme() {
    setBaremeForm([...grades]);
    setShowBareme(true);
  }

  async function saveBareme() {
    try {
      const filtered = baremeForm.filter((g) => g.rang.trim() !== '');
      await dbSet(FB_GRADES, filtered);
      toast.success('Barème enregistré');
      setShowBareme(false);
    } catch { toast.error('Erreur'); }
  }

  function addBaremeLine() {
    setBaremeForm([...baremeForm, { rang: '', montant: 0 }]);
  }
  function removeBaremeLine(idx: number) {
    setBaremeForm(baremeForm.filter((_, i) => i !== idx));
  }
  function updateBaremeLine(idx: number, field: 'rang' | 'montant', value: string | number) {
    const newForm = [...baremeForm];
    if (field === 'rang') newForm[idx].rang = String(value);
    else newForm[idx].montant = Number(value) || 0;
    setBaremeForm(newForm);
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Impôts"
        subtitle={`Registre fiscal — Semaine ${currentSemaine}`}
        actions={
          <Button variant="outline" onClick={openBareme}>
            <Settings size={14} /> Configurer le barème
          </Button>
        }
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Coins size={16} />
            <div className={styles.statVal}>{fmtMoney(stats.collecteSemaine)} ₽</div>
            <div className={styles.statLbl}>Collecte semaine</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGreen}`}>
            <CheckCircle2 size={16} />
            <div className={styles.statVal}>{stats.payes} / {stats.total}</div>
            <div className={styles.statLbl}>Contribuables à jour</div>
          </div>
          <div className={`${styles.statCard} ${styles.scDanger}`}>
            <AlertCircle size={16} />
            <div className={styles.statVal}>{stats.impayes}</div>
            <div className={styles.statLbl}>Restent à payer</div>
          </div>
          <div className={`${styles.statCard} ${styles.scBlue}`}>
            <Receipt size={16} />
            <div className={styles.statVal}>{paiements.length}</div>
            <div className={styles.statLbl}>Total paiements</div>
          </div>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'registre' ? styles.tabActive : ''}`} onClick={() => setTab('registre')}>
            Registre {currentSemaine}
          </button>
          <button className={`${styles.tab} ${tab === 'historique' ? styles.tabActive : ''}`} onClick={() => setTab('historique')}>
            Historique des paiements
          </button>
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text"
            placeholder={tab === 'registre' ? 'Nom, rang, faction…' : 'Nom, semaine, agent…'}
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === 'registre' && (
          visibleRegistre.length === 0 ? (
            <div className={styles.empty}>
              <Receipt size={32} style={{ opacity: 0.3 }} />
              <p>Aucun contribuable. Ajoute des recensés dans /recensement.</p>
            </div>
          ) : (
            <table className={styles.taxTable}>
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Nom</th>
                  <th>Rang</th>
                  <th style={{ textAlign: 'right' }}>Montant dû</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {visibleRegistre.map((n) => {
                  const montant = baremeByRang.get(n.rang || '') || 0;
                  const paye = paiementsCurrentSemaine.has(n.id);
                  return (
                    <tr key={n.id} className={paye ? styles.rowPaye : montant === 0 ? styles.rowExempte : styles.rowImpaye}>
                      <td>
                        {paye ? (
                          <span className={styles.statutPaye}>✓ Payé</span>
                        ) : montant === 0 ? (
                          <span className={styles.statutExempte}>Exempté</span>
                        ) : (
                          <span className={styles.statutImpaye}>⚠ Impayé</span>
                        )}
                      </td>
                      <td><strong>{n.prenom} {n.nom}</strong></td>
                      <td className={styles.muted}>{n.rang || '—'}</td>
                      <td className={styles.amount} style={{ textAlign: 'right' }}>
                        {fmtMoney(montant)} ₽
                      </td>
                      <td>
                        {!paye && montant > 0 ? (
                          <Button size="sm" onClick={() => markPaid(n)}>
                            <CheckCircle2 size={12} /> Marquer payé
                          </Button>
                        ) : paye ? (
                          <button className={styles.unmarkBtn} onClick={() => unmarkPaid(n)}>
                            Annuler
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === 'historique' && (
          visibleHistorique.length === 0 ? (
            <div className={styles.empty}>
              <Receipt size={32} style={{ opacity: 0.3 }} />
              <p>Aucun paiement enregistré.</p>
            </div>
          ) : (
            <table className={styles.taxTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Semaine</th>
                  <th>Contribuable</th>
                  <th>Agent</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                  <th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {visibleHistorique.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.mono}>{fmtDateFR(p.date)}</td>
                    <td className={styles.mono}>{p.semaine || '—'}</td>
                    <td><strong>{p.prenom} {p.nom}</strong></td>
                    <td className={styles.muted}>{p.agent || '—'}</td>
                    <td className={styles.amount} style={{ textAlign: 'right' }}>
                      +{fmtMoney(p.montant)} ₽
                    </td>
                    <td>
                      <button className={styles.deleteBtn} onClick={() => handleDeletePaiement(p)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>

      {/* Modale Barème */}
      <Modal
        open={showBareme}
        onClose={() => setShowBareme(false)}
        title="Configurer le barème fiscal"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowBareme(false)}>Annuler</Button>
            <Button onClick={saveBareme}><Save size={14} /> Enregistrer le barème</Button>
          </>
        }
      >
        <p className={styles.baremeHelp}>
          Définit le montant d&apos;impôt dû par rang. Un montant à <strong>0</strong> exempte
          ce rang d&apos;impôt (Kazekage, Apprenti, etc.).
        </p>

        <div className={styles.baremeTable}>
          <div className={styles.baremeHead}>
            <div>Rang</div>
            <div>Montant (₽)</div>
            <div></div>
          </div>
          {baremeForm.map((g, idx) => (
            <div key={idx} className={styles.baremeRow}>
              <input
                type="text"
                value={g.rang}
                onChange={(e) => updateBaremeLine(idx, 'rang', e.target.value)}
                placeholder="Ex: Genin"
                className={styles.baremeInput}
              />
              <input
                type="number"
                min="0"
                value={g.montant}
                onChange={(e) => updateBaremeLine(idx, 'montant', e.target.value)}
                className={styles.baremeInput}
              />
              <button
                className={styles.removeBaremeBtn}
                onClick={() => removeBaremeLine(idx)}
                aria-label="Retirer cette ligne"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button className={styles.addBaremeBtn} onClick={addBaremeLine}>
            <Plus size={12} /> Ajouter un rang
          </button>
        </div>
      </Modal>
    </>
  );
}
