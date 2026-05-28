'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page KŌEKI — ÉCONOMIE : Sociétés privées imposables
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir       : canVoirEconomie (membres éco, superviseur éco, direction, +admin/Jonin+)
 * - Gérer      : canGererSocietes (créer / éditer / archiver)
 *
 * 📜 Audit log : create / update / delete (archivage) sur koeki:societe.
 *
 * Stockage Firebase : sunagakure/koeki/societes  → Societe[]
 *
 * NB : la déclaration de CA (→ Trésor) et la modif des taux arrivent
 *      en Phase 3 (page de déclaration) — ici on gère le registre.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Archive, ArchiveRestore, Search, Building2, Save,
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
  type Societe, type SocieteType, type KoekiParametres,
  SOCIETE_TYPES, SOCIETE_TYPE_LABEL, SOCIETE_TYPE_ICON,
  DEFAULT_TAUX_PAR_TYPE, tauxEffectif, genId, fmtMoney,
} from '@/types/koeki';

import styles from './page.module.css';

const FB_SOCIETES = 'koeki/societes';
const FB_PARAMS = 'koeki/parametres';

type FilterActif = 'actifs' | 'archives' | 'all';

export default function KoekiEconomiePage() {
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canGerer = u.can.koeki.gererSocietes();

  const { data: societesData, loading } = useFirebaseValue<Societe[] | null>(FB_SOCIETES);
  const { data: paramsData } = useFirebaseValue<KoekiParametres | null>(FB_PARAMS);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | SocieteType>('all');
  const [filterActif, setFilterActif] = useState<FilterActif>('actifs');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Societe | null>(null);
  const [form, setForm] = useState<Partial<Societe>>({});

  const params = useMemo<KoekiParametres>(() => ({
    tauxParType: paramsData?.tauxParType ?? DEFAULT_TAUX_PAR_TYPE,
    paieParGrade: paramsData?.paieParGrade,
  }), [paramsData]);

  const societes = useMemo<Societe[]>(() => {
    const list = Array.isArray(societesData)
      ? societesData
      : societesData ? Object.values(societesData) : [];
    return list.filter((s): s is Societe => s !== null && typeof s === 'object' && !!s.id);
  }, [societesData]);

  const visible = useMemo(() => {
    let list = societes;
    if (filterActif === 'actifs') list = list.filter((s) => s.actif);
    else if (filterActif === 'archives') list = list.filter((s) => !s.actif);
    if (filterType !== 'all') list = list.filter((s) => s.type === filterType);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        ((s.nom || '') + ' ' + (s.proprietaireNom || '') + ' ' + (s.type || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  }, [societes, filterActif, filterType, search]);

  const stats = useMemo(() => {
    const actives = societes.filter((s) => s.actif);
    const parType = new Map<SocieteType, number>();
    for (const s of actives) parType.set(s.type, (parType.get(s.type) || 0) + 1);
    return {
      total: actives.length,
      archivees: societes.length - actives.length,
      parType,
    };
  }, [societes]);

  function openCreate() {
    setEditing(null);
    setForm({
      type: 'restaurant',
      tauxImposition: null,
      actif: true,
    });
    setShowForm(true);
  }

  function openEdit(s: Societe) {
    setEditing(s);
    setForm({ ...s });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    if (!form.type) { toast.error('Le type est obligatoire'); return; }
    if (!form.proprietaireNom?.trim()) { toast.error('Le propriétaire est obligatoire'); return; }

    // Taux override : null (utilise global) ou nombre entre 0 et 100
    let taux: number | null = null;
    if (form.tauxImposition !== null && form.tauxImposition !== undefined && String(form.tauxImposition) !== '') {
      const n = Number(form.tauxImposition);
      if (isNaN(n) || n < 0 || n > 100) {
        toast.error('Le taux doit être entre 0 et 100 (ou vide pour le taux global)');
        return;
      }
      taux = n;
    }

    try {
      if (editing) {
        const updated: Societe = {
          ...editing,
          nom: form.nom!.trim(),
          type: form.type as SocieteType,
          proprietaireId: form.proprietaireId?.trim() || editing.proprietaireId || '',
          proprietaireNom: form.proprietaireNom!.trim(),
          tauxImposition: taux,
          notes: form.notes?.trim() || undefined,
        };
        await dbSet(FB_SOCIETES, societes.map((s) => (s.id === editing.id ? updated : s)));

        logAction({
          who: CURRENT_USER,
          whoId: u.id ?? null,
          action: 'update',
          target: 'koeki:societe',
          targetId: updated.id,
          detail: `Kōeki — Société modifiée : "${updated.nom}" ` +
            `(${SOCIETE_TYPE_LABEL[updated.type]}, propriétaire ${updated.proprietaireNom}, ` +
            `taux ${updated.tauxImposition === null ? 'global' : updated.tauxImposition + '%'})`,
        });

        toast.success('Société mise à jour');
      } else {
        const nouvelle: Societe = {
          id: genId('SOC'),
          nom: form.nom!.trim(),
          type: form.type as SocieteType,
          proprietaireId: form.proprietaireId?.trim() || '',
          proprietaireNom: form.proprietaireNom!.trim(),
          tauxImposition: taux,
          dateCreation: Date.now(),
          actif: true,
          notes: form.notes?.trim() || undefined,
        };
        await dbSet(FB_SOCIETES, [...societes, nouvelle]);

        logAction({
          who: CURRENT_USER,
          whoId: u.id ?? null,
          action: 'create',
          target: 'koeki:societe',
          targetId: nouvelle.id,
          detail: `Kōeki — Société créée : "${nouvelle.nom}" ` +
            `(${SOCIETE_TYPE_LABEL[nouvelle.type]}, propriétaire ${nouvelle.proprietaireNom}, ` +
            `taux ${nouvelle.tauxImposition === null ? 'global' : nouvelle.tauxImposition + '%'})`,
        });

        toast.success('Société créée');
      }
      setShowForm(false);
      setForm({});
      setEditing(null);
    } catch (err) {
      console.error('[KOEKI SOCIETE SAVE]', err);
      toast.error('Erreur lors de l\'enregistrement');
    }
  }

  async function toggleArchive(s: Societe) {
    const versArchive = s.actif;
    const ok = await confirmAction({
      title: versArchive ? 'Archiver la société' : 'Réactiver la société',
      message: versArchive
        ? `Archiver "${s.nom}" ? Elle n'apparaîtra plus dans la liste active mais son historique est conservé.`
        : `Réactiver "${s.nom}" ?`,
      confirmLabel: versArchive ? 'Archiver' : 'Réactiver',
      variant: versArchive ? 'danger' : undefined,
    });
    if (!ok) return;
    try {
      const updated: Societe = { ...s, actif: !s.actif };
      await dbSet(FB_SOCIETES, societes.map((x) => (x.id === s.id ? updated : x)));

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: versArchive ? 'delete' : 'update',
        target: 'koeki:societe',
        targetId: s.id,
        detail: `Kōeki — Société ${versArchive ? 'archivée' : 'réactivée'} : "${s.nom}"`,
      });

      toast.success(versArchive ? 'Société archivée' : 'Société réactivée');
    } catch {
      toast.error('Erreur');
    }
  }

  return (
    <>
      <Card
        title="🏯 Kōeki — Économie"
        subtitle="Registre des sociétés privées imposables"
        actions={
          canGerer ? (
            <Button onClick={openCreate}>
              <Plus size={14} /> Nouvelle société
            </Button>
          ) : null
        }
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Building2 size={16} />
            <div className={styles.statVal}>{stats.total}</div>
            <div className={styles.statLbl}>Sociétés actives</div>
          </div>
          {SOCIETE_TYPES.map((t) => (
            <div key={t} className={`${styles.statCard} ${styles.scBlue}`}>
              <span style={{ fontSize: 16 }}>{SOCIETE_TYPE_ICON[t]}</span>
              <div className={styles.statVal}>{stats.parType.get(t) || 0}</div>
              <div className={styles.statLbl}>{SOCIETE_TYPE_LABEL[t]}</div>
            </div>
          ))}
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Nom, propriétaire…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | SocieteType)}
          >
            <option value="all">Tous les types</option>
            {SOCIETE_TYPES.map((t) => (
              <option key={t} value={t}>{SOCIETE_TYPE_ICON[t]} {SOCIETE_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={filterActif}
            onChange={(e) => setFilterActif(e.target.value as FilterActif)}
          >
            <option value="actifs">Actives</option>
            <option value="archives">Archivées</option>
            <option value="all">Toutes</option>
          </select>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Building2 size={32} style={{ opacity: 0.3 }} />
            <p>
              {societes.length === 0
                ? 'Aucune société enregistrée.'
                : 'Aucune société pour ces critères.'}
              {canGerer && societes.length === 0 ? ' Utilise « Nouvelle société » pour commencer.' : ''}
            </p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Société</th>
                <th>Type</th>
                <th>Propriétaire</th>
                <th style={{ textAlign: 'right' }}>Taux effectif</th>
                {canGerer && <th aria-label="actions" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const taux = tauxEffectif(s, params);
                const override = s.tauxImposition !== null;
                return (
                  <tr key={s.id} className={s.actif ? '' : styles.rowArchived}>
                    <td>
                      <strong>{s.nom}</strong>
                      {!s.actif && <span className={styles.archivedTag}>archivée</span>}
                    </td>
                    <td>
                      <span className={styles.typeChip}>
                        {SOCIETE_TYPE_ICON[s.type]} {SOCIETE_TYPE_LABEL[s.type]}
                      </span>
                    </td>
                    <td className={styles.muted}>{s.proprietaireNom || '—'}</td>
                    <td className={styles.amount} style={{ textAlign: 'right' }}>
                      {taux}%
                      {override
                        ? <span className={styles.tauxTag}>perso</span>
                        : <span className={styles.tauxTagGlobal}>global</span>}
                    </td>
                    {canGerer && (
                      <td>
                        <div className={styles.rowActions}>
                          <button className={styles.iconBtn} onClick={() => openEdit(s)} aria-label="Modifier">
                            <Pencil size={13} />
                          </button>
                          <button
                            className={styles.iconBtn}
                            onClick={() => toggleArchive(s)}
                            aria-label={s.actif ? 'Archiver' : 'Réactiver'}
                          >
                            {s.actif ? <Archive size={13} /> : <ArchiveRestore size={13} />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Modifier la société' : 'Nouvelle société'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Nom de la société *
            <input
              type="text"
              value={form.nom ?? ''}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              placeholder="Ex: Ramen Ichiraku"
              autoFocus
            />
          </label>

          <label>Type *
            <select
              value={form.type ?? 'restaurant'}
              onChange={(e) => setForm({ ...form, type: e.target.value as SocieteType })}
            >
              {SOCIETE_TYPES.map((t) => (
                <option key={t} value={t}>{SOCIETE_TYPE_ICON[t]} {SOCIETE_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>

          <label>Propriétaire *
            <input
              type="text"
              value={form.proprietaireNom ?? ''}
              onChange={(e) => setForm({ ...form, proprietaireNom: e.target.value })}
              placeholder="Nom du ninja propriétaire"
            />
          </label>

          <label>Taux d'imposition personnalisé (%)
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.tauxImposition ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  tauxImposition: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder={`Vide = taux global (${form.type ? params.tauxParType[form.type as SocieteType] : '—'}%)`}
            />
          </label>
          <p className={styles.help}>
            Laisse vide pour utiliser le taux global du type
            {form.type ? ` (${SOCIETE_TYPE_LABEL[form.type as SocieteType]} : ${params.tauxParType[form.type as SocieteType]}%)` : ''}.
          </p>

          <label>Notes
            <textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optionnel"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
