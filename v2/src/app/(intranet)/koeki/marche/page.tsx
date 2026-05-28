'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — MARCHÉ : Marketplace RP
 * ════════════════════════════════════════════════════════════════
 *
 * - N'importe quel utilisateur connecté peut POSTER une demande
 *   (vente ou achat).
 * - Les membres Kōeki (canGererMarche) PRENNENT EN CHARGE et font
 *   avancer le statut : ouverte → acceptée → rdv → cloturée (ou annulée).
 *
 * Workflow :
 *   ouverte   : nouvelle demande, personne ne l'a prise
 *   acceptée  : un Kōeki l'a prise en charge
 *   rdv       : rendez-vous RP fixé
 *   cloturée  : transaction terminée
 *   annulée   : abandonnée
 *
 * 📜 Audit : koeki:marche (create / statut / delete)
 *
 * Stockage Firebase : koeki/marche → DemandeMarche[]
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Search, Store, Save, Handshake, CalendarClock,
  CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type DemandeMarche, type DemandeSens, type DemandeStatut,
  DEMANDE_SENS_LABEL, DEMANDE_STATUT_LABEL,
  genId, fmtMoney, fmtDateFR,
} from '@/types/koeki';

import styles from './page.module.css';

const FB_MARCHE = 'koeki/marche';

type FilterStatut = 'actives' | 'all' | DemandeStatut;

export default function KoekiMarchePage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const CURRENT_USER_ID = u.id;
  const canGerer = u.can.koeki.gererMarche();

  const { data: marcheData, loading } = useFirebaseValue<DemandeMarche[] | null>(FB_MARCHE);

  const [search, setSearch] = useState('');
  const [filterSens, setFilterSens] = useState<'all' | DemandeSens>('all');
  const [filterStatut, setFilterStatut] = useState<FilterStatut>('actives');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<DemandeMarche>>({ sens: 'vente' });

  const demandes = useMemo<DemandeMarche[]>(() => {
    const list = Array.isArray(marcheData) ? marcheData : marcheData ? Object.values(marcheData) : [];
    return list.filter((d): d is DemandeMarche => d !== null && typeof d === 'object' && !!d.id);
  }, [marcheData]);

  const visible = useMemo(() => {
    let list = demandes;
    if (filterStatut === 'actives') list = list.filter((d) => d.statut !== 'cloturee' && d.statut !== 'annulee');
    else if (filterStatut !== 'all') list = list.filter((d) => d.statut === filterStatut);
    if (filterSens !== 'all') list = list.filter((d) => d.sens === filterSens);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) =>
      ((d.objet || '') + ' ' + (d.auteurNom || '') + ' ' + (d.description || '')).toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => b.dateCreation - a.dateCreation);
  }, [demandes, filterStatut, filterSens, search]);

  const stats = useMemo(() => {
    const ouvertes = demandes.filter((d) => d.statut === 'ouverte').length;
    const enCours = demandes.filter((d) => d.statut === 'acceptee' || d.statut === 'rdv').length;
    const cloturees = demandes.filter((d) => d.statut === 'cloturee').length;
    return { ouvertes, enCours, cloturees };
  }, [demandes]);

  async function persist(next: DemandeMarche[]) {
    await dbSet(FB_MARCHE, next);
  }

  // ─── Création d'une demande ───────────────────────────────────
  async function handleCreate() {
    if (!form.objet?.trim()) { toast.error('L\'objet est obligatoire'); return; }
    if (!form.sens) { toast.error('Le sens est obligatoire'); return; }

    let prix: number | undefined;
    if (form.prix !== undefined && String(form.prix) !== '') {
      const n = Number(form.prix);
      if (isNaN(n) || n < 0) { toast.error('Le prix doit être positif (ou vide si négociable)'); return; }
      prix = n;
    }

    const demande: DemandeMarche = {
      id: genId('DM'),
      sens: form.sens as DemandeSens,
      objet: form.objet!.trim(),
      description: form.description?.trim() || undefined,
      prix,
      auteurId: CURRENT_USER_ID || '',
      auteurNom: CURRENT_USER,
      statut: 'ouverte',
      dateCreation: Date.now(),
    };

    try {
      await persist([...demandes, demande]);
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'create', target: 'koeki:marche', targetId: demande.id,
        detail: `Kōeki — Demande marché créée : [${DEMANDE_SENS_LABEL[demande.sens]}] "${demande.objet}"` +
          (prix !== undefined ? ` (${fmtMoney(prix)} ₽)` : ' (négociable)'),
      });
      toast.success('Demande publiée');
      setShowForm(false);
      setForm({ sens: 'vente' });
    } catch { toast.error('Erreur'); }
  }

  // ─── Changement de statut (Kōeki) ─────────────────────────────
  async function changeStatut(d: DemandeMarche, nouveau: DemandeStatut) {
    try {
      const updated: DemandeMarche = { ...d, statut: nouveau };
      // Prise en charge : on enregistre le Kōeki responsable
      if (nouveau === 'acceptee' && !d.ninjaAcceptanteId) {
        updated.ninjaAcceptanteId = CURRENT_USER_ID || '';
        updated.ninjaAcceptanteNom = CURRENT_USER;
      }
      if (nouveau === 'cloturee') updated.dateCloture = Date.now();

      await persist(demandes.map((x) => (x.id === d.id ? updated : x)));
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'update', target: 'koeki:marche', targetId: d.id,
        detail: `Kōeki — Demande "${d.objet}" : statut ${DEMANDE_STATUT_LABEL[d.statut]} → ${DEMANDE_STATUT_LABEL[nouveau]}` +
          (nouveau === 'acceptee' ? ` (prise en charge par ${CURRENT_USER})` : ''),
      });
      toast.success(`Statut : ${DEMANDE_STATUT_LABEL[nouveau]}`);
    } catch { toast.error('Erreur'); }
  }

  async function handleDelete(d: DemandeMarche) {
    const ok = await confirmAction({
      title: 'Supprimer la demande',
      message: `Supprimer la demande "${d.objet}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await persist(demandes.filter((x) => x.id !== d.id));
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'delete', target: 'koeki:marche', targetId: d.id,
        detail: `Kōeki — Demande marché supprimée : "${d.objet}"`,
      });
      toast.success('Demande supprimée');
    } catch { toast.error('Erreur'); }
  }

  // Actions de workflow disponibles selon le statut courant
  function nextActions(d: DemandeMarche): { label: string; statut: DemandeStatut; icon: React.ReactNode }[] {
    switch (d.statut) {
      case 'ouverte':
        return [{ label: 'Prendre en charge', statut: 'acceptee', icon: <Handshake size={12} /> }];
      case 'acceptee':
        return [{ label: 'Fixer un RDV', statut: 'rdv', icon: <CalendarClock size={12} /> }];
      case 'rdv':
        return [{ label: 'Clôturer', statut: 'cloturee', icon: <CheckCircle2 size={12} /> }];
      default:
        return [];
    }
  }

  return (
    <>
      <Card
        title="🏯 Kōeki — Marché"
        subtitle="Demandes de vente et d'achat (RP)"
        actions={
          <Button onClick={() => { setForm({ sens: 'vente' }); setShowForm(true); }}>
            <Plus size={14} /> Nouvelle demande
          </Button>
        }
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Store size={16} />
            <div className={styles.statVal}>{stats.ouvertes}</div>
            <div className={styles.statLbl}>Ouvertes</div>
          </div>
          <div className={`${styles.statCard} ${styles.scBlue}`}>
            <Handshake size={16} />
            <div className={styles.statVal}>{stats.enCours}</div>
            <div className={styles.statLbl}>En cours</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <CheckCircle2 size={16} />
            <div className={styles.statVal}>{stats.cloturees}</div>
            <div className={styles.statLbl}>Clôturées</div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Objet, auteur…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={styles.filterSelect} value={filterSens}
            onChange={(e) => setFilterSens(e.target.value as 'all' | DemandeSens)}>
            <option value="all">Vente & Achat</option>
            <option value="vente">Ventes</option>
            <option value="achat">Achats</option>
          </select>
          <select className={styles.filterSelect} value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value as FilterStatut)}>
            <option value="actives">Actives</option>
            <option value="ouverte">Ouvertes</option>
            <option value="acceptee">Acceptées</option>
            <option value="rdv">RDV fixé</option>
            <option value="cloturee">Clôturées</option>
            <option value="annulee">Annulées</option>
            <option value="all">Toutes</option>
          </select>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Store size={32} style={{ opacity: 0.3 }} />
            <p>{demandes.length === 0 ? 'Aucune demande sur le marché. Publie la première !' : 'Aucune demande pour ces critères.'}</p>
          </div>
        ) : (
          <div className={styles.cardsGrid}>
            {visible.map((d) => (
              <div key={d.id} className={`${styles.demandeCard} ${styles['st_' + d.statut]}`}>
                <div className={styles.demandeHead}>
                  <span className={`${styles.sensBadge} ${d.sens === 'vente' ? styles.sensVente : styles.sensAchat}`}>
                    {DEMANDE_SENS_LABEL[d.sens]}
                  </span>
                  <span className={`${styles.statutBadge} ${styles['badge_' + d.statut]}`}>
                    {DEMANDE_STATUT_LABEL[d.statut]}
                  </span>
                </div>

                <div className={styles.demandeObjet}>{d.objet}</div>
                {d.description && <div className={styles.demandeDesc}>{d.description}</div>}

                <div className={styles.demandeMeta}>
                  <span className={styles.demandePrix}>
                    {d.prix !== undefined ? `${fmtMoney(d.prix)} ₽` : 'Négociable'}
                  </span>
                  <span className={styles.demandeAuteur}>par {d.auteurNom || '—'}</span>
                </div>

                {d.ninjaAcceptanteNom && (
                  <div className={styles.priseEnCharge}>
                    🤝 Pris en charge par {d.ninjaAcceptanteNom}
                  </div>
                )}

                <div className={styles.demandeFooter}>
                  <span className={styles.demandeDate}>{fmtDateFR(d.dateCreation)}</span>
                  {canGerer && (
                    <div className={styles.demandeActions}>
                      {nextActions(d).map((a) => (
                        <Button key={a.statut} size="sm" onClick={() => changeStatut(d, a.statut)}>
                          {a.icon} {a.label}
                        </Button>
                      ))}
                      {d.statut !== 'cloturee' && d.statut !== 'annulee' && (
                        <button className={styles.iconBtn} onClick={() => changeStatut(d, 'annulee')} aria-label="Annuler" title="Annuler la demande">
                          <XCircle size={14} />
                        </button>
                      )}
                      <button className={styles.deleteBtn} onClick={() => handleDelete(d)} aria-label="Supprimer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal nouvelle demande */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title="Nouvelle demande" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleCreate}><Save size={14} /> Publier</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Type *
            <select value={form.sens ?? 'vente'}
              onChange={(e) => setForm({ ...form, sens: e.target.value as DemandeSens })}>
              <option value="vente">Je vends</option>
              <option value="achat">Je recherche</option>
            </select>
          </label>
          <label>Objet *
            <input type="text" value={form.objet ?? ''} autoFocus
              onChange={(e) => setForm({ ...form, objet: e.target.value })}
              placeholder="Ex: Lot de parchemins scellés" />
          </label>
          <label>Description
            <textarea rows={3} value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Détails, état, conditions… (optionnel)" />
          </label>
          <label>Prix (₽)
            <input type="number" min="0" step="1" value={form.prix ?? ''}
              onChange={(e) => setForm({ ...form, prix: e.target.value === '' ? undefined : Number(e.target.value) })}
              placeholder="Vide = négociable" />
          </label>
        </div>
      </Modal>
    </>
  );
}
