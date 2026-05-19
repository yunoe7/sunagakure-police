'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ARCHIVES — Affaires clôturées et précédents juridiques
 * ════════════════════════════════════════════════════════════════
 *
 * 2 onglets :
 *   - Affaires archivées : lit sunagakure/affaires (statuts jugee/archivee)
 *   - Jurisprudence : CRUD sur sunagakure/jurisprudence
 *
 * Pour les affaires, vue read-only avec lien vers le jugement associé.
 * Pour la jurisprudence, on peut créer/modifier/supprimer des précédents.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Archive, Scale, BookOpen, Calendar,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Affaire, type Jugement,
  AFFAIRE_STATUT_LABEL, VERDICT_LABEL, fmtDateFR as fmtDate,
} from '@/types/tribunal';
import { type Precedent, nextPrecedentRef, fmtDateFR } from '@/types/justice-plus';

import styles from './page.module.css';

const FB_JUR = 'jurisprudence';
const CURRENT_USER = 'Ninja';

type Tab = 'affaires' | 'jurisprudence';

export default function ArchivesPage() {
  const { data: affairesData, loading: lAff } = useFirebaseValue<Affaire[] | null>('affaires');
  const { data: jugementsData } = useFirebaseValue<Jugement[] | null>('jugements');
  const { data: jurData, loading: lJur } = useFirebaseValue<Precedent[] | null>(FB_JUR);

  const [tab, setTab] = useState<Tab>('affaires');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Precedent>>({});
  const [viewingAffaireId, setViewingAffaireId] = useState<number | null>(null);
  const [viewingPrecedentId, setViewingPrecedentId] = useState<number | null>(null);

  // ─── Données ───
  const affaires = useMemo<Affaire[]>(
    () => (Array.isArray(affairesData) ? affairesData : affairesData ? Object.values(affairesData) : []).filter(
      (a): a is Affaire => a !== null && typeof a === 'object' && !!a.id
    ),
    [affairesData]
  );

  const jugements = useMemo<Jugement[]>(
    () => (Array.isArray(jugementsData) ? jugementsData : jugementsData ? Object.values(jugementsData) : []).filter(
      (j): j is Jugement => j !== null && typeof j === 'object' && !!j.id
    ),
    [jugementsData]
  );

  const jurisprudence = useMemo<Precedent[]>(
    () => (Array.isArray(jurData) ? jurData : jurData ? Object.values(jurData) : []).filter(
      (p): p is Precedent => p !== null && typeof p === 'object' && !!p.id
    ),
    [jurData]
  );

  // Map jugement par affaireId
  const jugementByAffaireId = useMemo(() => {
    const m = new Map<number, Jugement>();
    for (const j of jugements) {
      if (j.affaireId) m.set(j.affaireId, j);
    }
    return m;
  }, [jugements]);

  // Affaires archivées = jugées ou archivées
  const affairesArchivees = useMemo(() => {
    return affaires.filter((a) => a.statut === 'jugee' || a.statut === 'archivee');
  }, [affaires]);

  // Filtres
  const visibleAffaires = useMemo(() => {
    let list = affairesArchivees;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) =>
      ((a.ref || '') + ' ' + (a.titre || '') + ' ' + (a.defendeur || '') + ' ' + (a.accusateur || '') + ' ' + (a.juge || '') + ' ' + (a.desc || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  }, [affairesArchivees, search]);

  const visiblePrecedents = useMemo(() => {
    let list = jurisprudence;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) =>
      ((p.reference || '') + ' ' + (p.titre || '') + ' ' + (p.contexte || '') + ' ' + (p.decision || '') + ' ' + (p.affaireRef || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [jurisprudence, search]);

  const viewingAffaire = viewingAffaireId
    ? affaires.find((a) => a.id === viewingAffaireId)
    : null;
  const viewingAffaireJugement = viewingAffaire
    ? jugementByAffaireId.get(viewingAffaire.id) : null;

  const viewingPrecedent = viewingPrecedentId
    ? jurisprudence.find((p) => p.id === viewingPrecedentId)
    : null;

  // ─── Handlers Jurisprudence ───
  function openCreate() {
    setEditingId(null);
    setForm({ juge: CURRENT_USER });
    setShowForm(true);
  }
  function openEdit(p: Precedent) {
    setEditingId(p.id); setForm(p); setShowForm(true); setViewingPrecedentId(null);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  function selectAffaire(id: number) {
    const a = affaires.find((x) => x.id === id);
    if (a) {
      setForm({
        ...form,
        affaireId: id,
        affaireRef: a.ref || a.titre,
      });
    }
  }

  async function handleSave() {
    if (!form.titre?.trim()) { toast.error('Le titre est obligatoire'); return; }
    if (!form.decision?.trim()) { toast.error('La décision est obligatoire'); return; }
    try {
      const list = [...jurisprudence];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((p) => p.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Precedent;
      } else {
        list.push({
          id: now,
          reference: nextPrecedentRef(list),
          titre: form.titre!.trim(),
          contexte: form.contexte?.trim() || undefined,
          decision: form.decision!.trim(),
          porteeJuridique: form.porteeJuridique?.trim() || undefined,
          date: form.date || undefined,
          juge: form.juge?.trim() || CURRENT_USER,
          affaireId: form.affaireId,
          affaireRef: form.affaireRef,
          createdAt: now,
        });
      }
      await dbSet(FB_JUR, list);
      toast.success(editingId ? 'Précédent mis à jour' : 'Précédent enregistré');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(p: Precedent) {
    const ok = await confirmAction({
      title: 'Supprimer le précédent',
      message: `Supprimer "${p.titre}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_JUR, jurisprudence.filter((x) => x.id !== p.id));
      toast.success('Supprimé');
      if (viewingPrecedentId === p.id) setViewingPrecedentId(null);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Archives & Jurisprudence"
        subtitle="Affaires clôturées et précédents juridiques de Sunagakure"
        actions={
          tab === 'jurisprudence' && (
            <Button onClick={openCreate}>
              <Plus size={14} /> Nouveau précédent
            </Button>
          )
        }
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scGold}`}>
            <Archive size={16} />
            <div className={styles.statVal}>{affairesArchivees.length}</div>
            <div className={styles.statLbl}>Affaires archivées</div>
          </div>
          <div className={`${styles.statCard} ${styles.scGreen}`}>
            <BookOpen size={16} />
            <div className={styles.statVal}>{jurisprudence.length}</div>
            <div className={styles.statLbl}>Précédents juridiques</div>
          </div>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'affaires' ? styles.tabActive : ''}`}
            onClick={() => setTab('affaires')}
          >
            <Archive size={11} /><span>Affaires archivées</span>
            <span className={styles.tabCount}>{affairesArchivees.length}</span>
          </button>
          <button
            className={`${styles.tab} ${tab === 'jurisprudence' ? styles.tabActive : ''}`}
            onClick={() => setTab('jurisprudence')}
          >
            <Scale size={11} /><span>Jurisprudence</span>
            <span className={styles.tabCount}>{jurisprudence.length}</span>
          </button>
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input type="text"
            placeholder={tab === 'affaires' ? 'Référence, titre, défendeur, juge…' : 'Titre, contexte, décision…'}
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === 'affaires' && (
          lAff ? <p className={styles.empty}>Chargement…</p>
          : visibleAffaires.length === 0 ? (
            <div className={styles.empty}>
              <Archive size={32} style={{ opacity: 0.3 }} />
              <p>Aucune affaire archivée. Les affaires jugées apparaîtront ici.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visibleAffaires.map((a) => {
                const jug = jugementByAffaireId.get(a.id);
                return (
                  <article key={a.id} className={styles.archCard} onClick={() => setViewingAffaireId(a.id)}>
                    <div className={styles.cHeader}>
                      {a.ref && <span className={styles.ref}>{a.ref}</span>}
                      <span className={`${styles.statutChip} ${styles[`chip-${a.statut}`]}`}>
                        {AFFAIRE_STATUT_LABEL[a.statut]}
                      </span>
                      {jug && (
                        <span className={`${styles.verdictChip} ${styles[`vd-${jug.verdict}`]}`}>
                          {VERDICT_LABEL[jug.verdict]}
                        </span>
                      )}
                      <span className={styles.dateChip}>
                        <Calendar size={11} /> {fmtDate(a.updatedAt ?? a.createdAt)}
                      </span>
                    </div>
                    <h3>{a.titre}</h3>
                    {(a.defendeur || a.accusateur) && (
                      <div className={styles.parties}>
                        {a.accusateur && <span>📋 {a.accusateur}</span>}
                        {a.defendeur && <span>👤 c/ {a.defendeur}</span>}
                      </div>
                    )}
                    {a.juge && <div className={styles.juge}>⚖ Juge : <strong>{a.juge}</strong></div>}
                  </article>
                );
              })}
            </div>
          )
        )}

        {tab === 'jurisprudence' && (
          lJur ? <p className={styles.empty}>Chargement…</p>
          : visiblePrecedents.length === 0 ? (
            <div className={styles.empty}>
              <BookOpen size={32} style={{ opacity: 0.3 }} />
              <p>Aucun précédent. Crée le premier !</p>
            </div>
          ) : (
            <div className={styles.list}>
              {visiblePrecedents.map((p) => (
                <article key={p.id} className={styles.jurCard} onClick={() => setViewingPrecedentId(p.id)}>
                  <div className={styles.cHeader}>
                    {p.reference && <span className={styles.refJur}>{p.reference}</span>}
                    {p.date && (
                      <span className={styles.dateChip}>
                        <Calendar size={11} /> {fmtDateFR(p.date)}
                      </span>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                      aria-label="Supprimer"
                    ><Trash2 size={13} /></button>
                  </div>
                  <h3>{p.titre}</h3>
                  {p.affaireRef && <div className={styles.affaireRef}>📁 {p.affaireRef}</div>}
                  <p className={styles.preview}>{p.decision}</p>
                </article>
              ))}
            </div>
          )
        )}
      </Card>

      {/* Viewer Affaire archivée */}
      <Modal open={!!viewingAffaire} onClose={() => setViewingAffaireId(null)}
        title={viewingAffaire ? (viewingAffaire.ref ? `${viewingAffaire.ref} — ${viewingAffaire.titre}` : viewingAffaire.titre) : ''}
        size="lg"
        footer={<Button onClick={() => setViewingAffaireId(null)}>Fermer</Button>}
      >
        {viewingAffaire && (
          <div className={styles.viewer}>
            <div className={styles.vMeta}>
              <span className={`${styles.statutChip} ${styles[`chip-${viewingAffaire.statut}`]}`}>
                {AFFAIRE_STATUT_LABEL[viewingAffaire.statut]}
              </span>
              {viewingAffaireJugement && (
                <span className={`${styles.verdictChip} ${styles[`vd-${viewingAffaireJugement.verdict}`]}`}>
                  {VERDICT_LABEL[viewingAffaireJugement.verdict]}
                </span>
              )}
              <span>📅 {fmtDate(viewingAffaire.updatedAt ?? viewingAffaire.createdAt)}</span>
            </div>

            <div className={styles.viewerRow}>
              {viewingAffaire.accusateur && (
                <div>
                  <div className={styles.fieldLabel}>Accusateur</div>
                  <strong>{viewingAffaire.accusateur}</strong>
                </div>
              )}
              {viewingAffaire.defendeur && (
                <div>
                  <div className={styles.fieldLabel}>Défendeur</div>
                  <strong>{viewingAffaire.defendeur}</strong>
                </div>
              )}
              {viewingAffaire.juge && (
                <div>
                  <div className={styles.fieldLabel}>Juge</div>
                  <strong>{viewingAffaire.juge}</strong>
                </div>
              )}
              {viewingAffaire.avocat && (
                <div>
                  <div className={styles.fieldLabel}>Avocat</div>
                  <strong>{viewingAffaire.avocat}</strong>
                </div>
              )}
            </div>

            {viewingAffaire.desc && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Description</div>
                <p className={styles.bigText}>{viewingAffaire.desc}</p>
              </div>
            )}

            {viewingAffaireJugement && (
              <div className={styles.jugementBox}>
                <h4>⚖ Jugement rendu</h4>
                {viewingAffaireJugement.date && (
                  <div className={styles.mono}>Le {fmtDate(viewingAffaireJugement.date)}</div>
                )}
                {viewingAffaireJugement.peine && (
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>Peine</div>
                    <p><strong>{viewingAffaireJugement.peine}</strong></p>
                  </div>
                )}
                {viewingAffaireJugement.motifs && (
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>Motifs</div>
                    <p className={styles.bigText}>{viewingAffaireJugement.motifs}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Viewer Précédent */}
      <Modal open={!!viewingPrecedent} onClose={() => setViewingPrecedentId(null)}
        title={viewingPrecedent ? `${viewingPrecedent.reference || ''} — ${viewingPrecedent.titre}` : ''}
        size="lg"
        footer={
          viewingPrecedent && (
            <>
              <Button variant="ghost" onClick={() => handleDelete(viewingPrecedent)}><Trash2 size={14} /> Supprimer</Button>
              <Button onClick={() => openEdit(viewingPrecedent)}>Modifier</Button>
            </>
          )
        }
      >
        {viewingPrecedent && (
          <div className={styles.viewer}>
            <div className={styles.vMeta}>
              {viewingPrecedent.reference && <span className={styles.refJur}>{viewingPrecedent.reference}</span>}
              {viewingPrecedent.date && <span>📅 {fmtDateFR(viewingPrecedent.date)}</span>}
              {viewingPrecedent.juge && <span>⚖ {viewingPrecedent.juge}</span>}
            </div>

            {viewingPrecedent.affaireRef && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Affaire de référence</div>
                <p>📁 {viewingPrecedent.affaireRef}</p>
              </div>
            )}

            {viewingPrecedent.contexte && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Contexte</div>
                <p className={styles.bigText}>{viewingPrecedent.contexte}</p>
              </div>
            )}

            <div className={styles.field}>
              <div className={styles.fieldLabel}>⚖ Décision</div>
              <p className={styles.decision}>{viewingPrecedent.decision}</p>
            </div>

            {viewingPrecedent.porteeJuridique && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>Portée juridique</div>
                <p className={styles.bigText}>{viewingPrecedent.porteeJuridique}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Formulaire précédent */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier le précédent' : 'Nouveau précédent juridique'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>Titre du précédent *
            <input type="text" value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus
              placeholder="Ex: Présomption d'innocence du suspect..." />
          </label>

          <div className={styles.row}>
            <label>Affaire liée
              <select value={form.affaireId ?? ''}
                onChange={(e) => e.target.value ? selectAffaire(Number(e.target.value)) : setForm({ ...form, affaireId: undefined, affaireRef: undefined })}>
                <option value="">— Aucune —</option>
                {affairesArchivees.map((a) => (
                  <option key={a.id} value={a.id}>{a.ref || `#${a.id}`} - {a.titre}</option>
                ))}
              </select>
            </label>
            <label>Date du précédent
              <input type="date" value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
          </div>

          <label>Contexte
            <textarea rows={3} value={form.contexte ?? ''}
              onChange={(e) => setForm({ ...form, contexte: e.target.value })}
              placeholder="Circonstances de l'affaire..." />
          </label>

          <label>Décision rendue *
            <textarea rows={4} value={form.decision ?? ''}
              onChange={(e) => setForm({ ...form, decision: e.target.value })}
              placeholder="Le tribunal a statué que..." />
          </label>

          <label>Portée juridique
            <textarea rows={3} value={form.porteeJuridique ?? ''}
              onChange={(e) => setForm({ ...form, porteeJuridique: e.target.value })}
              placeholder="Comment ce précédent s'applique-t-il aux futures affaires ?" />
          </label>

          <label>Juge
            <input type="text" value={form.juge ?? ''}
              onChange={(e) => setForm({ ...form, juge: e.target.value })} />
          </label>
        </div>
      </Modal>
    </>
  );
}
