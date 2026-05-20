'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page CASIERS — Liste des casiers judiciaires
 * ════════════════════════════════════════════════════════════════
 *
 * Pattern identique à Dossiers : grille de cards vintage avec
 * cachet de statut, click → page détaillée /casiers/[id].
 *
 * ⚠️ Différence avec Dossiers :
 * - Un casier = UNE personne (1 seul casier par recensé)
 * - À l'ouverture, on DOIT lier un recensé (pas de nom libre)
 * - Garde-fou anti-doublon : si la personne a déjà un casier,
 *   on propose d'aller sur l'existant.
 *
 * 🔍 Audit log intégré (create, delete).
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Save, Search, FileText, AlertTriangle,
  ScrollText, Users, BookOpen, FolderOpen, ExternalLink,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { RequireMembreBranche } from '@/components/Require';
import { dbSet } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Casier, type CasierStatut,
  CASIER_STATUT_LABEL,
  fmtMoney, fmtDateFR,
  getNextCasierNumber, computeCasierTotals, getCasierVariant,
} from '@/types/casier';
import type { Recense } from '@/types/recense';

import styles from './page.module.css';

const FB_PATH = 'casiers';
const FB_RECENSES_PATH = 'recenses';

type StatutFilter = 'all' | CasierStatut;

// ─── Fuzzy match helper ───
function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalize(needle.trim());
  if (!n) return false;
  const h = normalize(haystack);
  return n.split(/\s+/).filter(Boolean).every((w) => h.includes(w));
}

export default function CasiersPage() {
  const router = useRouter();
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const canEdit = u.can.membreBranche('police');

  const { data, loading } = useFirebaseValue<Casier[] | null>(FB_PATH);
  const { data: recensesData } = useFirebaseValue<Recense[] | null>(FB_RECENSES_PATH);

  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('all');

  const [showOpenForm, setShowOpenForm] = useState(false);
  const [recenseSearch, setRecenseSearch] = useState('');
  const [pickedRecense, setPickedRecense] = useState<Recense | null>(null);

  const all = useMemo<Casier[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (c): c is Casier => c !== null && typeof c === 'object' && !!c.id
    );
  }, [data]);

  const recenses = useMemo<Recense[]>(() => {
    if (!recensesData) return [];
    return (Array.isArray(recensesData) ? recensesData : Object.values(recensesData)).filter(
      (r): r is Recense => r !== null && typeof r === 'object' && !!r.id
    );
  }, [recensesData]);

  // Map recenseId → Casier (pour le garde-fou anti-doublon + accès rapide)
  const casierByRecenseId = useMemo(() => {
    const m = new Map<number, Casier>();
    for (const c of all) {
      if (c.recenseId) m.set(c.recenseId, c);
    }
    return m;
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (statutFilter !== 'all') list = list.filter((c) => c.statut === statutFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        ((c.nomComplet || '') + ' ' + (c.numeroCasier || '') + ' ' + (c.observations || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.ouvertLe ?? b.id) - (a.ouvertLe ?? a.id));
  }, [all, search, statutFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = all.length;
    const surveillance = all.filter((c) => c.statut === 'surveillance').length;
    const interdits = all.filter((c) => c.statut === 'interdit_village').length;
    let totalImpayee = 0;
    for (const c of all) {
      totalImpayee += computeCasierTotals(c).impayee;
    }
    return { total, surveillance, interdits, totalImpayee };
  }, [all]);

  // Suggestions Recensement pour ouverture
  const recenseSuggestions = useMemo<Recense[]>(() => {
    const q = recenseSearch.trim();
    if (q.length < 2) return [];
    return recenses
      .filter((r) => fuzzyMatch(q, `${r.prenom || ''} ${r.nom || ''}`))
      .slice(0, 8);
  }, [recenseSearch, recenses]);

  function openOpenForm() {
    setShowOpenForm(true);
    setRecenseSearch('');
    setPickedRecense(null);
  }
  function closeOpenForm() {
    setShowOpenForm(false);
    setRecenseSearch('');
    setPickedRecense(null);
  }

  async function pickRecense(r: Recense) {
    // Garde-fou anti-doublon
    const existing = casierByRecenseId.get(r.id);
    if (existing) {
      const ok = await confirmAction({
        title: 'Casier existant',
        message: `${r.prenom} ${r.nom} a déjà un casier (${existing.numeroCasier}). Veux-tu aller le consulter ?`,
        confirmLabel: 'Consulter le casier',
      });
      if (ok) {
        closeOpenForm();
        router.push(`/police/casiers/${existing.id}`);
      }
      return;
    }
    setPickedRecense(r);
  }

  async function handleOpenCasier() {
    if (!pickedRecense) {
      toast.error('Sélectionne un recensé');
      return;
    }
    try {
      const now = Date.now();
      const numeroCasier = getNextCasierNumber(all);
      const nomComplet = `${pickedRecense.prenom || ''} ${pickedRecense.nom || ''}`.trim();

      const newCasier: Casier = {
        id: now,
        numeroCasier,
        recenseId: pickedRecense.id,
        nomComplet,
        statut: 'vierge',
        infractions: [],
        decisions: [],
        notes: [],
        restrictions: [],
        ouvertPar: CURRENT_USER,
        ouvertLe: now,
      };

      await dbSet(FB_PATH, [...all, newCasier]);

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'create',
        target: 'police:casier',
        targetId: String(now),
        detail: `Casier ${numeroCasier} ouvert sur ${nomComplet} (recensé #${pickedRecense.id})`,
      });

      toast.success(`Casier ${numeroCasier} ouvert`);
      closeOpenForm();
      router.push(`/police/casiers/${now}`);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'ouverture');
    }
  }

  function openCasier(c: Casier) {
    router.push(`/police/casiers/${c.id}`);
  }

  async function handleDelete(c: Casier, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirmAction({
      title: 'Supprimer le casier',
      message: `Supprimer définitivement le casier ${c.numeroCasier} de ${c.nomComplet} ? Cette action est irréversible et efface toutes les infractions, décisions et notes.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== c.id));

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'delete',
        target: 'police:casier',
        targetId: String(c.id),
        detail: `Suppression du casier ${c.numeroCasier} de ${c.nomComplet} ` +
          `(${(c.infractions || []).length} infractions, ${(c.decisions || []).length} décisions, ${(c.notes || []).length} notes)`,
      });

      toast.success('Casier supprimé');
    } catch {
      toast.error('Erreur');
    }
  }

  return (
    <>
      <Card
        title="Casiers judiciaires"
        subtitle="Registre permanent des antécédents — Police de Suna"
        actions={
          <RequireMembreBranche branche="police">
            <Button onClick={openOpenForm}>
              <Plus size={14} /> Ouvrir un casier
            </Button>
          </RequireMembreBranche>
        }
      >
        {/* Stats */}
        <div className={styles.statGrid}>
          <div className={`${styles.statCard} ${styles['sv-default']}`}>
            <div className={styles.statVal}>{stats.total}</div>
            <div className={styles.statLbl}>Casiers ouverts</div>
          </div>
          <div className={`${styles.statCard} ${styles['sv-warning']}`}>
            <div className={styles.statVal}>{stats.surveillance}</div>
            <div className={styles.statLbl}>Sous surveillance</div>
          </div>
          <div className={`${styles.statCard} ${styles['sv-danger']}`}>
            <div className={styles.statVal}>{stats.interdits}</div>
            <div className={styles.statLbl}>Interdits de village</div>
          </div>
          <div className={`${styles.statCard} ${styles['sv-gold']}`}>
            <div className={styles.statVal}>{fmtMoney(stats.totalImpayee)} ₽</div>
            <div className={styles.statLbl}>Amendes impayées</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="N°, nom, observations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutFilter)}
          >
            <option value="all">Tous statuts</option>
            {Object.entries(CASIER_STATUT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <ScrollText size={32} style={{ opacity: 0.3 }} />
            <p>
              {search || statutFilter !== 'all'
                ? 'Aucun casier pour ces critères.'
                : 'Aucun casier ouvert dans le registre.'}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visible.map((c) => {
              const totals = computeCasierTotals(c);
              const variant = getCasierVariant(c);
              const recense = recenses.find((r) => r.id === c.recenseId);

              return (
                <article
                  key={c.id}
                  className={`${styles.casier} ${styles[`v-${variant}`]}`}
                  onClick={() => openCasier(c)}
                >
                  {c.statut === 'interdit_village' && (
                    <div className={`${styles.stamp} ${styles.stampDanger}`}>INTERDIT</div>
                  )}
                  {c.statut === 'surveillance' && (
                    <div className={`${styles.stamp} ${styles.stampWarning}`}>SURVEILLANCE</div>
                  )}
                  {c.statut === 'rehabilite' && (
                    <div className={`${styles.stamp} ${styles.stampOk}`}>RÉHABILITÉ</div>
                  )}
                  {c.statut === 'vierge' && totals.nbInfractions === 0 && (
                    <div className={`${styles.stamp} ${styles.stampClean}`}>VIERGE</div>
                  )}

                  <div className={styles.casierHeader}>
                    <div className={styles.casierTab}>
                      <ScrollText size={11} />
                      <span className={styles.casierNum}>{c.numeroCasier}</span>
                    </div>
                    <span className={`${styles.statutBadge} ${styles[`stb-${c.statut}`]}`}>
                      {CASIER_STATUT_LABEL[c.statut]}
                    </span>
                    <RequireMembreBranche branche="police">
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => handleDelete(c, e)}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </RequireMembreBranche>
                  </div>

                  <div className={styles.identity}>
                    {recense?.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={recense.photo} alt={c.nomComplet} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        {c.nomComplet[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className={styles.identityInfo}>
                      <h3>{c.nomComplet}</h3>
                      <div className={styles.subline}>
                        {recense?.rang && <span>{recense.rang}</span>}
                        {recense?.clan && (
                          <>
                            <span className={styles.sep}>·</span>
                            <span>Clan {recense.clan}</span>
                          </>
                        )}
                        {!recense && <span className={styles.muted}>Recensé introuvable</span>}
                      </div>
                    </div>
                  </div>

                  {/* Compteurs */}
                  <div className={styles.counters}>
                    <div className={styles.counter}>
                      <span>{(c.infractions || []).length}</span>
                      <small>infraction{(c.infractions || []).length > 1 ? 's' : ''}</small>
                    </div>
                    <div className={styles.counter}>
                      <span>{(c.decisions || []).length}</span>
                      <small>décision{(c.decisions || []).length > 1 ? 's' : ''}</small>
                    </div>
                    <div className={styles.counter}>
                      <span>{(c.restrictions || []).filter((r) => r.active).length}</span>
                      <small>restriction{(c.restrictions || []).filter((r) => r.active).length > 1 ? 's' : ''}</small>
                    </div>
                  </div>

                  {totals.impayee > 0 && (
                    <div className={styles.amendes}>
                      <div className={`${styles.amendeTag} ${styles.amendeTagImpaye}`}>
                        <span>Impayé</span>
                        <strong>{fmtMoney(totals.impayee)} ₽</strong>
                      </div>
                    </div>
                  )}

                  <div className={styles.footer}>
                    <span className={styles.openedBy}>
                      Par {c.ouvertPar} · {fmtDateFR(c.ouvertLe)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {/* ═══ MODALE OUVERTURE D'UN CASIER ═══ */}
      <Modal
        open={showOpenForm}
        onClose={closeOpenForm}
        title="Ouvrir un casier judiciaire"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeOpenForm}>Annuler</Button>
            <Button onClick={handleOpenCasier} disabled={!pickedRecense}>
              <Save size={14} /> Ouvrir le casier
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <p className={styles.formHint}>
            Un casier est une fiche permanente attachée à un <strong>recensé</strong>.
            Sélectionne la personne ci-dessous (le système empêche les doublons).
          </p>

          {!pickedRecense ? (
            <>
              <label>
                <BookOpen size={11} style={{ marginRight: 4, display: 'inline' }} />
                Rechercher dans le Recensement
                <input
                  type="text"
                  value={recenseSearch}
                  onChange={(e) => setRecenseSearch(e.target.value)}
                  autoFocus
                  placeholder="Prénom et/ou nom"
                />
              </label>

              {recenseSearch.trim().length > 0 && recenseSearch.trim().length < 2 && (
                <p className={styles.hintInline}>
                  Tape au moins 2 lettres pour chercher
                </p>
              )}

              {recenseSuggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <div className={styles.suggestionsLabel}>
                    <Users size={11} /> {recenseSuggestions.length} résultat{recenseSuggestions.length > 1 ? 's' : ''}
                  </div>
                  {recenseSuggestions.map((r) => {
                    const hasCasier = casierByRecenseId.has(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`${styles.suggestion} ${hasCasier ? styles.suggestionExisting : ''}`}
                        onClick={() => pickRecense(r)}
                      >
                        {r.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.photo} alt={`${r.prenom} ${r.nom}`} className={styles.suggestionPhoto} />
                        ) : (
                          <div className={styles.suggestionPhotoPh}>
                            {(r.prenom?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                        <div className={styles.suggInfo}>
                          <div className={styles.suggName}>
                            {r.prenom} {r.nom}
                            {hasCasier && (
                              <span className={styles.existingBadge}>Casier existant</span>
                            )}
                          </div>
                          <div className={styles.suggMeta}>
                            {r.rang || 'Sans rang'}
                            {r.clan && ` · Clan ${r.clan}`}
                            {r.faction && ` · ${r.faction}`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {recenseSearch.trim().length >= 2 && recenseSuggestions.length === 0 && (
                <p className={styles.hintInline}>
                  <em>Aucun recensé trouvé. Si la personne n'existe pas, il faut d'abord la
                  recenser via /recensement.</em>
                </p>
              )}
            </>
          ) : (
            <div className={styles.pickedRecenseBox}>
              <div className={styles.pickedHeader}>
                <Users size={13} />
                <span>Personne sélectionnée</span>
              </div>
              <div className={styles.pickedBody}>
                {pickedRecense.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pickedRecense.photo}
                    alt={`${pickedRecense.prenom} ${pickedRecense.nom}`}
                    className={styles.pickedPhoto}
                  />
                ) : (
                  <div className={styles.pickedPhotoPh}>
                    {(pickedRecense.prenom?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <div className={styles.pickedInfo}>
                  <strong>{pickedRecense.prenom} {pickedRecense.nom}</strong>
                  <div className={styles.muted}>
                    {pickedRecense.rang || 'Sans rang'}
                    {pickedRecense.clan && ` · Clan ${pickedRecense.clan}`}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.unpickBtn}
                  onClick={() => setPickedRecense(null)}
                  title="Changer"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
