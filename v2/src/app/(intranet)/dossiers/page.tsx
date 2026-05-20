'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page DOSSIERS — Dossiers criminels de la police
 * ════════════════════════════════════════════════════════════════
 *
 * ✨ MISE À JOUR :
 * - Autocomplétion du nom depuis le Recensement à la création
 * - Click sur suggestion = pré-remplit nom + photo + recenseId
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, Save, Search, Camera, FileText,
  AlertTriangle, FolderOpen, Coins, Users, BookOpen,
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
import { compressImage } from '@/lib/image';
import {
  type Dossier, type DossierDanger, type DossierStatut,
  DANGER_LABEL, DOSSIER_STATUT_LABEL, fmtMoney, fmtDateFR,
  getNextDossierNumber, computeAmendeTotals,
} from '@/types/dossier';
import type { Recense } from '@/types/recense';

import styles from './page.module.css';
import detailStyles from './[id]/page.module.css';

const FB_PATH = 'dossiers';
const FB_RECENSES_PATH = 'recenses';
type DangerFilter = 'all' | DossierDanger;
type StatutFilter = 'all' | DossierStatut;

// ─── Fuzzy match helper (ignore accents + casse) ───
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalize(needle.trim());
  if (!n) return false;
  const h = normalize(haystack);
  const words = n.split(/\s+/).filter(Boolean);
  return words.every((w) => h.includes(w));
}

export default function DossiersPage() {
  const router = useRouter();
  const u = useCurrentUser();
  const CURRENT_USER = u.displayName;
  const { data, loading } = useFirebaseValue<Dossier[] | null>(FB_PATH);
  const { data: recensesData } = useFirebaseValue<Recense[] | null>(FB_RECENSES_PATH);

  const [search, setSearch] = useState('');
  const [dangerFilter, setDangerFilter] = useState<DangerFilter>('all');
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('all');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Dossier>>({});

  const all = useMemo<Dossier[]>(() => {
    if (!data) return [];
    return (Array.isArray(data) ? data : Object.values(data)).filter(
      (d): d is Dossier => d !== null && typeof d === 'object' && !!d.id
    );
  }, [data]);

  const recenses = useMemo<Recense[]>(() => {
    if (!recensesData) return [];
    return (Array.isArray(recensesData) ? recensesData : Object.values(recensesData)).filter(
      (r): r is Recense => r !== null && typeof r === 'object' && !!r.id
    );
  }, [recensesData]);

  const visible = useMemo(() => {
    let list = all;
    if (dangerFilter !== 'all') list = list.filter((d) => d.danger === dangerFilter);
    if (statutFilter !== 'all') list = list.filter((d) => d.statut === statutFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        ((d.nom || '') + ' ' + (d.notes || '') + ' ' +
          (d.infractions || '') + ' ' +
          (d.infractionsList || []).map((i) => i.nom).join(' ') + ' ' +
          (d.numeroDossier || '') + ' ' +
          (d.auteur || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.date ?? b.id) - (a.date ?? a.id));
  }, [all, search, dangerFilter, statutFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = all.length;
    const recherches = all.filter((d) => d.statut === 'recherche').length;
    const gardeVue = all.filter((d) => d.statut === 'garde_vue').length;
    let totalImpayee = 0;
    for (const d of all) {
      if (d.infractionsList && d.infractionsList.length > 0) {
        const { impayee } = computeAmendeTotals(d.infractionsList);
        totalImpayee += impayee;
      } else {
        totalImpayee += d.amendeImpayee || 0;
      }
    }
    return { total, recherches, gardeVue, totalImpayee };
  }, [all]);

  // ─── Suggestions Recensement ───
  const recenseSuggestions = useMemo<Recense[]>(() => {
    const q = (form.nom || '').trim();
    if (q.length < 2) return [];
    // Si on a déjà sélectionné un recensé qui matche, on n'affiche pas
    if (form.recenseId) {
      const picked = recenses.find((r) => r.id === form.recenseId);
      if (picked && normalize(`${picked.prenom} ${picked.nom}`) === normalize(q)) {
        return [];
      }
    }
    return recenses
      .filter((r) => fuzzyMatch(q, `${r.prenom || ''} ${r.nom || ''}`))
      .slice(0, 6);
  }, [form.nom, form.recenseId, recenses]);

  function openCreate() {
    setForm({ danger: 'moyen', statut: 'ouvert', defunt: false });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm({});
  }

  function pickRecense(r: Recense) {
    const nomComplet = `${r.prenom || ''} ${r.nom || ''}`.trim();
    setForm({
      ...form,
      nom: nomComplet,
      recenseId: r.id,
      photo: r.photo || form.photo,
    });
    toast.success(`"${nomComplet}" sélectionné·e depuis le recensement`);
  }

  function clearRecenseLink() {
    setForm({ ...form, recenseId: undefined });
  }

  function openFiche(d: Dossier) {
    router.push(`/dossiers/${d.id}`);
  }

  async function handleSave() {
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    try {
      const now = Date.now();
      const numeroDossier = getNextDossierNumber(all);

      const newDossier: Dossier = {
        id: now,
        numeroDossier,
        nom: form.nom!.trim(),
        recenseId: form.recenseId || undefined,
        danger: form.danger || 'moyen',
        statut: form.statut || 'ouvert',
        notes: form.notes?.trim() || undefined,
        photo: form.photo || undefined,
        defunt: !!form.defunt,
        auteur: CURRENT_USER,
        date: now,
        infractionsList: [],
        amendePayee: 0,
        amendeImpayee: 0,
        amendeTotal: 0,
      };

      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'create',
        target: 'dossier',
        targetId: String(now),
        detail: `Ouverture du dossier ${numeroDossier} sur ${form.nom!.trim()}${form.recenseId ? ` (lié au recensé #${form.recenseId})` : ''}`,
      });

      await dbSet(FB_PATH, [...all, newDossier]);
      toast.success(`Dossier ${numeroDossier} ouvert`);
      closeForm();
      router.push(`/dossiers/${now}`);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(d: Dossier, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirmAction({
      title: 'Supprimer le dossier',
      message: `Supprimer définitivement le dossier ${d.numeroDossier || ''} de ${d.nom} ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      logAction({
        who: CURRENT_USER,
        whoId: u.id ?? null,
        action: 'delete',
        target: 'dossier',
        targetId: String(d.id),
        detail: `Suppression du dossier ${d.numeroDossier || d.id} de ${d.nom}`,
      });

      await dbSet(FB_PATH, all.filter((x) => x.id !== d.id));
      toast.success('Dossier supprimé');
    } catch {
      toast.error('Erreur');
    }
  }

  async function handlePhotoUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error("Ce n'est pas une image");
      return;
    }
    try {
      const dataUrl = await compressImage(file, 400, 0.75);
      setForm({ ...form, photo: dataUrl });
    } catch {
      toast.error("Impossible de charger l'image");
    }
  }

  // Détecte si le recensé sélectionné existe encore
  const linkedRecense = useMemo(
    () => form.recenseId ? recenses.find((r) => r.id === form.recenseId) : null,
    [form.recenseId, recenses],
  );

  return (
    <>
      <Card
        title="Dossiers criminels"
        subtitle="Registre officiel de la Police de Suna"
        actions={
          <RequireMembreBranche branche="police">
            <Button onClick={openCreate}>
              <Plus size={14} /> Ouvrir un dossier
            </Button>
          </RequireMembreBranche>
        }
      >
        {/* Stats */}
        <div className={styles.statGrid}>
          <StatCard label="Total dossiers" value={stats.total} variant="default" />
          <StatCard label="Recherchés" value={stats.recherches} variant="danger" />
          <StatCard label="En garde à vue" value={stats.gardeVue} variant="warning" />
          <StatCard
            label="Amendes impayées"
            value={`${fmtMoney(stats.totalImpayee)} ₽`}
            variant="gold"
          />
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="N°, nom, infractions, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={dangerFilter}
            onChange={(e) => setDangerFilter(e.target.value as DangerFilter)}
          >
            <option value="all">Tous niveaux de danger</option>
            <option value="faible">Faible</option>
            <option value="moyen">Moyen</option>
            <option value="eleve">Élevé</option>
            <option value="critique">Critique</option>
          </select>
          <select
            className={styles.filterSelect}
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value as StatutFilter)}
          >
            <option value="all">Tous statuts</option>
            {Object.entries(DOSSIER_STATUT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <FolderOpen size={32} style={{ opacity: 0.3 }} />
            <p>
              {search || dangerFilter !== 'all' || statutFilter !== 'all'
                ? 'Aucun dossier pour ces critères.'
                : 'Aucun dossier criminel ouvert.'}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visible.map((d) => {
              const hasNewInfractions = d.infractionsList && d.infractionsList.length > 0;
              const previewInfractions = hasNewInfractions
                ? d.infractionsList!.slice(0, 3).map((i) => i.nom)
                : d.infractions
                ? [d.infractions]
                : [];

              const totals = hasNewInfractions
                ? computeAmendeTotals(d.infractionsList!)
                : { total: d.amendeTotal || 0, payee: d.amendePayee || 0, impayee: d.amendeImpayee || 0 };

              return (
                <article
                  key={d.id}
                  className={`${styles.dossier} ${styles[`d-${d.danger}`]} ${d.defunt ? styles.defunt : ''}`}
                  onClick={() => openFiche(d)}
                >
                  {d.statut === 'recherche' && !d.defunt && (
                    <div className={styles.stamp}>RECHERCHÉ</div>
                  )}
                  {d.statut === 'garde_vue' && !d.defunt && (
                    <div className={`${styles.stamp} ${styles.stampWarning}`}>GARDE À VUE</div>
                  )}
                  {d.defunt && (
                    <div className={`${styles.stamp} ${styles.stampDefunt}`}>DÉFUNT</div>
                  )}

                  <div className={styles.dossierHeader}>
                    <div className={styles.dossierTab}>
                      <FileText size={11} />
                      <span className={styles.dossierNum}>
                        {d.numeroDossier || `DOS-${new Date(d.date || d.id).getFullYear()}-${String(d.id).slice(-3)}`}
                      </span>
                    </div>
                    <span className={`${styles.dangerBadge} ${styles[`db-${d.danger}`]}`}>
                      {(d.danger === 'critique' || d.danger === 'eleve') && <AlertTriangle size={10} />}
                      {DANGER_LABEL[d.danger]}
                    </span>
                    <RequireMembreBranche branche="police">
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => handleDelete(d, e)}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </RequireMembreBranche>
                  </div>

                  <div className={styles.identity}>
                    {d.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.photo} alt={d.nom} className={styles.photo} />
                    ) : (
                      <div className={styles.photoPlaceholder}>
                        {d.nom[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div className={styles.identityInfo}>
                      <h3>{d.nom}</h3>
                      <div className={styles.subline}>
                        {d.auteur && <span>Par {d.auteur}</span>}
                        {d.date && (
                          <>
                            <span className={styles.sep}>·</span>
                            <span>{fmtDateFR(d.date)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {previewInfractions.length > 0 && (
                    <div className={styles.infractions}>
                      <div className={styles.infractionsLabel}>
                        <FileText size={10} /> Chef{previewInfractions.length > 1 ? 's' : ''} d&apos;accusation
                      </div>
                      <ul className={styles.infractionsList}>
                        {previewInfractions.map((inf, i) => (
                          <li key={i}>{inf}</li>
                        ))}
                        {hasNewInfractions && d.infractionsList!.length > 3 && (
                          <li className={styles.infractionMore}>
                            + {d.infractionsList!.length - 3} autre{d.infractionsList!.length - 3 > 1 ? 's' : ''}
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {(totals.total > 0 || totals.impayee > 0) && (
                    <div className={styles.amendes}>
                      {totals.payee > 0 && (
                        <div className={styles.amendeTag}>
                          <span>Payé</span>
                          <strong>{fmtMoney(totals.payee)} ₽</strong>
                        </div>
                      )}
                      {totals.impayee > 0 && (
                        <div className={`${styles.amendeTag} ${styles.amendeTagImpaye}`}>
                          <span>Impayé</span>
                          <strong>{fmtMoney(totals.impayee)} ₽</strong>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {/* ═══ MODALE DE CRÉATION ═══ */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title="Nouveau dossier criminel"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Ouvrir le dossier</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <p className={styles.formHint}>
            Crée le dossier. Tu pourras ensuite ajouter les <strong>infractions</strong> et
            <strong> amendes</strong> depuis la fiche détaillée.
          </p>

          {/* ─── Nom + autocomplétion ─── */}
          <label>
            Nom complet du suspect *
            <input
              type="text"
              value={form.nom ?? ''}
              onChange={(e) => setForm({
                ...form,
                nom: e.target.value,
                // Reset le lien recensé si le user retape manuellement
                recenseId: undefined,
              })}
              autoFocus
              placeholder="Prénom et nom (cherche dans le recensement)"
            />
          </label>

          {/* Suggestions Recensement */}
          {recenseSuggestions.length > 0 && (
            <div className={detailStyles.suggestions}>
              <div className={detailStyles.suggestionsLabel}>
                <BookOpen size={11} /> Suggestions du Recensement ({recenseSuggestions.length})
              </div>
              {recenseSuggestions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={detailStyles.suggestion}
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
                  <div className={detailStyles.suggInfo}>
                    <div className={detailStyles.suggName}>
                      {r.prenom} {r.nom}
                    </div>
                    <div className={detailStyles.suggMeta}>
                      {r.rang || 'Sans rang'}
                      {r.faction && ` · ${r.faction}`}
                      {r.clan && ` · Clan ${r.clan}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {(form.nom || '').trim().length > 0 && (form.nom || '').trim().length < 2 && !form.recenseId && (
            <p className={detailStyles.hintInline}>
              Tape au moins 2 lettres pour chercher dans le recensement
            </p>
          )}

          {(form.nom || '').trim().length >= 2 && recenseSuggestions.length === 0 && !form.recenseId && (
            <p className={detailStyles.hintInline}>
              <em>Personne non recensée — saisie libre acceptée</em>
            </p>
          )}

          {/* Lien recensé sélectionné */}
          {linkedRecense && (
            <div className={styles.linkedRecense}>
              <Users size={12} />
              <span>
                Lié au recensé : <strong>{linkedRecense.prenom} {linkedRecense.nom}</strong>
                {linkedRecense.rang && ` (${linkedRecense.rang})`}
              </span>
              <button
                type="button"
                className={styles.unlinkBtn}
                onClick={clearRecenseLink}
                title="Retirer le lien"
              >
                ✕
              </button>
            </div>
          )}

          <div className={styles.row}>
            <label>
              Niveau de danger
              <select
                value={form.danger ?? 'moyen'}
                onChange={(e) => setForm({ ...form, danger: e.target.value as DossierDanger })}
              >
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="eleve">Élevé</option>
                <option value="critique">Critique</option>
              </select>
            </label>
            <label>
              Statut initial
              <select
                value={form.statut ?? 'ouvert'}
                onChange={(e) => setForm({ ...form, statut: e.target.value as DossierStatut })}
              >
                {Object.entries(DOSSIER_STATUT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Observations initiales
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Contexte de l'ouverture du dossier…"
            />
          </label>

          <label>
            <Camera size={11} style={{ marginRight: 4, display: 'inline' }} />
            Photo (optionnel)
            <div className={styles.uploadZone}>
              {form.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photo} alt="Aperçu" className={styles.uploadPreview} />
              ) : (
                <div className={styles.uploadPlaceholder}>
                  📷 Cliquer pour choisir une image
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePhotoUpload(f);
                }}
              />
              {form.photo && (
                <button
                  type="button"
                  className={styles.removePhoto}
                  onClick={(e) => {
                    e.preventDefault();
                    setForm({ ...form, photo: undefined });
                  }}
                >
                  Retirer
                </button>
              )}
            </div>
          </label>
        </div>
      </Modal>
    </>
  );
}

function StatCard({ label, value, variant }: {
  label: string;
  value: number | string;
  variant: 'default' | 'danger' | 'warning' | 'gold';
}) {
  return (
    <div className={`${styles.statCard} ${styles[`sv-${variant}`]}`}>
      <div className={styles.statVal}>
        {variant === 'gold' && (
          <Coins size={18} style={{ marginRight: 4, display: 'inline', verticalAlign: 'middle' }} />
        )}
        {value}
      </div>
      <div className={styles.statLbl}>{label}</div>
    </div>
  );
}
