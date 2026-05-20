'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ÉQUIPES — Groupes opérationnels (Refonte UX)
 * ════════════════════════════════════════════════════════════════
 *
 * ✨ Carte d'équipe orientée "VISUEL MEMBRES" :
 *   - Emblème + nom + nb membres en header
 *   - Liseré coloré (couleur perso)
 *   - Avatars des membres en GROS (focus visuel)
 *   - Chef en bas, discret, juste un badge couronne
 *
 * 📝 Modale d'édition en 2 colonnes :
 *   - Gauche : nom + emblème (picker + image) + couleur + description
 *   - Droite : composition (checkbox + chef avec couronne)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Users, Crown,
  Shield, Sword, Flame, Zap, Droplet, Wind,
  Star, Skull, Target, Eye, Mountain, Sparkles, Camera,
} from 'lucide-react';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { compressImage } from '@/lib/image';
import type { Equipe } from '@/types/rh';
import type { Recense } from '@/types/recense';

import styles from './page.module.css';

const FB_PATH = 'equipes';

// ─── EMBLÈMES disponibles (Lucide icons) ───
const EMBLEMS = [
  { key: 'shield', Icon: Shield, label: 'Bouclier' },
  { key: 'sword', Icon: Sword, label: 'Épée' },
  { key: 'flame', Icon: Flame, label: 'Feu' },
  { key: 'zap', Icon: Zap, label: 'Foudre' },
  { key: 'droplet', Icon: Droplet, label: 'Eau' },
  { key: 'wind', Icon: Wind, label: 'Vent' },
  { key: 'mountain', Icon: Mountain, label: 'Terre' },
  { key: 'star', Icon: Star, label: 'Étoile' },
  { key: 'skull', Icon: Skull, label: 'Crâne' },
  { key: 'target', Icon: Target, label: 'Cible' },
  { key: 'eye', Icon: Eye, label: 'Œil' },
  { key: 'sparkles', Icon: Sparkles, label: 'Magie' },
] as const;

// ─── COULEURS d'équipe ───
const COLORS = [
  { key: 'gold', label: 'Or', hex: '#d4ac0d' },
  { key: 'red', label: 'Rouge', hex: '#ef4444' },
  { key: 'blue', label: 'Bleu', hex: '#3b82f6' },
  { key: 'purple', label: 'Violet', hex: '#a855f7' },
  { key: 'green', label: 'Vert', hex: '#22c55e' },
  { key: 'orange', label: 'Orange', hex: '#f59e0b' },
  { key: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { key: 'pink', label: 'Rose', hex: '#ec4899' },
] as const;

function getEmblemIcon(key?: string) {
  const found = EMBLEMS.find((e) => e.key === key);
  return found?.Icon ?? Shield;
}

function getColorHex(key?: string): string {
  return COLORS.find((c) => c.key === key)?.hex ?? COLORS[0].hex;
}

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
    setForm({ membres: [], emblem: 'shield', color: 'gold' });
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
    setShowForm(false);
    setEditingId(null);
    setForm({});
    setMemberSearch('');
  }

  function toggleMember(id: number) {
    const current = form.membres || [];
    if (current.includes(id)) {
      // Si on retire le chef, on le démet aussi
      setForm({
        ...form,
        membres: current.filter((x) => x !== id),
        chefId: form.chefId === id ? undefined : form.chefId,
      });
    } else {
      setForm({ ...form, membres: [...current, id] });
    }
  }

  function setChef(id: number) {
    let membres = form.membres || [];
    if (!membres.includes(id)) membres = [...membres, id];
    setForm({ ...form, chefId: id, membres });
  }

  async function handleEmblemImageUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error("Ce n'est pas une image");
      return;
    }
    try {
      const dataUrl = await compressImage(file, 200, 0.8);
      setForm({ ...form, emblemImg: dataUrl });
    } catch {
      toast.error("Impossible de charger l'image");
    }
  }

  async function handleSave() {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    if (!form.chefId) { toast.error("Sélectionne un chef d'équipe"); return; }
    try {
      const list = [...all];
      const now = Date.now();
      let membres = form.membres && form.membres.length > 0 ? form.membres : [form.chefId];
      if (!membres.includes(form.chefId)) membres = [form.chefId, ...membres];

      if (editingId) {
        const idx = list.findIndex((e) => e.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = {
          ...list[idx],
          nom: form.nom!.trim(),
          emblem: form.emblem || 'shield',
          emblemImg: form.emblemImg || undefined,
          color: form.color || 'gold',
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
          emblem: form.emblem || 'shield',
          emblemImg: form.emblemImg || undefined,
          color: form.color || 'gold',
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
    } catch (err) {
      console.error(err);
      toast.error('Erreur');
    }
  }

  async function handleDelete(e: Equipe) {
    const ok = await confirmAction({
      title: "Supprimer l'équipe",
      message: `Supprimer définitivement l'équipe "${e.nom}" ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== e.id));
      toast.success('Supprimée');
    } catch {
      toast.error('Erreur');
    }
  }

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
          <div className={styles.countBadge}>
            <Users size={11} /> {all.length} équipe{all.length > 1 ? 's' : ''}
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
                const allMembres = (eq.membres || [])
                  .map((id) => recensesById.get(id))
                  .filter((r): r is Recense => !!r);
                const EmblemIcon = getEmblemIcon(eq.emblem);
                const colorHex = getColorHex(eq.color);

                return (
                  <article
                    key={eq.id}
                    className={styles.team}
                    onClick={() => openEdit(eq)}
                    style={{ '--team-color': colorHex } as React.CSSProperties}
                  >
                    {/* Header : emblème + nom + compteur */}
                    <div className={styles.teamHeader}>
                      <div className={styles.emblem}>
                        {eq.emblemImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={eq.emblemImg} alt={eq.nom} className={styles.emblemImg} />
                        ) : (
                          <EmblemIcon size={22} />
                        )}
                      </div>
                      <div className={styles.teamInfo}>
                        <h3>{eq.nom}</h3>
                        {eq.desc && <p>{eq.desc}</p>}
                      </div>
                      <div className={styles.teamMeta}>
                        <span className={styles.memberCount}>{allMembres.length}</span>
                        <button
                          className={styles.deleteBtn}
                          onClick={(ev) => { ev.stopPropagation(); handleDelete(eq); }}
                          aria-label="Supprimer"
                        ><Trash2 size={12} /></button>
                      </div>
                    </div>

                    {/* AVATARS DES MEMBRES — focus visuel */}
                    {allMembres.length > 0 && (
                      <div className={styles.avatarStack}>
                        {allMembres.slice(0, 10).map((m) => {
                          const isChef = m.id === eq.chefId;
                          return (
                            <div
                              key={m.id}
                              className={`${styles.avatar} ${isChef ? styles.avatarChef : ''}`}
                              title={`${m.prenom} ${m.nom}${isChef ? ' (Chef)' : ''}`}
                            >
                              {m.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.photo} alt={m.nom} />
                              ) : (
                                <div className={styles.avatarPh}>
                                  {(m.prenom?.[0] || '?').toUpperCase()}
                                </div>
                              )}
                              {isChef && (
                                <div className={styles.crownBadge}>
                                  <Crown size={10} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {allMembres.length > 10 && (
                          <div className={styles.avatarMore}>+{allMembres.length - 10}</div>
                        )}
                      </div>
                    )}

                    {/* Chef discret en bas */}
                    {chef && (
                      <div className={styles.chefRow}>
                        <Crown size={11} />
                        <span className={styles.chefLabel}>Dirigé par</span>
                        <span className={styles.chefName}>{chef.prenom} {chef.nom}</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
      </Card>

      {/* ═══ MODALE D'ÉDITION ═══ */}
      <Modal open={showForm} onClose={closeForm}
        title={editingId ? "Modifier l'équipe" : 'Créer une équipe'} size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formGrid}>
          {/* ─── COLONNE GAUCHE : INFOS ─── */}
          <div className={styles.formCol}>
            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Informations</h4>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Nom de l&apos;équipe *</span>
                <input
                  type="text"
                  value={form.nom ?? ''}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  autoFocus
                  placeholder="Ex: Escouade des Sables"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Description</span>
                <textarea
                  rows={3}
                  value={form.desc ?? ''}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  placeholder="Rôle et missions de l'équipe..."
                />
              </label>
            </div>

            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Couleur</h4>
              <div className={styles.colorGrid}>
                {COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`${styles.colorBtn} ${form.color === c.key ? styles.colorBtnOn : ''}`}
                    style={{ background: c.hex }}
                    onClick={() => setForm({ ...form, color: c.key })}
                    title={c.label}
                    aria-label={c.label}
                  />
                ))}
              </div>
            </div>

            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>Emblème</h4>

              {/* Si une image custom est uploadée, on l'affiche en gros */}
              {form.emblemImg ? (
                <div className={styles.emblemImgPreview}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.emblemImg} alt="Emblème" />
                  <button
                    type="button"
                    className={styles.removeEmblem}
                    onClick={() => setForm({ ...form, emblemImg: undefined })}
                  >
                    <Trash2 size={11} /> Retirer
                  </button>
                </div>
              ) : (
                <div className={styles.emblemGrid}>
                  {EMBLEMS.map((e) => {
                    const Icon = e.Icon;
                    const isOn = form.emblem === e.key;
                    return (
                      <button
                        key={e.key}
                        type="button"
                        className={`${styles.emblemBtn} ${isOn ? styles.emblemBtnOn : ''}`}
                        onClick={() => setForm({ ...form, emblem: e.key })}
                        title={e.label}
                      >
                        <Icon size={20} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Bouton upload image custom */}
              <label className={styles.uploadEmblem}>
                <Camera size={12} /> {form.emblemImg ? 'Changer l\'image' : 'Ou utiliser une image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleEmblemImageUpload(f);
                  }}
                />
              </label>
            </div>
          </div>

          {/* ─── COLONNE DROITE : COMPOSITION ─── */}
          <div className={styles.formCol}>
            <div className={styles.formSection}>
              <h4 className={styles.sectionTitle}>
                Composition ({(form.membres || []).length} membre{(form.membres || []).length > 1 ? 's' : ''})
              </h4>

              <div className={styles.pickerSearchBox}>
                <Search size={12} />
                <input
                  type="text"
                  placeholder="Rechercher un membre..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>

              <p className={styles.pickerHint}>
                Coche pour ajouter à l&apos;équipe · Clique 👑 pour définir le chef
              </p>

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
                        <input
                          type="checkbox"
                          checked={isMember}
                          onChange={() => toggleMember(r.id)}
                          className={styles.pickerCheckbox}
                          id={`m-${r.id}`}
                        />
                        <label htmlFor={`m-${r.id}`} className={styles.pickerLabel}>
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

                        {/* CHEF : badge non-cliquable OU bouton promouvoir */}
                        {isMember && (
                          isChef ? (
                            <div className={styles.chefBadge}>
                              <Crown size={11} /> CHEF
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={styles.promoteBtn}
                              onClick={() => setChef(r.id)}
                              title="Définir comme chef"
                            >
                              <Crown size={11} />
                            </button>
                          )
                        )}
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
        </div>
      </Modal>
    </>
  );
}
