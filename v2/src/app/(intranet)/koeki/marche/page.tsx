'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — MARCHÉ : Marketplace RP
 * ════════════════════════════════════════════════════════════════
 *  Workflow : ouverte → acceptée → rdv → cloturée (+ annulée)
 *  RDV : date + heure + lieu RP, modifiable après coup.
 *  Stockage Firebase : koeki/marche → DemandeMarche[]
 *
 *  🆕 Deux onglets :
 *    - Actives  : demandes en cours (ouverte/acceptée/rdv) + gestion
 *    - Archives : demandes clôturées/annulées + statistiques d'échanges
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Search, Store, Save, Handshake, CalendarClock,
  CheckCircle2, XCircle, MapPin, Clock, Archive, TrendingUp,
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
  genId, fmtMoney, fmtDateFR, fmtDateTimeFR,
} from '@/types/koeki';

import styles from './page.module.css';

const FB_MARCHE = 'koeki/marche';
type FilterStatut = 'actives' | 'all' | DemandeStatut;
type Tab = 'actives' | 'archives';

// Convertit un timestamp en valeur pour <input type="datetime-local">
function tsToInputValue(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function KoekiMarchePage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const CURRENT_USER_ID = u.id;
  const canGerer = u.can.koeki.gererMarche();

  const { data: marcheData, loading } = useFirebaseValue<DemandeMarche[] | null>(FB_MARCHE);

  const [tab, setTab] = useState<Tab>('actives');
  const [search, setSearch] = useState('');
  const [filterSens, setFilterSens] = useState<'all' | DemandeSens>('all');
  const [filterStatut, setFilterStatut] = useState<FilterStatut>('actives');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<DemandeMarche>>({ sens: 'vente' });

  // Modal RDV
  const [showRdv, setShowRdv] = useState(false);
  const [rdvDemande, setRdvDemande] = useState<DemandeMarche | null>(null);
  const [rdvDateInput, setRdvDateInput] = useState('');
  const [rdvLieuInput, setRdvLieuInput] = useState('');

  const demandes = useMemo<DemandeMarche[]>(() => {
    const list = Array.isArray(marcheData) ? marcheData : marcheData ? Object.values(marcheData) : [];
    return list.filter((d): d is DemandeMarche => d !== null && typeof d === 'object' && !!d.id);
  }, [marcheData]);

  // Est-ce une demande archivée ? (clôturée ou annulée)
  const isArchived = (d: DemandeMarche) => d.statut === 'cloturee' || d.statut === 'annulee';

  const visible = useMemo(() => {
    let list = demandes;

    if (tab === 'archives') {
      // Vue archives : uniquement clôturées + annulées
      list = list.filter(isArchived);
      if (filterStatut === 'cloturee' || filterStatut === 'annulee') {
        list = list.filter((d) => d.statut === filterStatut);
      }
    } else {
      // Vue actives : tout sauf archivées (avec sous-filtres existants)
      if (filterStatut === 'actives') list = list.filter((d) => !isArchived(d));
      else if (filterStatut !== 'all') list = list.filter((d) => d.statut === filterStatut);
      else list = list.filter((d) => !isArchived(d)); // 'all' en mode actives = actives quand même
    }

    if (filterSens !== 'all') list = list.filter((d) => d.sens === filterSens);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((d) =>
      ((d.objet || '') + ' ' + (d.auteurNom || '') + ' ' + (d.description || '')).toLowerCase().includes(q));

    // Archives triées par date de clôture (ou création) décroissante
    return [...list].sort((a, b) => (b.dateCloture ?? b.dateCreation) - (a.dateCloture ?? a.dateCreation));
  }, [demandes, tab, filterStatut, filterSens, search]);

  // Stats vue Actives
  const stats = useMemo(() => {
    const ouvertes = demandes.filter((d) => d.statut === 'ouverte').length;
    const enCours = demandes.filter((d) => d.statut === 'acceptee' || d.statut === 'rdv').length;
    const cloturees = demandes.filter((d) => d.statut === 'cloturee').length;
    return { ouvertes, enCours, cloturees };
  }, [demandes]);

  // 🆕 Stats vue Archives
  const archiveStats = useMemo(() => {
    const closed = demandes.filter((d) => d.statut === 'cloturee');
    const cancelled = demandes.filter((d) => d.statut === 'annulee');
    let totalVentes = 0;
    let totalAchats = 0;
    for (const d of closed) {
      if (typeof d.prix === 'number') {
        if (d.sens === 'vente') totalVentes += d.prix;
        else totalAchats += d.prix;
      }
    }
    return {
      cloturees: closed.length,
      annulees: cancelled.length,
      totalVentes,
      totalAchats,
      volume: totalVentes + totalAchats,
    };
  }, [demandes]);

  async function persist(next: DemandeMarche[]) { await dbSet(FB_MARCHE, next); }

  async function handleCreate() {
    if (!form.objet?.trim()) { toast.error("L'objet est obligatoire"); return; }
    if (!form.sens) { toast.error('Le sens est obligatoire'); return; }
    let prix: number | undefined;
    if (form.prix !== undefined && String(form.prix) !== '') {
      const n = Number(form.prix);
      if (isNaN(n) || n < 0) { toast.error('Le prix doit être positif (ou vide si négociable)'); return; }
      prix = n;
    }
    const demande: DemandeMarche = {
      id: genId('DM'), sens: form.sens as DemandeSens, objet: form.objet!.trim(),
      description: form.description?.trim() || undefined, prix,
      auteurId: CURRENT_USER_ID || '', auteurNom: CURRENT_USER,
      statut: 'ouverte', dateCreation: Date.now(),
    };
    try {
      await persist([...demandes, demande]);
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'create', target: 'koeki:marche', targetId: demande.id,
        detail: `Kōeki — Demande marché créée : [${DEMANDE_SENS_LABEL[demande.sens]}] "${demande.objet}"` + (prix !== undefined ? ` (${fmtMoney(prix)} ₽)` : ' (négociable)'),
      });
      toast.success('Demande publiée');
      setShowForm(false); setForm({ sens: 'vente' });
    } catch { toast.error('Erreur'); }
  }

  async function changeStatut(d: DemandeMarche, nouveau: DemandeStatut) {
    try {
      const updated: DemandeMarche = { ...d, statut: nouveau };
      if (nouveau === 'acceptee' && !d.ninjaAcceptanteId) {
        updated.ninjaAcceptanteId = CURRENT_USER_ID || '';
        updated.ninjaAcceptanteNom = CURRENT_USER;
      }
      if (nouveau === 'cloturee') updated.dateCloture = Date.now();
      await persist(demandes.map((x) => (x.id === d.id ? updated : x)));
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'update', target: 'koeki:marche', targetId: d.id,
        detail: `Kōeki — Demande "${d.objet}" : statut ${DEMANDE_STATUT_LABEL[d.statut]} → ${DEMANDE_STATUT_LABEL[nouveau]}` + (nouveau === 'acceptee' ? ` (prise en charge par ${CURRENT_USER})` : ''),
      });
      toast.success(`Statut : ${DEMANDE_STATUT_LABEL[nouveau]}`);
    } catch { toast.error('Erreur'); }
  }

  // ─── RDV ───
  function openRdv(d: DemandeMarche) {
    setRdvDemande(d);
    setRdvDateInput(tsToInputValue(d.rdvDate));
    setRdvLieuInput(d.rdvLieu || '');
    setShowRdv(true);
  }
  async function handleSaveRdv() {
    if (!rdvDemande) return;
    if (!rdvDateInput) { toast.error('La date du RDV est obligatoire'); return; }
    const ts = new Date(rdvDateInput).getTime();
    if (isNaN(ts)) { toast.error('Date invalide'); return; }
    try {
      const updated: DemandeMarche = {
        ...rdvDemande,
        statut: 'rdv',
        rdvDate: ts,
        rdvLieu: rdvLieuInput.trim() || undefined,
      };
      await persist(demandes.map((x) => (x.id === rdvDemande.id ? updated : x)));
      logAction({
        who: CURRENT_USER, whoId: CURRENT_USER_ID,
        action: 'update', target: 'koeki:marche', targetId: rdvDemande.id,
        detail: `Kōeki — RDV fixé pour "${rdvDemande.objet}" : ${fmtDateTimeFR(ts)}` + (rdvLieuInput.trim() ? ` au ${rdvLieuInput.trim()}` : ''),
      });
      toast.success('RDV enregistré');
      setShowRdv(false); setRdvDemande(null);
    } catch { toast.error('Erreur'); }
  }

  async function handleDelete(d: DemandeMarche) {
    const ok = await confirmAction({ title: 'Supprimer la demande', message: `Supprimer la demande "${d.objet}" ?`, confirmLabel: 'Supprimer', variant: 'danger' });
    if (!ok) return;
    try {
      await persist(demandes.filter((x) => x.id !== d.id));
      logAction({ who: CURRENT_USER, whoId: CURRENT_USER_ID, action: 'delete', target: 'koeki:marche', targetId: d.id, detail: `Kōeki — Demande marché supprimée : "${d.objet}"` });
      toast.success('Demande supprimée');
    } catch { toast.error('Erreur'); }
  }

  function switchTab(next: Tab) {
    setTab(next);
    // Réinitialise le filtre statut selon l'onglet
    setFilterStatut(next === 'archives' ? 'all' : 'actives');
  }

  return (
    <>
      <Card title="🏯 Kōeki — Marché" subtitle="Demandes de vente et d'achat (RP)"
        actions={<Button onClick={() => { setForm({ sens: 'vente' }); setShowForm(true); }}><Plus size={14} /> Nouvelle demande</Button>}
      >
        {/* ─── Onglets ─── */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'actives' ? styles.tabActive : ''}`}
            onClick={() => switchTab('actives')}
          >
            <Store size={14} /> Actives
          </button>
          <button
            className={`${styles.tab} ${tab === 'archives' ? styles.tabActive : ''}`}
            onClick={() => switchTab('archives')}
          >
            <Archive size={14} /> Archives
          </button>
        </div>

        {/* ─── Stats : selon l'onglet ─── */}
        {tab === 'actives' ? (
          <div className={styles.statRow}>
            <div className={`${styles.statCard} ${styles.scGold}`}><Store size={16} /><div className={styles.statVal}>{stats.ouvertes}</div><div className={styles.statLbl}>Ouvertes</div></div>
            <div className={`${styles.statCard} ${styles.scBlue}`}><Handshake size={16} /><div className={styles.statVal}>{stats.enCours}</div><div className={styles.statLbl}>En cours</div></div>
            <div className={`${styles.statCard} ${styles.scGold}`}><CheckCircle2 size={16} /><div className={styles.statVal}>{stats.cloturees}</div><div className={styles.statLbl}>Clôturées</div></div>
          </div>
        ) : (
          <div className={styles.statRow}>
            <div className={`${styles.statCard} ${styles.scGreen}`}><CheckCircle2 size={16} /><div className={styles.statVal}>{archiveStats.cloturees}</div><div className={styles.statLbl}>Clôturées</div></div>
            <div className={`${styles.statCard} ${styles.scRed}`}><XCircle size={16} /><div className={styles.statVal}>{archiveStats.annulees}</div><div className={styles.statLbl}>Annulées</div></div>
            <div className={`${styles.statCard} ${styles.scGreen}`}><TrendingUp size={16} /><div className={styles.statVal}>{fmtMoney(archiveStats.totalVentes)} ₽</div><div className={styles.statLbl}>Total ventes</div></div>
            <div className={`${styles.statCard} ${styles.scBlue}`}><TrendingUp size={16} /><div className={styles.statVal}>{fmtMoney(archiveStats.totalAchats)} ₽</div><div className={styles.statLbl}>Total achats</div></div>
            <div className={`${styles.statCard} ${styles.scGold}`}><Store size={16} /><div className={styles.statVal}>{fmtMoney(archiveStats.volume)} ₽</div><div className={styles.statLbl}>Volume échangé</div></div>
          </div>
        )}

        <div className={styles.toolbar}>
          <div className={styles.searchBox}><Search size={14} /><input type="text" placeholder="Objet, auteur…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className={styles.filterSelect} value={filterSens} onChange={(e) => setFilterSens(e.target.value as 'all' | DemandeSens)}>
            <option value="all">Vente & Achat</option><option value="vente">Ventes</option><option value="achat">Achats</option>
          </select>
          {tab === 'actives' ? (
            <select className={styles.filterSelect} value={filterStatut} onChange={(e) => setFilterStatut(e.target.value as FilterStatut)}>
              <option value="actives">Toutes actives</option><option value="ouverte">Ouvertes</option><option value="acceptee">Acceptées</option>
              <option value="rdv">RDV fixé</option>
            </select>
          ) : (
            <select className={styles.filterSelect} value={filterStatut} onChange={(e) => setFilterStatut(e.target.value as FilterStatut)}>
              <option value="all">Clôturées & Annulées</option><option value="cloturee">Clôturées</option><option value="annulee">Annulées</option>
            </select>
          )}
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
        : visible.length === 0 ? (
          <div className={styles.empty}>
            {tab === 'archives' ? <Archive size={32} style={{ opacity: 0.3 }} /> : <Store size={32} style={{ opacity: 0.3 }} />}
            <p>{tab === 'archives'
              ? 'Aucune demande archivée pour ces critères.'
              : (demandes.length === 0 ? 'Aucune demande sur le marché. Publie la première !' : 'Aucune demande active pour ces critères.')}</p>
          </div>
        ) : (
          <div className={styles.cardsGrid}>
            {visible.map((d) => (
              <div key={d.id} className={`${styles.demandeCard} ${styles['st_' + d.statut]}`}>
                <div className={styles.demandeHead}>
                  <span className={`${styles.sensBadge} ${d.sens === 'vente' ? styles.sensVente : styles.sensAchat}`}>{DEMANDE_SENS_LABEL[d.sens]}</span>
                  <span className={`${styles.statutBadge} ${styles['badge_' + d.statut]}`}>{DEMANDE_STATUT_LABEL[d.statut]}</span>
                </div>
                <div className={styles.demandeObjet}>{d.objet}</div>
                {d.description && <div className={styles.demandeDesc}>{d.description}</div>}
                <div className={styles.demandeMeta}>
                  <span className={styles.demandePrix}>{d.prix !== undefined ? `${fmtMoney(d.prix)} ₽` : 'Négociable'}</span>
                  <span className={styles.demandeAuteur}>par {d.auteurNom || '—'}</span>
                </div>
                {d.ninjaAcceptanteNom && <div className={styles.priseEnCharge}>🤝 Pris en charge par {d.ninjaAcceptanteNom}</div>}
                {d.rdvDate && (
                  <div className={styles.rdvBox}>
                    <div className={styles.rdvLine}><Clock size={12} /> {fmtDateTimeFR(d.rdvDate)}</div>
                    {d.rdvLieu && <div className={styles.rdvLine}><MapPin size={12} /> {d.rdvLieu}</div>}
                  </div>
                )}
                <div className={styles.demandeFooter}>
                  <span className={styles.demandeDate}>
                    {tab === 'archives' && d.dateCloture
                      ? `Clôturée le ${fmtDateFR(d.dateCloture)}`
                      : fmtDateFR(d.dateCreation)}
                  </span>
                  {canGerer && (
                    <div className={styles.demandeActions}>
                      {d.statut === 'ouverte' && <Button size="sm" onClick={() => changeStatut(d, 'acceptee')}><Handshake size={12} /> Prendre en charge</Button>}
                      {d.statut === 'acceptee' && <Button size="sm" onClick={() => openRdv(d)}><CalendarClock size={12} /> Fixer un RDV</Button>}
                      {d.statut === 'rdv' && <Button size="sm" variant="outline" onClick={() => openRdv(d)}><CalendarClock size={12} /> Modifier le RDV</Button>}
                      {d.statut === 'rdv' && <Button size="sm" onClick={() => changeStatut(d, 'cloturee')}><CheckCircle2 size={12} /> Clôturer</Button>}
                      {d.statut !== 'cloturee' && d.statut !== 'annulee' && <button className={styles.iconBtn} onClick={() => changeStatut(d, 'annulee')} aria-label="Annuler" title="Annuler la demande"><XCircle size={14} /></button>}
                      <button className={styles.deleteBtn} onClick={() => handleDelete(d)} aria-label="Supprimer"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal nouvelle demande */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nouvelle demande" size="md"
        footer={<><Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button><Button onClick={handleCreate}><Save size={14} /> Publier</Button></>}>
        <div className={styles.formFields}>
          <label>Type *
            <select value={form.sens ?? 'vente'} onChange={(e) => setForm({ ...form, sens: e.target.value as DemandeSens })}>
              <option value="vente">Je vends</option><option value="achat">Je recherche</option>
            </select>
          </label>
          <label>Objet *<input type="text" value={form.objet ?? ''} autoFocus onChange={(e) => setForm({ ...form, objet: e.target.value })} placeholder="Ex: Lot de parchemins scellés" /></label>
          <label>Description<textarea rows={3} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Détails, état, conditions… (optionnel)" /></label>
          <label>Prix (₽)<input type="number" min="0" step="1" value={form.prix ?? ''} onChange={(e) => setForm({ ...form, prix: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Vide = négociable" /></label>
        </div>
      </Modal>

      {/* Modal RDV */}
      <Modal open={showRdv} onClose={() => setShowRdv(false)} title={rdvDemande ? `RDV — ${rdvDemande.objet}` : 'Fixer un RDV'} size="md"
        footer={<><Button variant="outline" onClick={() => setShowRdv(false)}>Annuler</Button><Button onClick={handleSaveRdv}><Save size={14} /> Enregistrer le RDV</Button></>}>
        <div className={styles.formFields}>
          <label>Date et heure *<input type="datetime-local" value={rdvDateInput} autoFocus onChange={(e) => setRdvDateInput(e.target.value)} /></label>
          <label>Lieu RP<input type="text" value={rdvLieuInput} onChange={(e) => setRdvLieuInput(e.target.value)} placeholder="Ex: Marché central, QG Kōeki…" /></label>
          <p className={styles.help}>Fixer un RDV fait passer la demande au statut « RDV fixé ». Tu peux le modifier ensuite tant que la demande n'est pas clôturée.</p>
        </div>
      </Modal>
    </>
  );
}
