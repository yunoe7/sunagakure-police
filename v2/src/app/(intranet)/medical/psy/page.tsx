'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page PSY — Salon psychologique
 * ════════════════════════════════════════════════════════════════
 *
 * Stockage : sunagakure/hospital_psy (TABLEAU)
 *
 * Suivi des consultations psychologiques avec niveau de sévérité
 * et planification du prochain rendez-vous.
 *
 * ⚠️ Données sensibles : le contenu des notes est confidentiel.
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Brain, Calendar, AlertTriangle,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type ConsultPsy, type PsySeverite,
  PSY_SEVERITE_LABEL, fmtDateFR,
} from '@/types/medical';

import styles from './page.module.css';

const FB_PATH = 'hospital_psy';
type Filter = 'all' | PsySeverite;

export default function PsyPage() {
  const CURRENT_USER = useCurrentUser().displayName;
  const { data, loading } = useFirebaseValue<ConsultPsy[] | null>(FB_PATH);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<ConsultPsy>>({});

  const all = useMemo<ConsultPsy[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (c): c is ConsultPsy => c !== null && typeof c === 'object' && !!c.id
    ),
    [data]
  );

  const visible = useMemo(() => {
    let list = all;
    if (filter !== 'all') list = list.filter((c) => c.severite === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        ((c.patient || '') + ' ' + (c.psychologue || '') + ' ' + (c.motif || '') + ' ' + (c.diagnostic || ''))
          .toLowerCase().includes(q)
      );
    }
    // Tri : sévérité décroissante d'abord, puis date récente
    return [...list].sort((a, b) => {
      const order = { critique: 0, severe: 1, modere: 2, leger: 3 };
      const sa = order[a.severite] ?? 4;
      const sb = order[b.severite] ?? 4;
      if (sa !== sb) return sa - sb;
      return (b.createdAt ?? b.id) - (a.createdAt ?? a.id);
    });
  }, [all, filter, search]);

  const stats = useMemo(() => {
    const total = all.length;
    const critique = all.filter((c) => c.severite === 'critique').length;
    const severe = all.filter((c) => c.severite === 'severe').length;
    const aVenir = all.filter((c) => {
      if (!c.prochainRdv) return false;
      return new Date(c.prochainRdv).getTime() > Date.now();
    }).length;
    return { total, critique, severe, aVenir };
  }, [all]);

  function openCreate() {
    setEditingId(null);
    setForm({ severite: 'modere', psychologue: CURRENT_USER });
    setShowForm(true);
  }
  function openEdit(c: ConsultPsy) {
    setEditingId(c.id); setForm(c); setShowForm(true);
  }
  function closeForm() {
    setShowForm(false); setEditingId(null); setForm({});
  }

  async function handleSave() {
    if (!form.patient?.trim() || !form.motif?.trim()) {
      toast.error('Patient et motif sont obligatoires'); return;
    }
    try {
      const list = [...all];
      const now = Date.now();
      if (editingId) {
        const idx = list.findIndex((c) => c.id === editingId);
        if (idx === -1) throw new Error('Introuvable');
        list[idx] = { ...list[idx], ...form, id: editingId } as ConsultPsy;
      } else {
        list.push({
          id: now,
          patient: form.patient!.trim(),
          psychologue: form.psychologue?.trim() || CURRENT_USER,
          motif: form.motif!.trim(),
          date: form.date || undefined,
          severite: form.severite || 'modere',
          diagnostic: form.diagnostic?.trim() || undefined,
          therapie: form.therapie?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          prochainRdv: form.prochainRdv || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Mise à jour' : 'Consultation enregistrée');
      closeForm();
    } catch (err) {
      console.error(err); toast.error('Erreur');
    }
  }

  async function handleDelete(c: ConsultPsy) {
    const ok = await confirmAction({
      title: 'Supprimer la consultation',
      message: `Supprimer la consultation psy de ${c.patient} ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== c.id));
      toast.success('Supprimée');
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Salon psy"
        subtitle="Suivi psychologique — données confidentielles"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvelle consultation</Button>}
      >
        <div className={styles.statGrid}>
          <div className={`${styles.statCard} ${styles.scPurple}`}>
            <Brain size={16} />
            <div className={styles.statVal}>{stats.total}</div>
            <div className={styles.statLbl}>Total suivis</div>
          </div>
          <div className={`${styles.statCard} ${styles.scWarn}`}>
            <AlertTriangle size={16} />
            <div className={styles.statVal}>{stats.severe}</div>
            <div className={styles.statLbl}>Sévère</div>
          </div>
          <div className={`${styles.statCard} ${styles.scDanger}`}>
            <AlertTriangle size={16} />
            <div className={styles.statVal}>{stats.critique}</div>
            <div className={styles.statLbl}>Critique</div>
          </div>
          <div className={`${styles.statCard} ${styles.scBlue}`}>
            <Calendar size={16} />
            <div className={styles.statVal}>{stats.aVenir}</div>
            <div className={styles.statLbl}>RDV à venir</div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Patient, psychologue, motif…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.filters}>
            <button
              className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('all')}
            >
              Tous
            </button>
            {(['leger', 'modere', 'severe', 'critique'] as PsySeverite[]).map((s) => (
              <button
                key={s}
                className={`${styles.fbtn} ${styles[`fbtn-${s}`]} ${filter === s ? styles.fbtnOn : ''}`}
                onClick={() => setFilter(s)}
              >
                {PSY_SEVERITE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Brain size={32} style={{ opacity: 0.3 }} />
            <p>Aucune consultation pour ces critères.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map((c) => (
              <article
                key={c.id}
                className={`${styles.consult} ${styles[`sv-${c.severite}`]}`}
                onClick={() => openEdit(c)}
              >
                <div className={styles.consultHeader}>
                  <span className={`${styles.severiteChip} ${styles[`chip-${c.severite}`]}`}>
                    {c.severite === 'critique' && <AlertTriangle size={11} />}
                    {PSY_SEVERITE_LABEL[c.severite]}
                  </span>
                  {c.date && (
                    <span className={styles.dateChip}>
                      <Calendar size={11} /> {fmtDateFR(c.date)}
                    </span>
                  )}
                  {c.prochainRdv && (
                    <span className={styles.rdvChip}>
                      Prochain : {fmtDateFR(c.prochainRdv)}
                    </span>
                  )}
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(c);
                    }}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className={styles.consultBody}>
                  <h3>{c.patient}</h3>
                  <p className={styles.motif}>{c.motif}</p>
                  <div className={styles.meta}>
                    {c.psychologue && <span>🧠 {c.psychologue}</span>}
                    {c.diagnostic && <span>📋 {c.diagnostic}</span>}
                    {c.therapie && <span>💬 {c.therapie}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier la consultation psy' : 'Nouvelle consultation psy'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>Annuler</Button>
            <Button onClick={handleSave}><Save size={14} /> Enregistrer</Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <div className={styles.row}>
            <label>
              Patient *
              <input
                type="text"
                value={form.patient ?? ''}
                onChange={(e) => setForm({ ...form, patient: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              Psychologue
              <input
                type="text"
                value={form.psychologue ?? ''}
                onChange={(e) => setForm({ ...form, psychologue: e.target.value })}
              />
            </label>
          </div>

          <label>
            Motif de consultation *
            <input
              type="text"
              value={form.motif ?? ''}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              placeholder="Ex: Stress post-mission, anxiété..."
            />
          </label>

          <div className={styles.row3}>
            <label>
              Date
              <input
                type="date"
                value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label>
              Sévérité
              <select
                value={form.severite ?? 'modere'}
                onChange={(e) => setForm({ ...form, severite: e.target.value as PsySeverite })}
              >
                {(['leger', 'modere', 'severe', 'critique'] as PsySeverite[]).map((s) => (
                  <option key={s} value={s}>{PSY_SEVERITE_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label>
              Prochain RDV
              <input
                type="date"
                value={form.prochainRdv ?? ''}
                onChange={(e) => setForm({ ...form, prochainRdv: e.target.value })}
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              Diagnostic
              <input
                type="text"
                value={form.diagnostic ?? ''}
                onChange={(e) => setForm({ ...form, diagnostic: e.target.value })}
              />
            </label>
            <label>
              Type de thérapie proposée
              <input
                type="text"
                value={form.therapie ?? ''}
                onChange={(e) => setForm({ ...form, therapie: e.target.value })}
                placeholder="TCC, méditation, hypnose..."
              />
            </label>
          </div>

          <label>
            Notes confidentielles
            <textarea
              rows={4}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Observations, ressentis du patient, progression..."
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
