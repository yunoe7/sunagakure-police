'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page CODE PÉNAL — registre des infractions
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir : tout le monde (connecté)
 * - Créer / modifier / supprimer : GÉRANTS POLICE + Admin
 *   (texte officiel — seuls les chefs peuvent modifier)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Scale, Scroll } from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Infraction,
  type InfractionCat,
  INFRACTION_CAT_LABEL,
  INFRACTION_CAT_ORDER,
} from '@/types/infraction';

import styles from './page.module.css';

const FB_PATH = 'infractions';
type Filter = 'all' | InfractionCat;

export default function CodePenalPage() {
  const { can } = useCurrentUser();
  const canEdit = can.adminBranche('police');

  const { data, loading } = useFirebaseValue<Infraction[] | null>(FB_PATH);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Infraction>>({});

  const { all, byCategory } = useMemo(() => {
    const list = data
      ? (Array.isArray(data) ? data : Object.values(data)).filter(
          (i): i is Infraction => i !== null && typeof i === 'object' && !!i.id
        )
      : [];

    const q = search.trim().toLowerCase();
    const filtered = list.filter((i) => {
      if (filter !== 'all' && i.cat !== filter) return false;
      if (!q) return true;
      const s = ((i.nom || '') + ' ' + (i.notes || '') + ' ' + (i.amende || '')).toLowerCase();
      return s.includes(q);
    });

    filtered.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));

    const groups: Record<string, Infraction[]> = {};
    for (const i of filtered) {
      const k = (i.cat as string) || 'violet';
      (groups[k] = groups[k] || []).push(i);
    }

    return { all: filtered, byCategory: groups };
  }, [data, search, filter]);

  function openCreate() {
    setEditingId(null);
    setForm({ cat: 'violet', prison: 'Non' });
    setShowForm(true);
  }

  function openEdit(i: Infraction) {
    if (!canEdit) return;
    setEditingId(i.id); setForm(i); setShowForm(true);
  }

  function closeForm() {
    setShowForm(false); setEditingId(null); setForm({});
  }

  async function handleSave() {
    if (!form.nom?.trim()) {
      toast.error("Le nom de l'infraction est obligatoire");
      return;
    }
    try {
      const list = data ? (Array.isArray(data) ? [...data] : Object.values(data)) : [];
      const current = list.filter(
        (i): i is Infraction => i !== null && typeof i === 'object' && !!i.id
      );
      if (editingId) {
        const idx = current.findIndex((i) => i.id === editingId);
        if (idx === -1) throw new Error('Infraction introuvable');
        current[idx] = { ...current[idx], ...form, id: editingId } as Infraction;
        await dbSet(FB_PATH, current);
        toast.success('Ordonnance mise à jour');
      } else {
        const newInf: Infraction = {
          id: Date.now(),
          nom: form.nom!.trim(),
          cat: form.cat || 'violet',
          amende: form.amende?.trim() || undefined,
          prison: form.prison || 'Non',
          duree: form.duree?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
        };
        current.push(newInf);
        await dbSet(FB_PATH, current);
        toast.success('Ordonnance scellée');
      }
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(i: Infraction) {
    const ok = await confirmAction({
      title: "Supprimer l'ordonnance",
      message: `Supprimer "${i.nom}" du Code Pénal ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const list = data ? (Array.isArray(data) ? [...data] : Object.values(data)) : [];
      const filtered = list.filter(
        (x): x is Infraction => x !== null && typeof x === 'object' && !!x.id && x.id !== i.id
      );
      await dbSet(FB_PATH, filtered);
      toast.success('Ordonnance supprimée');
    } catch { toast.error('Erreur lors de la suppression'); }
  }

  return (
    <RequireBranche branche="police" fallback={
      <Card title="Code Pénal" subtitle="Registre officiel des infractions">
        <div className={styles.hero}>
          <div className={styles.heroOverline}>— Registre officiel —</div>
          <h2 className={styles.heroTitle}>CODE PÉNAL DE SUNA</h2>
          <p className={styles.heroSub}>
            <em>« Nul n&apos;est censé ignorer la loi du Pays du Vent »</em>
          </p>
        </div>
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : all.length === 0 ? (
          <div className={styles.empty}>
            <Scroll size={32} style={{ opacity: 0.3 }} />
            <p>Aucune ordonnance scellée.</p>
          </div>
        ) : (
          <div className={styles.sections}>
            {INFRACTION_CAT_ORDER.map((cat) => {
              const list = byCategory[cat];
              if (!list || list.length === 0) return null;
              return (
                <section key={cat} className={styles.section}>
                  <header className={`${styles.sectionHeader} ${styles[`sh-${cat}`]}`}>
                    <span className={`${styles.dot} ${styles[`dot-${cat}`]}`} />
                    <h3>{INFRACTION_CAT_LABEL[cat as InfractionCat]}</h3>
                    <span className={styles.count}>
                      {list.length} ordonnance{list.length > 1 ? 's' : ''}
                    </span>
                  </header>
                  <div className={styles.items}>
                    {list.map((inf) => (
                      <article key={inf.id} className={`${styles.item} ${styles[`item-${cat}`]}`}>
                        <div className={styles.itemMain}>
                          <h4>{inf.nom}</h4>
                          {inf.notes && <p>{inf.notes}</p>}
                        </div>
                        <div className={styles.itemMeta}>
                          {inf.amende && (
                            <div className={styles.metaTag}>
                              <span>Amende</span>
                              <strong>{inf.amende}</strong>
                            </div>
                          )}
                          {inf.prison && inf.prison !== 'Non' && (
                            <div className={`${styles.metaTag} ${styles.metaTagPrison}`}>
                              <span>Prison</span>
                              <strong>{inf.duree || 'Oui'}</strong>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Card>
    }>
      <>
        <Card
          title="Code Pénal"
          subtitle="Registre officiel des infractions"
          actions={
            <Button onClick={openCreate}>
              <Plus size={14} /> Sceller une ordonnance
            </Button>
          }
        >
          <div className={styles.hero}>
            <div className={styles.heroOverline}>— Registre officiel —</div>
            <h2 className={styles.heroTitle}>CODE PÉNAL DE SUNA</h2>
            <p className={styles.heroSub}>
              <em>« Nul n&apos;est censé ignorer la loi du Pays du Vent »</em>
            </p>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={14} />
              <input type="text" placeholder="Rechercher une infraction…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className={styles.filters}>
              <button className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`}
                onClick={() => setFilter('all')}>Tout</button>
              {INFRACTION_CAT_ORDER.map((cat) => (
                <button key={cat}
                  className={`${styles.fbtn} ${styles[`fbtn-${cat}`]} ${filter === cat ? styles.fbtnOn : ''}`}
                  onClick={() => setFilter(cat)}>
                  <span className={`${styles.dot} ${styles[`dot-${cat}`]}`} />
                  {INFRACTION_CAT_LABEL[cat]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className={styles.empty}>Chargement…</p>
          ) : all.length === 0 ? (
            <div className={styles.empty}>
              <Scroll size={32} style={{ opacity: 0.3 }} />
              <p>
                {search || filter !== 'all'
                  ? 'Aucune ordonnance pour ces critères.'
                  : 'Aucune ordonnance scellée. Ajoute la première !'}
              </p>
            </div>
          ) : (
            <div className={styles.sections}>
              {INFRACTION_CAT_ORDER.map((cat) => {
                const list = byCategory[cat];
                if (!list || list.length === 0) return null;
                return (
                  <section key={cat} className={styles.section}>
                    <header className={`${styles.sectionHeader} ${styles[`sh-${cat}`]}`}>
                      <span className={`${styles.dot} ${styles[`dot-${cat}`]}`} />
                      <h3>{INFRACTION_CAT_LABEL[cat as InfractionCat]}</h3>
                      <span className={styles.count}>
                        {list.length} ordonnance{list.length > 1 ? 's' : ''}
                      </span>
                    </header>
                    <div className={styles.items}>
                      {list.map((inf) => (
                        <article key={inf.id}
                          className={`${styles.item} ${styles[`item-${cat}`]}`}
                          onClick={() => openEdit(inf)}>
                          <div className={styles.itemMain}>
                            <h4>{inf.nom}</h4>
                            {inf.notes && <p>{inf.notes}</p>}
                          </div>
                          <div className={styles.itemMeta}>
                            {inf.amende && (
                              <div className={styles.metaTag}>
                                <span>Amende</span>
                                <strong>{inf.amende}</strong>
                              </div>
                            )}
                            {inf.prison && inf.prison !== 'Non' && (
                              <div className={`${styles.metaTag} ${styles.metaTagPrison}`}>
                                <span>Prison</span>
                                <strong>{inf.duree || 'Oui'}</strong>
                              </div>
                            )}
                          </div>
                          <button className={styles.deleteBtn}
                            onClick={(e) => { e.stopPropagation(); handleDelete(inf); }}
                            aria-label="Supprimer">
                            <Trash2 size={13} />
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </Card>

        <Modal open={showForm} onClose={closeForm}
          title={editingId ? "Modifier l'ordonnance" : 'Nouvelle ordonnance'} size="lg"
          footer={
            <>
              <Button variant="outline" onClick={closeForm}>Annuler</Button>
              <Button onClick={handleSave}><Save size={14} /> Sceller l&apos;ordonnance</Button>
            </>
          }
        >
          <div className={styles.formFields}>
            <label>
              <Scale size={11} style={{ marginRight: 4, display: 'inline' }} />
              Intitulé de l&apos;infraction *
              <input type="text" value={form.nom ?? ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus
                placeholder="Ex: Vol à l'étalage" />
            </label>
            <label>Catégorie / Gravité
              <select value={form.cat ?? 'violet'}
                onChange={(e) => setForm({ ...form, cat: e.target.value as InfractionCat })}>
                {INFRACTION_CAT_ORDER.map((c) => (
                  <option key={c} value={c}>{INFRACTION_CAT_LABEL[c]}</option>
                ))}
              </select>
            </label>
            <div className={styles.row}>
              <label>Amende
                <input type="text" value={form.amende ?? ''}
                  onChange={(e) => setForm({ ...form, amende: e.target.value })}
                  placeholder="Ex: 500 ryos" />
              </label>
              <label>Peine de prison
                <select value={form.prison ?? 'Non'}
                  onChange={(e) => setForm({ ...form, prison: e.target.value })}>
                  <option value="Non">Non</option>
                  <option value="Oui">Oui</option>
                </select>
              </label>
              <label>Durée
                <input type="text" value={form.duree ?? ''}
                  onChange={(e) => setForm({ ...form, duree: e.target.value })}
                  placeholder="Ex: 3 jours" disabled={form.prison !== 'Oui'} />
              </label>
            </div>
            <label>Notes / Description légale
              <textarea rows={4} value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Détail de l'infraction, circonstances aggravantes…" />
            </label>
          </div>
        </Modal>
      </>
    </RequireBranche>
  );
}
