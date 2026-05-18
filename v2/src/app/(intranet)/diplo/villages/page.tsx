'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Globe } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { type Village, type VillageStatut, VILLAGE_STATUT_LABEL } from '@/types/diplo';
import styles from './page.module.css';

const FB_PATH = 'diplo_villages';
type Filter = 'all' | VillageStatut;

export default function VillagesPage() {
  const { data, loading } = useFirebaseValue<Village[] | null>(FB_PATH);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Village>>({});

  const all = useMemo<Village[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (v): v is Village => v !== null && typeof v === 'object' && !!v.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    if (filter !== 'all') list = list.filter((v) => v.statut === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((v) =>
      ((v.nom || '') + ' ' + (v.pays || '') + ' ' + (v.kage || '') + ' ' + (v.alliance || ''))
        .toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [all, filter, search]);

  const stats = useMemo(() => {
    return {
      allies: all.filter((v) => v.statut === 'allie').length,
      neutres: all.filter((v) => v.statut === 'neutre').length,
      tendus: all.filter((v) => v.statut === 'tendu').length,
      ennemis: all.filter((v) => v.statut === 'ennemi').length,
    };
  }, [all]);

  function openCreate() {
    setEditingId(null);
    setForm({ statut: 'neutre' });
    setShowForm(true);
  }
  function openEdit(v: Village) { setEditingId(v.id); setForm(v); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm({}); }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((v) => v.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as Village;
      } else {
        list.push({
          id: now,
          nom: form.nom!.trim(),
          pays: form.pays?.trim() || undefined,
          statut: form.statut || 'neutre',
          alliance: form.alliance?.trim() || undefined,
          kage: form.kage?.trim() || undefined,
          population: form.population ? Number(form.population) : undefined,
          notes: form.notes?.trim() || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Village mis à jour' : 'Village enregistré');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(v: Village) {
    const ok = await confirmAction({
      title: 'Supprimer le village',
      message: `Retirer ${v.nom} de la liste ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== v.id)); toast.success('Supprimé'); }
    catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Villages"
        subtitle="Carnet diplomatique des villages connus"
        actions={<Button onClick={openCreate}><Plus size={14} /> Ajouter un village</Button>}
      >
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.scAllie}`}>
            <div className={styles.statVal}>{stats.allies}</div>
            <div className={styles.statLbl}>Alliés</div>
          </div>
          <div className={`${styles.statCard} ${styles.scNeutre}`}>
            <div className={styles.statVal}>{stats.neutres}</div>
            <div className={styles.statLbl}>Neutres</div>
          </div>
          <div className={`${styles.statCard} ${styles.scTendu}`}>
            <div className={styles.statVal}>{stats.tendus}</div>
            <div className={styles.statLbl}>Tendus</div>
          </div>
          <div className={`${styles.statCard} ${styles.scEnnemi}`}>
            <div className={styles.statVal}>{stats.ennemis}</div>
            <div className={styles.statLbl}>Ennemis</div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Nom, pays, kage…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.filters}>
            <button className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`} onClick={() => setFilter('all')}>Tous</button>
            {(['allie', 'neutre', 'tendu', 'ennemi'] as VillageStatut[]).map((s) => (
              <button key={s}
                className={`${styles.fbtn} ${styles[`fb-${s}`]} ${filter === s ? styles.fbtnOn : ''}`}
                onClick={() => setFilter(s)}>
                {VILLAGE_STATUT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Globe size={32} style={{ opacity: 0.3 }} />
              <p>Aucun village pour ces critères.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {visible.map((v) => (
                <article key={v.id}
                  className={`${styles.village} ${styles[`v-${v.statut}`]}`}
                  onClick={() => openEdit(v)}
                >
                  <div className={styles.vHeader}>
                    <h3>{v.nom}</h3>
                    <span className={`${styles.statutChip} ${styles[`chip-${v.statut}`]}`}>
                      {VILLAGE_STATUT_LABEL[v.statut]}
                    </span>
                  </div>
                  {v.pays && <div className={styles.pays}>📍 {v.pays}</div>}
                  <div className={styles.vMeta}>
                    {v.kage && <span>👑 {v.kage}</span>}
                    {v.alliance && <span>🤝 {v.alliance}</span>}
                    {v.population && <span>👥 {v.population.toLocaleString('fr-FR')}</span>}
                  </div>
                  {v.notes && <p className={styles.notes}>{v.notes}</p>}
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); handleDelete(v); }}
                    aria-label="Supprimer"
                  ><Trash2 size={13} /></button>
                </article>
              ))}
            </div>
          )}
      </Card>

      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier le village' : 'Nouveau village'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Nom du village *
              <input type="text" value={form.nom ?? ''} onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus />
            </label>
            <label>Pays
              <input type="text" value={form.pays ?? ''} onChange={(e) => setForm({ ...form, pays: e.target.value })} placeholder="Ex: Pays du Feu" />
            </label>
          </div>
          <div className={styles.row}>
            <label>Statut diplomatique
              <select value={form.statut ?? 'neutre'} onChange={(e) => setForm({ ...form, statut: e.target.value as VillageStatut })}>
                {(['allie', 'neutre', 'tendu', 'ennemi'] as VillageStatut[]).map((s) => (
                  <option key={s} value={s}>{VILLAGE_STATUT_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>Alliance / Coalition
              <input type="text" value={form.alliance ?? ''} onChange={(e) => setForm({ ...form, alliance: e.target.value })} />
            </label>
          </div>
          <div className={styles.row}>
            <label>Kage / Chef
              <input type="text" value={form.kage ?? ''} onChange={(e) => setForm({ ...form, kage: e.target.value })} placeholder="Ex: Hokage" />
            </label>
            <label>Population estimée
              <input type="number" min="0" value={form.population ?? ''}
                onChange={(e) => setForm({ ...form, population: e.target.value ? Number(e.target.value) : undefined })} />
            </label>
          </div>
          <label>Notes diplomatiques
            <textarea rows={4} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
      </Modal>
    </>
  );
}
