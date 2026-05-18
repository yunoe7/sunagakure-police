'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page MISSIONS — Tableau de répartition des missions
 * ════════════════════════════════════════════════════════════════
 *
 * Page unique avec 3 onglets internes :
 *   - Disponibles (statut === 'ouverte')
 *   - Actives (statut === 'en_cours')
 *   - Archives (terminee | echouee | annulee)
 *
 * Stockage Firebase : sunagakure/missions (TABLEAU, format legacy)
 *
 * Actions disponibles selon le statut :
 *   - Disponibles : Accepter (devient en_cours pour l'utilisateur)
 *   - Actives : Marquer terminée / Échouée / Abandonner
 *   - Toutes : Édition, Suppression (admin)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Search,
  Target,
  Swords,
  Archive,
  MapPin,
  Calendar,
  Coins,
  Users,
  CheckCircle2,
  XCircle,
  Play,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Mission,
  type MissionRang,
  type MissionStatut,
  type MissionType,
  MISSION_TYPES,
  MISSION_RANGS,
  MS_REWARD_BY_RANK,
  MISSION_STATUT_LABEL,
  fmtMoney,
  fmtDateFR,
} from '@/types/mission';

import styles from './page.module.css';

const FB_PATH = 'missions';
const CURRENT_USER = 'Ninja'; // TODO : utiliser le vrai user connecté plus tard

type Tab = 'dispo' | 'actives' | 'archives';

export default function MissionsPage() {
  const { data, loading } = useFirebaseValue<Mission[] | null>(FB_PATH);

  const [tab, setTab] = useState<Tab>('dispo');
  const [search, setSearch] = useState('');
  const [rangFilter, setRangFilter] = useState<'all' | MissionRang>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Mission>>({});

  // ─── Normalisation + filtrage ───
  const allMissions = useMemo<Mission[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (m): m is Mission => m !== null && typeof m === 'object' && !!m.id
    );
  }, [data]);

  // Compteurs pour les onglets
  const counts = useMemo(() => {
    let dispo = 0;
    let actives = 0;
    let archives = 0;
    for (const m of allMissions) {
      if (m.statut === 'ouverte') dispo++;
      else if (m.statut === 'en_cours') actives++;
      else archives++;
    }
    return { dispo, actives, archives };
  }, [allMissions]);

  // Missions affichées selon l'onglet
  const visibleMissions = useMemo(() => {
    let list = allMissions.filter((m) => {
      if (tab === 'dispo') return m.statut === 'ouverte';
      if (tab === 'actives') return m.statut === 'en_cours';
      return ['terminee', 'echouee', 'annulee'].includes(m.statut);
    });

    if (rangFilter !== 'all') {
      list = list.filter((m) => m.rang === rangFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const s = (
          (m.titre || '') +
          ' ' +
          (m.desc || '') +
          ' ' +
          (m.type || '') +
          ' ' +
          (m.lieu || '')
        ).toLowerCase();
        return s.includes(q);
      });
    }

    // Tri : disponibles → plus récentes en premier, actives → plus anciennes en premier (urgence)
    list.sort((a, b) => {
      if (tab === 'actives') return (a.creeLe ?? a.id) - (b.creeLe ?? b.id);
      return (b.creeLe ?? b.id) - (a.creeLe ?? a.id);
    });

    return list;
  }, [allMissions, tab, rangFilter, search]);

  // ─── Helpers d'écriture ───
  async function persistAll(missions: Mission[]) {
    await dbSet(FB_PATH, missions);
  }

  function getCurrentList(): Mission[] {
    return allMissions.map((m) => ({ ...m }));
  }

  // ─── Handlers CRUD ───
  function openCreate() {
    setEditingId(null);
    setForm({
      rang: 'D',
      type: 'Autre',
      statut: 'ouverte',
      recompense: MS_REWARD_BY_RANK.D,
    });
    setShowForm(true);
  }

  function openEdit(m: Mission) {
    setEditingId(m.id);
    setForm(m);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  }

  async function handleSave() {
    if (!form.titre?.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }
    if (!form.rang) {
      toast.error('Le rang est obligatoire');
      return;
    }

    try {
      const list = getCurrentList();
      const now = Date.now();

      if (editingId) {
        const idx = list.findIndex((m) => m.id === editingId);
        if (idx === -1) throw new Error('Mission introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Mission;
        await persistAll(list);
        toast.success('Mission mise à jour');
      } else {
        const newMission: Mission = {
          id: now,
          titre: form.titre!.trim(),
          desc: form.desc?.trim() || undefined,
          rang: form.rang as MissionRang,
          type: form.type || 'Autre',
          recompense: form.recompense ?? MS_REWARD_BY_RANK[form.rang as MissionRang],
          statut: 'ouverte',
          lieu: form.lieu?.trim() || undefined,
          deadline: form.deadline || undefined,
          creePar: CURRENT_USER,
          creeLe: now,
          assignes: [],
        };
        list.push(newMission);
        await persistAll(list);
        toast.success('Mission publiée');
      }
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(m: Mission) {
    const ok = await confirmAction({
      title: 'Supprimer la mission',
      message: `Supprimer "${m.titre}" ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const list = getCurrentList().filter((x) => x.id !== m.id);
      await persistAll(list);
      toast.success('Mission supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  // ─── Actions de workflow ───

  /** Disponible → En cours : on s'auto-assigne et change le statut */
  async function handleAccept(m: Mission) {
    try {
      const list = getCurrentList();
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx === -1) return;
      const now = Date.now();
      list[idx] = {
        ...list[idx],
        statut: 'en_cours',
        assignes: [
          ...(list[idx].assignes || []),
          { nom: CURRENT_USER, acceptedAt: now },
        ],
      };
      await persistAll(list);
      toast.success('Mission acceptée — bonne chasse !');
    } catch {
      toast.error('Erreur');
    }
  }

  /** En cours → Terminée */
  async function handleComplete(m: Mission) {
    const ok = await confirmAction({
      title: 'Marquer la mission terminée',
      message: `Confirmer que la mission "${m.titre}" est accomplie ?`,
      confirmLabel: 'Confirmer',
    });
    if (!ok) return;
    try {
      const list = getCurrentList();
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx === -1) return;
      const now = Date.now();
      list[idx] = {
        ...list[idx],
        statut: 'terminee',
        terminePar: CURRENT_USER,
        termineLe: now,
      };
      await persistAll(list);
      toast.success('Mission terminée !');
    } catch {
      toast.error('Erreur');
    }
  }

  /** En cours → Échouée */
  async function handleFail(m: Mission) {
    const ok = await confirmAction({
      title: 'Mission échouée',
      message: `Marquer la mission "${m.titre}" comme échouée ?`,
      confirmLabel: 'Confirmer l\'échec',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const list = getCurrentList();
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], statut: 'echouee', termineLe: Date.now() };
      await persistAll(list);
      toast.success('Mission marquée échouée');
    } catch {
      toast.error('Erreur');
    }
  }

  /** En cours → Annulée (abandon) */
  async function handleAbandon(m: Mission) {
    const ok = await confirmAction({
      title: 'Abandonner la mission',
      message: `Abandonner "${m.titre}" ? Elle sera retirée des missions actives.`,
      confirmLabel: 'Abandonner',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const list = getCurrentList();
      const idx = list.findIndex((x) => x.id === m.id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], statut: 'annulee', termineLe: Date.now() };
      await persistAll(list);
      toast.success('Mission abandonnée');
    } catch {
      toast.error('Erreur');
    }
  }

  // ─── Suggestion automatique de récompense quand on change de rang ───
  function handleRangChange(newRang: MissionRang) {
    const suggested = MS_REWARD_BY_RANK[newRang];
    setForm({
      ...form,
      rang: newRang,
      // Ne remplace que si l'utilisateur n'a pas saisi de récompense custom
      recompense:
        form.recompense === undefined ||
        form.recompense === MS_REWARD_BY_RANK[form.rang as MissionRang]
          ? suggested
          : form.recompense,
    });
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Missions"
        subtitle="Tableau de répartition officiel"
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> Nouvelle mission
          </Button>
        }
      >
        {/* Onglets */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'dispo' ? styles.tabActive : ''}`}
            onClick={() => setTab('dispo')}
          >
            <Target size={14} />
            <span>Disponibles</span>
            <span className={styles.tabCount}>{counts.dispo}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'actives' ? styles.tabActive : ''}`}
            onClick={() => setTab('actives')}
          >
            <Swords size={14} />
            <span>Actives</span>
            <span className={styles.tabCount}>{counts.actives}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'archives' ? styles.tabActive : ''}`}
            onClick={() => setTab('archives')}
          >
            <Archive size={14} />
            <span>Archives</span>
            <span className={styles.tabCount}>{counts.archives}</span>
          </button>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.filters}>
            <button
              className={`${styles.fbtn} ${rangFilter === 'all' ? styles.fbtnOn : ''}`}
              onClick={() => setRangFilter('all')}
            >
              Tous rangs
            </button>
            {MISSION_RANGS.map((r) => (
              <button
                key={r}
                className={`${styles.fbtn} ${styles[`rang-${r}`]} ${rangFilter === r ? styles.fbtnOn : ''}`}
                onClick={() => setRangFilter(r)}
              >
                Rang {r}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visibleMissions.length === 0 ? (
          <div className={styles.empty}>
            {tab === 'dispo' && <Target size={32} style={{ opacity: 0.3 }} />}
            {tab === 'actives' && <Swords size={32} style={{ opacity: 0.3 }} />}
            {tab === 'archives' && <Archive size={32} style={{ opacity: 0.3 }} />}
            <p>
              {search || rangFilter !== 'all'
                ? 'Aucune mission pour ces critères.'
                : tab === 'dispo'
                  ? 'Aucune mission disponible. Crées-en une !'
                  : tab === 'actives'
                    ? 'Aucune mission en cours.'
                    : 'Aucune mission archivée.'}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleMissions.map((m) => (
              <article
                key={m.id}
                className={`${styles.mission} ${styles[`rb-${m.rang}`]} ${styles[`st-${m.statut}`]}`}
              >
                {/* Header : rang + statut */}
                <header className={styles.missionHeader}>
                  <span className={`${styles.rangBadge} ${styles[`rang-${m.rang}`]}`}>
                    {m.rang}
                  </span>
                  {m.type && <span className={styles.typeChip}>{m.type}</span>}
                  <span className={styles.statutChip}>
                    {m.statut === 'terminee' && <CheckCircle2 size={11} />}
                    {m.statut === 'echouee' && <XCircle size={11} />}
                    {m.statut === 'annulee' && <XCircle size={11} />}
                    {m.statut === 'en_cours' && <Swords size={11} />}
                    {m.statut === 'ouverte' && <Target size={11} />}
                    {MISSION_STATUT_LABEL[m.statut]}
                  </span>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(m)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </header>

                {/* Corps cliquable pour éditer */}
                <div className={styles.body} onClick={() => openEdit(m)}>
                  <h3 className={styles.title}>{m.titre}</h3>
                  {m.desc && <p className={styles.desc}>{m.desc}</p>}

                  <div className={styles.meta}>
                    {m.lieu && (
                      <span>
                        <MapPin size={11} /> {m.lieu}
                      </span>
                    )}
                    {m.deadline && (
                      <span>
                        <Calendar size={11} /> {fmtDateFR(m.deadline)}
                      </span>
                    )}
                    {m.assignes && m.assignes.length > 0 && (
                      <span>
                        <Users size={11} /> {m.assignes.map((a) => a.nom).join(', ')}
                      </span>
                    )}
                  </div>

                  {typeof m.recompense === 'number' && m.recompense > 0 && (
                    <div className={styles.reward}>
                      <Coins size={13} />
                      <span className={styles.rewardValue}>
                        {fmtMoney(m.recompense)} ₽
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions selon statut */}
                <footer className={styles.actions}>
                  {m.statut === 'ouverte' && (
                    <Button size="sm" onClick={() => handleAccept(m)}>
                      <Play size={12} /> Accepter
                    </Button>
                  )}
                  {m.statut === 'en_cours' && (
                    <>
                      <Button size="sm" onClick={() => handleComplete(m)}>
                        <CheckCircle2 size={12} /> Terminer
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleFail(m)}>
                        Échouer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleAbandon(m)}>
                        Abandonner
                      </Button>
                    </>
                  )}
                </footer>
              </article>
            ))}
          </div>
        )}
      </Card>

      {/* Modale création/édition */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier la mission' : 'Nouvelle mission'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>
              Annuler
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Publier la mission
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Titre *
            <input
              type="text"
              value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              autoFocus
              placeholder="Ex: Escorter le marchand jusqu'à Konoha"
            />
          </label>

          <label>
            Description / Briefing
            <textarea
              rows={4}
              value={form.desc ?? ''}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="Détails de la mission, objectifs, dangers attendus…"
            />
          </label>

          <div className={styles.row3}>
            <label>
              Rang *
              <select
                value={form.rang ?? 'D'}
                onChange={(e) => handleRangChange(e.target.value as MissionRang)}
              >
                {MISSION_RANGS.map((r) => (
                  <option key={r} value={r}>
                    Rang {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={form.type ?? 'Autre'}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as MissionType })
                }
              >
                {MISSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Récompense (Ryos)
              <input
                type="number"
                value={form.recompense ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    recompense: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="Suggéré selon le rang"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              Lieu
              <input
                type="text"
                value={form.lieu ?? ''}
                onChange={(e) => setForm({ ...form, lieu: e.target.value })}
                placeholder="Ex: Frontière nord"
              />
            </label>
            <label>
              Deadline
              <input
                type="date"
                value={form.deadline ?? ''}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </label>
          </div>
        </div>
      </Modal>
    </>
  );
}
