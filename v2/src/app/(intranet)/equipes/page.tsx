'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ÉQUIPES — Groupes opérationnels
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage Firebase : sunagakure/equipes (TABLEAU)
 *
 * Une équipe est composée d'un chef et de membres, tous référencés
 * par leur id depuis le recensement. On affiche emblèmes, descriptions,
 * et listes de membres avec leurs photos.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Search, Users, Shield, Crown, X } from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import type { Equipe } from '@/types/rh';
import type { Recense } from '@/types/recense';

import styles from './page.module.css';

const FB_PATH = 'equipes';
export default function EquipesPage() {
  const CURRENT_USER = useCurrentUser().displayName;
  const { data, loading } = useFirebaseValue<Equipe[] | null>(FB_PATH);
  const { data: recensesData } = useFirebaseValue<Recense[] | null>('recenses');

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Equipe>>({});
  const [memberSearch, setMemberSearch] = useState('');

  const all = useMemo<Equipe[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (e): e is Equipe => e !== null && typeof e === 'object' && !!e.id
    ),
    [data]
  );

  const recenses = useMemo<Recense[]>(
    () => (Array.isArray(recensesData) ? recensesData : recensesData ? Object.values(recensesData) : []).filter(
      (r): r is Recense => r !== null && typeof r === 'object' && !!r.id
    ),
    [recensesData]
  );

  // Map id → recensé pour résoudre rapidement
  const recensesById = useMemo(() => {
    const m = new Map<number, Recense>();
    for (const r of recenses) m.set(r.id, r);
    return m;
  }, [recenses]);

  const visible = useMemo(() => {
    let list = all;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) =>
      ((e.nom || '') + ' ' + (e.desc || '')).toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [all, search]);

  function openCreate() {
    setEditingId(null);
    setForm({ membres: [], emblem: '🛡️' });
    setMemberSearch('');
    setShowForm(true);
  }
  function openEdit(e: Equipe) {
    setEditingId(e.id);
    setForm({ ...e, membres: e.membres || [] });
    setMemberSearch('');
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false); setEditingId(null); setForm({}); setMemberSearch('');
  }

  function toggleMember(id: number) {
    const current = form.membres || [];
    if (current.includes(id)) {
      setForm({ ...form, membres: current.filter((x) => x !== id) });
    } else {
      setForm({ ...form, membres: [...current, id] });
    }
  }

  function setChef(id: number) {
    let membres = form.membres || [];
    if (!membres.includes(id)) membres = [...membres, id];
    setForm({ ...form, chefId: id, membres });
  }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    if (!form.chefId) { toast.error('Sélectionne un chef d\'équipe'); return; }
    try {
      const list = [...all];
      const now = Date.now();
      const membres = form.membres && form.membres.length > 0 ? form.membres : [form.chefId];
      // Assurer que le chef est dans les membres
      if (!membres.includes(form.chefId)) membres.unshift(form.chefId);

      if (editingId) {
        const idx = list.findIndex((e) => e.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = {
          ...list[idx],
          nom: form.nom!.trim(),
          emblem: form.emblem || '🛡️',
          chefId: form.chefId,
          membres,
          desc: form.desc?.trim() || undefined,
          modified: now,
          modifiedBy: CURRENT_USER,
        };
      } else {
        list.push({
          id: now,
          nom: form.nom!.trim(),
          emblem: form.emblem || '🛡️',
          chefId: form.chefId,
          membres,
          desc: form.desc?.trim() || undefined,
          created: now,
          createdBy: CURRENT_USER,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Équipe mise à jour' : 'Équipe créée');
      closeForm();
    } catch (err) { console.error(err); toast.error('Erreur'); }
  }

  async function handleDelete(e: Equipe) {
    const ok = await confirmAction({
      title: 'Supprimer l\'équipe',
      message: `Supprimer définitivement l'équipe "${e.nom}" ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try { await dbSet(FB_PATH, all.filter((x) => x.id !== e.id)); toast.success('Supprimée'); }
    catch { toast.error('Erreur'); }
  }

  // Recensés visibles pour la sélection des membres (avec recherche)
  const filteredRecenses = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return recenses;
    return recenses.filter((r) =>
      ((r.prenom || '') + ' ' + (r.nom || '') + ' ' + (r.faction || '') + ' ' + (r.rang || ''))
        .toLowerCase().includes(q)
    );
  }, [recenses, memberSearch]);

  return (
    <>
      <Card
        title="Équipes"
        subtitle="Groupes opérationnels et escouades"
        actions={<Button onClick={openCreate}><Plus size={14} /> Créer une équipe</Button>}
      >
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input type="text" placeholder="Nom d'équipe…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className={styles.totalChip}>
            {all.length} équipe{all.length > 1 ? 's' : ''}
          </div>
        </div>

        {loading ? <p className={styles.empty}>Chargement…</p>
          : visible.length === 0 ? (
            <div className={styles.empty}>
              <Users size={32} style={{ opacity: 0.3 }} />
              <p>Aucune équipe. Crée la première !</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {visible.map((eq) => {
                const chef = eq.chefId ? recensesById.get(eq.chefId) : null;
                const membres = (eq.membres || [])
                  .filter((id) => id !== eq.chefId)
                  .map((id) => recensesById.get(id))
                  .filter((r): r is Recense => !!r);
                return (
                  <article key={eq.id} className={styles.team} onClick={() => openEdit(eq)}>
                    <div className={styles.teamHeader}>
                      <span className={styles.emblem}>{eq.emblem || '🛡️'}</span>
                      <div className={styles.teamInfo}>
                        <h3>{eq.nom}</h3>
                        {eq.desc && <p>{eq.desc}</p>}
                      </div>
                      <button
                        className={styles.deleteBtn}
                        onClick={(ev) => { ev.stopPropagation(); handleDelete(eq); }}
                        aria-label="Supprimer"
                      ><Trash2 size={13} /></button>
                    </div>

                    {chef && (
                      <div className={styles.chef}>
                        <Crown size={12} />
                        {chef.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={chef.photo} alt={chef.nom} className={styles.chefPhoto} />
                        ) : (
                          <div className={styles.chefPlaceholder}>{(chef.prenom?.[0] || '?').toUpperCase()}</div>
                        )}
                        <div>
                          <div className={styles.chefName}>{chef.prenom} {chef.nom}</div>
                          <div className={styles.chefLabel}>Chef d&apos;équipe</div>
                        </div>
                      </div>
                    )}

                    {membres.length > 0 && (
                      <div className={styles.membres}>
                        <div className={styles.membresLabel}>
                          {membres.length} membre{membres.length > 1 ? 's' : ''}
                        </div>
                        <div className={styles.membresPhotos}>
                          {membres.slice(0, 8).map((m) => (
                            <div key={m.id} className={styles.memberSlot} title={`${m.prenom} ${m.nom}`}>
                              {m.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.photo} alt={m.nom} />
                              ) : (
                                <div className={styles.memberPlaceholder}>
                                  {(m.prenom?.[0] || '?').toUpperCase()}
                                </div>
                              )}
                            </div>
                          ))}
                          {membres.length > 8 && (
                            <div className={styles.membreMore}>+{membres.length - 8}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
      </Card>

      {/* Form */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? 'Modifier l\'équipe' : 'Créer une équipe'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>Nom de l&apos;équipe *
              <input type="text" value={form.nom ?? ''}
                onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus
                placeholder="Ex: Escouade des Sables" />
            </label>
            <label>Emblème
              <input type="text" maxLength={4} value={form.emblem ?? ''}
                onChange={(e) => setForm({ ...form, emblem: e.target.value })}
                placeholder="🛡️ ⚔️ 🐍 ..." style={{ fontSize: 20, textAlign: 'center' }} />
            </label>
          </div>

          <label>Description
            <textarea rows={2} value={form.desc ?? ''}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder="Rôle et missions de l'équipe..." />
          </label>

          <div className={styles.memberPicker}>
            <div className={styles.pickerHeader}>
              <span className={styles.pickerLabel}>
                <Shield size={11} /> Composition de l&apos;équipe ({(form.membres || []).length} membre{(form.membres || []).length > 1 ? 's' : ''})
              </span>
              <input type="text" placeholder="Rechercher un membre..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className={styles.pickerSearch} />
            </div>

            {recenses.length === 0 ? (
              <div className={styles.pickerEmpty}>
                Aucun recensé. Ajoute des personnes dans /recensement d&apos;abord.
              </div>
            ) : (
              <div className={styles.pickerList}>
                {filteredRecenses.slice(0, 50).map((r) => {
                  const isMember = (form.membres || []).includes(r.id);
                  const isChef = form.chefId === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`${styles.pickerItem} ${isMember ? styles.pickerItemOn : ''} ${isChef ? styles.pickerItemChef : ''}`}
                    >
                      <label className={styles.pickerCheck}>
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={() => toggleMember(r.id)}
                          disabled={isChef}
                        />
                        {r.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.photo} alt={r.nom} className={styles.pickerPhoto} />
                        ) : (
                          <div className={styles.pickerPhotoPh}>{(r.prenom?.[0] || '?').toUpperCase()}</div>
                        )}
                        <div className={styles.pickerInfo}>
                          <div className={styles.pickerName}>{r.prenom} {r.nom}</div>
                          <div className={styles.pickerMeta}>
                            {r.rang || 'Sans rang'}{r.faction ? ' · ' + r.faction : ''}
                          </div>
                        </div>
                      </label>
                      <button
                        type="button"
                        className={`${styles.chefBtn} ${isChef ? styles.chefBtnOn : ''}`}
                        onClick={() => setChef(r.id)}
                      >
                        <Crown size={11} />
                        {isChef ? 'Chef' : 'Définir chef'}
                      </button>
                    </div>
                  );
                })}
                {filteredRecenses.length > 50 && (
                  <div className={styles.pickerMore}>
                    + {filteredRecenses.length - 50} autres. Précise ta recherche.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
