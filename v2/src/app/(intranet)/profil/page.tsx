'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page PROFIL — Profil utilisateur connecté
 * ════════════════════════════════════════════════════════════════
 *
 * Affiche :
 * - Carte d'identité Discord (avatar, nom, badges, ID)
 * - Liaison avec une fiche recensée (optionnelle)
 * - Statistiques d'activité (depuis /audit_log filtré par whoId)
 * - 20 dernières actions de l'utilisateur
 *
 * Stockage liaison fiche recensée :
 *   members/<discordId>/recenseId : number
 *
 * Note : on lit /members directement (pas via sunagakure/) car c'est
 * à la racine d'après le récap du projet.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  User, IdCard, Link2, Unlink, ExternalLink, Search,
  Plus, Pencil, Trash2, Package, Activity, Hash,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { UserBadges } from '@/components/UserBadges';
import type { AuditEntry, AuditAction } from '@/lib/audit';
import { ACTION_LABEL, ACTION_COLOR } from '@/lib/audit';
import { type Recense, isDefunt } from '@/types/recense';

import styles from './page.module.css';

// On accède à /members directement à la racine, pas via le wrapper db.ts
// qui préfixe sunagakure/. Donc on utilise fetch direct via env.
const DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

export default function ProfilPage() {
  const u = useCurrentUser();
  const myDiscordId = u.id;

  // ─── Récupération du recenseId lié ───
  const { data: myMemberData, loading: loadingMember } =
    useFirebaseValueRoot<{ recenseId?: number }>(myDiscordId ? `members/${myDiscordId}` : null);

  // ─── Récupération de l'audit_log ───
  const { data: auditData, loading: loadingAudit } =
    useFirebaseValueRoot<Record<string, AuditEntry>>('audit_log');

  // ─── Recensés (pour matcher la fiche liée + modale de liaison) ───
  const { data: recensesData, loading: loadingRecenses } =
    useFirebaseValue<Recense[] | Record<string, Recense> | null>('recenses');

  const recenses = useMemo<Recense[]>(() => {
    if (!recensesData) return [];
    const arr = Array.isArray(recensesData)
      ? recensesData
      : Object.values(recensesData);
    return arr.filter((r): r is Recense => r !== null && typeof r === 'object' && !!r.id);
  }, [recensesData]);

  const myRecense = useMemo(() => {
    if (!myMemberData?.recenseId) return null;
    return recenses.find((r) => r.id === myMemberData.recenseId) || null;
  }, [myMemberData, recenses]);

  // ─── Audit log filtré sur mes actions ───
  const myActions = useMemo<AuditEntry[]>(() => {
    if (!auditData || !myDiscordId) return [];
    return Object.values(auditData)
      .filter((e): e is AuditEntry => !!e && typeof e === 'object' && !!e.when)
      .filter((e) => e.whoId === myDiscordId)
      .sort((a, b) => b.when - a.when);
  }, [auditData, myDiscordId]);

  // ─── Stats agrégées ───
  const stats = useMemo(() => {
    const byAction: Record<AuditAction, number> = {
      create: 0, update: 0, delete: 0, login: 0,
      export: 0, import: 0, compress: 0,
    };
    const byModule = new Map<string, number>();

    for (const a of myActions) {
      byAction[a.action] = (byAction[a.action] || 0) + 1;
      // Module = premier segment du target (ex: "compta:police:transaction" → "compta")
      const moduleKey = (a.target || '').split(':')[0] || 'autre';
      byModule.set(moduleKey, (byModule.get(moduleKey) || 0) + 1);
    }

    const topModules = Array.from(byModule.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total: myActions.length,
      byAction,
      topModules,
    };
  }, [myActions]);

  // ─── Modale liaison ───
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  const username = u.username || '';
  const filteredRecenses = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    let list = recenses;

    // Si pas de recherche : on suggère ceux dont auteur ressemble à l'user
    if (!q && username) {
      const suggestions = list.filter((r) =>
        (r.auteur || '').toLowerCase().includes(username.toLowerCase())
      );
      if (suggestions.length > 0) return suggestions.slice(0, 20);
    }
    if (q) {
      list = list.filter((r) =>
        (`${r.prenom || ''} ${r.nom || ''} ${r.auteur || ''}`)
          .toLowerCase().includes(q)
      );
    }
    return list.slice(0, 30);
  }, [recenses, linkSearch, username]);

  // ─── Filtre activité ───
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const availableModules = useMemo(() => {
    const set = new Set<string>();
    for (const a of myActions) {
      const k = (a.target || '').split(':')[0] || 'autre';
      set.add(k);
    }
    return Array.from(set).sort();
  }, [myActions]);

  const visibleActions = useMemo(() => {
    if (moduleFilter === 'all') return myActions.slice(0, 20);
    return myActions
      .filter((a) => (a.target || '').split(':')[0] === moduleFilter)
      .slice(0, 20);
  }, [myActions, moduleFilter]);

  // ─── Handlers ───
  async function handleLinkRecense(r: Recense) {
    if (!myDiscordId || !DB_URL) return;
    try {
      await fetch(`${DB_URL}/members/${myDiscordId}/recenseId.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.id),
      });
      toast.success(`Fiche "${r.prenom} ${r.nom}" liée à ton profil`);
      setLinkModalOpen(false);
      setLinkSearch('');
    } catch (err) {
      console.error('[PROFIL LINK]', err);
      toast.error('Erreur lors de la liaison');
    }
  }

  async function handleUnlinkRecense() {
    if (!myDiscordId || !DB_URL || !myRecense) return;
    const ok = await confirmAction({
      title: 'Délier la fiche',
      message: `Délier la fiche "${myRecense.prenom} ${myRecense.nom}" de ton profil ? Ça n'efface pas la fiche, juste la liaison.`,
      confirmLabel: 'Délier',
    });
    if (!ok) return;
    try {
      await fetch(`${DB_URL}/members/${myDiscordId}/recenseId.json`, {
        method: 'DELETE',
      });
      toast.success('Fiche déliée');
    } catch {
      toast.error('Erreur');
    }
  }

  // ─── États de chargement / non connecté ───
  if (u.isLoading) {
    return (
      <Card title="Mon profil">
        <p className={styles.empty}>Chargement…</p>
      </Card>
    );
  }
  if (!u.user || !myDiscordId) {
    return (
      <Card title="Mon profil">
        <p className={styles.empty}>Tu dois être connecté pour voir cette page.</p>
      </Card>
    );
  }

  // ─── Rendu ───
  return (
    <>
      {/* ─── Carte d'identité ─── */}
      <Card title="Mon profil" subtitle="Identité Discord et liaison RP">
        <div className={styles.identity}>
          {u.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.avatar} alt={u.displayName} className={styles.avatarBig} />
          ) : (
            <div className={styles.avatarBigPlaceholder}>{u.initials}</div>
          )}

          <div className={styles.identityBody}>
            <h2 className={styles.displayName}>{u.displayName}</h2>
            {u.username && u.username !== u.displayName && (
              <div className={styles.username}>@{u.username}</div>
            )}

            <div className={styles.idLine}>
              <Hash size={11} />
              <span className={styles.mono}>{myDiscordId}</span>
            </div>

            <div className={styles.badgesBox}>
              <UserBadges user={u.user} size="md" showAdmin />
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Fiche recensée liée ─── */}
      <Card
        title="Ma fiche recensée"
        subtitle="Lien vers ton personnage RP officiel"
      >
        {loadingMember || loadingRecenses ? (
          <p className={styles.empty}>Chargement…</p>
        ) : myRecense ? (
          <div className={styles.recenseLinked}>
            {myRecense.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={myRecense.photo}
                alt={`${myRecense.prenom} ${myRecense.nom}`}
                className={styles.recensePhoto}
              />
            ) : (
              <div className={styles.recensePhotoPlaceholder}>
                <User size={32} />
              </div>
            )}
            <div className={styles.recenseInfo}>
              <h3>
                {myRecense.prenom} {myRecense.nom}
                {isDefunt(myRecense) && (
                  <span className={styles.deceasedTag}>⚱️ Décédé</span>
                )}
              </h3>
              <div className={styles.recenseMeta}>
                {myRecense.rang && <span>{myRecense.rang}</span>}
                {myRecense.clan && <span>· Clan {myRecense.clan}</span>}
                {myRecense.faction && <span>· {myRecense.faction}</span>}
              </div>
              {myRecense.metier && (
                <div className={styles.recenseMetier}>{myRecense.metier}</div>
              )}
            </div>
            <div className={styles.recenseActions}>
              <Link href={`/recensement/${myRecense.id}`}>
                <Button variant="outline">
                  <ExternalLink size={13} /> Voir la fiche
                </Button>
              </Link>
              <Button variant="ghost" onClick={handleUnlinkRecense}>
                <Unlink size={13} /> Délier
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.noRecense}>
            <IdCard size={32} style={{ opacity: 0.3 }} />
            <p>Aucune fiche recensée liée à ton profil.</p>
            <Button onClick={() => setLinkModalOpen(true)}>
              <Link2 size={13} /> Lier ma fiche recensée
            </Button>
          </div>
        )}
      </Card>

      {/* ─── Stats d'activité ─── */}
      <Card
        title="Mes statistiques"
        subtitle={`${stats.total} action${stats.total > 1 ? 's' : ''} tracée${stats.total > 1 ? 's' : ''} dans le système`}
      >
        {loadingAudit ? (
          <p className={styles.empty}>Chargement de l'historique…</p>
        ) : stats.total === 0 ? (
          <div className={styles.empty}>
            <Activity size={32} style={{ opacity: 0.3 }} />
            <p>Aucune action enregistrée pour le moment.</p>
          </div>
        ) : (
          <>
            <div className={styles.statsGrid}>
              <div className={`${styles.statCard} ${styles.scGreen}`}>
                <Plus size={14} />
                <div className={styles.statVal}>{stats.byAction.create}</div>
                <div className={styles.statLbl}>Créations</div>
              </div>
              <div className={`${styles.statCard} ${styles.scBlue}`}>
                <Pencil size={14} />
                <div className={styles.statVal}>{stats.byAction.update}</div>
                <div className={styles.statLbl}>Modifications</div>
              </div>
              <div className={`${styles.statCard} ${styles.scRed}`}>
                <Trash2 size={14} />
                <div className={styles.statVal}>{stats.byAction.delete}</div>
                <div className={styles.statLbl}>Suppressions</div>
              </div>
              <div className={`${styles.statCard} ${styles.scCyan}`}>
                <Package size={14} />
                <div className={styles.statVal}>{stats.byAction.compress}</div>
                <div className={styles.statLbl}>Clôtures</div>
              </div>
            </div>

            {stats.topModules.length > 0 && (
              <div className={styles.modulesBlock}>
                <div className={styles.modulesTitle}>Top modules</div>
                <div className={styles.modulesList}>
                  {stats.topModules.map(([mod, count]) => (
                    <div key={mod} className={styles.modulePill}>
                      <span className={styles.moduleName}>{mod}</span>
                      <span className={styles.moduleCount}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ─── Activité récente ─── */}
      <Card
        title="Activité récente"
        subtitle="20 dernières actions"
        actions={
          availableModules.length > 1 && (
            <select
              className={styles.filterSelect}
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              <option value="all">Tous modules</option>
              {availableModules.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )
        }
      >
        {loadingAudit ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visibleActions.length === 0 ? (
          <div className={styles.empty}>
            <Activity size={32} style={{ opacity: 0.3 }} />
            <p>Aucune activité {moduleFilter !== 'all' ? `pour ${moduleFilter}` : ''}.</p>
          </div>
        ) : (
          <div className={styles.timeline}>
            {visibleActions.map((a, i) => (
              <div key={i} className={styles.timelineItem}>
                <div
                  className={styles.timelineMarker}
                  style={{ background: ACTION_COLOR[a.action] }}
                  title={ACTION_LABEL[a.action]}
                />
                <div className={styles.timelineBody}>
                  <div className={styles.timelineHead}>
                    <span
                      className={styles.actionChip}
                      style={{
                        color: ACTION_COLOR[a.action],
                        borderColor: ACTION_COLOR[a.action] + '55',
                        background: ACTION_COLOR[a.action] + '15',
                      }}
                    >
                      {ACTION_LABEL[a.action]}
                    </span>
                    <span className={styles.timelineTarget}>{a.target}</span>
                    <span className={styles.timelineDate}>
                      {fmtRelativeTime(a.when)}
                    </span>
                  </div>
                  <div className={styles.timelineDetail}>{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── Modale liaison fiche recensée ─── */}
      <Modal
        open={linkModalOpen}
        onClose={() => { setLinkModalOpen(false); setLinkSearch(''); }}
        title="Lier une fiche recensée à mon profil"
        size="lg"
        footer={
          <Button variant="outline" onClick={() => setLinkModalOpen(false)}>
            Annuler
          </Button>
        }
      >
        <div className={styles.linkSearch}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Rechercher par prénom, nom ou auteur…"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            autoFocus
          />
        </div>

        {!linkSearch && filteredRecenses.length > 0 && (
          <p className={styles.linkHint}>
            Suggestions basées sur ton pseudo Discord ({username}). Modifie ta recherche
            si aucune ne correspond.
          </p>
        )}

        {filteredRecenses.length === 0 ? (
          <p className={styles.empty}>
            {linkSearch
              ? `Aucun recensé trouvé pour "${linkSearch}".`
              : 'Cherche ta fiche RP par prénom, nom ou par ton pseudo Discord (auteur).'}
          </p>
        ) : (
          <div className={styles.linkList}>
            {filteredRecenses.map((r) => (
              <button
                key={r.id}
                type="button"
                className={styles.linkItem}
                onClick={() => handleLinkRecense(r)}
              >
                {r.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.photo}
                    alt={`${r.prenom} ${r.nom}`}
                    className={styles.linkPhoto}
                  />
                ) : (
                  <div className={styles.linkPhotoPlaceholder}>
                    <User size={18} />
                  </div>
                )}
                <div className={styles.linkInfo}>
                  <strong>{r.prenom} {r.nom}</strong>
                  <span className={styles.linkMeta}>
                    {r.rang || 'Inconnu'}
                    {r.clan && ` · ${r.clan}`}
                    {r.auteur && ` · par ${r.auteur}`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────────

/**
 * Hook lecture Firebase à la racine (pas via le wrapper sunagakure/).
 * Utilisé pour members/ et audit_log/ qui sont à la racine de la DB.
 *
 * Implémentation minimaliste basée sur fetch + polling léger ;
 * idéalement à remplacer par useFirebaseValue avec un flag "root"
 * mais on reste autonome ici pour ne pas modifier le hook existant.
 */
function useFirebaseValueRoot<T>(path: string | null): {
  data: T | null;
  loading: boolean;
} {
  const [data, setData] = useStateLazy<T | null>(null);
  const [loading, setLoading] = useStateLazy<boolean>(!!path);

  // On ré-importe useEffect/useState ici en évitant l'import en haut
  // pour ne pas alourdir la liste déjà longue.
  useEffectLazy(() => {
    if (!path || !DB_URL) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);

    async function load() {
      try {
        const res = await fetch(`${DB_URL}/${path}.json`);
        if (!res.ok) throw new Error('Fetch failed');
        const json = await res.json();
        if (alive) setData(json);
      } catch (err) {
        console.error('[useFirebaseValueRoot]', path, err);
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();

    // Re-fetch toutes les 30s (suffisant pour profil ; pas besoin de WS)
    const interval = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [path]);

  return { data, loading };
}

// Imports React via re-export pour rester en bas du fichier proprement
import { useState as useStateLazy, useEffect as useEffectLazy } from 'react';

function fmtRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 60) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  if (hr < 24) return `il y a ${hr} h`;
  if (day < 7) return `il y a ${day} j`;
  return new Date(timestamp).toLocaleDateString('fr-FR');
}
