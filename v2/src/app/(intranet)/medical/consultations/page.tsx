'use client';

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Search, Stethoscope, Calendar, Clock,
  Play, CheckCircle2, XCircle,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Consultation, type ConsultStatut,
  CONSULT_STATUT_LABEL, fmtDateFR,
} from '@/types/medical';

import styles from './page.module.css';

const FB_PATH = 'hospital_consultations';
const CURRENT_USER = 'Ninja';

type Tab = 'all' | ConsultStatut;

export default function ConsultationsPage() {
  const { data, loading } = useFirebaseValue<Consultation[] | null>(FB_PATH);
  const [tab, setTab] = useState<Tab>('prevue');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Consultation>>({});

  const all = useMemo<Consultation[]>(
    () => (Array.isArray(data) ? data : data ? Object.values(data) : []).filter(
      (c): c is Consultation => c !== null && typeof c === 'object' && !!c.id
    ),
    [data]
  );

  const counts = useMemo(() => {
    const c = { all: all.length, prevue: 0, encours: 0, terminee: 0, annulee: 0 };
    for (const x of all) c[x.statut as keyof typeof c]++;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    let list = all;
    if (tab !== 'all') list = list.filter((c) => c.statut === tab);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        ((c.patient || '') + ' ' + (c.medecin || '') + ' ' + (c.motif || ''))
          .toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b.createdAt ?? b.id) - (a.createdAt ?? a.id));
  }, [all, tab, search]);

  function openCreate() {
    setEditingId(null);
    setForm({ statut: 'prevue', medecin: CURRENT_USER });
    setShowForm(true);
  }
  function openEdit(c: Consultation) {
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
        list[idx] = { ...list[idx], ...form, id: editingId } as Consultation;
      } else {
        list.push({
          id: now,
          patient: form.patient!.trim(),
          medecin: form.medecin?.trim() || CURRENT_USER,
          motif: form.motif!.trim(),
          date: form.date || undefined,
          heure: form.heure || undefined,
          statut: form.statut || 'prevue',
          diagnostic: form.diagnostic?.trim() || undefined,
          prescription: form.prescription?.trim() || undefined,
          notes: form.notes?.trim() || undefined,
          createdAt: now,
        });
      }
      await dbSet(FB_PATH, list);
      toast.success(editingId ? 'Consultation mise à jour' : 'Consultation enregistrée');
      closeForm();
    } catch (err) {
      console.error(err); toast.error('Erreur');
    }
  }

  async function handleDelete(c: Consultation) {
    const ok = await confirmAction({
      title: 'Supprimer la consultation',
      message: `Supprimer la consultation de ${c.patient} ?`,
      confirmLabel: 'Supprimer', variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet(FB_PATH, all.filter((x) => x.id !== c.id));
      toast.success('Supprimée');
    } catch { toast.error('Erreur'); }
  }

  async function setStatut(c: Consultation, statut: ConsultStatut) {
    try {
      const list = [...all];
      const idx = list.findIndex((x) => x.id === c.id);
      if (idx === -1) return;
      list[idx] = { ...list[idx], statut };
      await dbSet(FB_PATH, list);
      toast.success(`Consultation → ${CONSULT_STATUT_LABEL[statut]}`);
    } catch { toast.error('Erreur'); }
  }

  return (
    <>
      <Card
        title="Consultations"
        subtitle="Hôpital de Sunagakure"
        actions={<Button onClick={openCreate}><Plus size={14} /> Nouvelle consultation</Button>}
      >
        <div className={styles.tabs}>
          {(['prevue', 'encours', 'terminee', 'annulee', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              <span>{t === 'all' ? 'Toutes' : CONSULT_STATUT_LABEL[t as ConsultStatut]}</span>
              <span className={styles.tabCount}>{counts[t]}</span>
            </button>
          ))}
        </div>

        <div className={styles.searchBox}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Patient, médecin, motif…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : visible.length === 0 ? (
          <div className={styles.empty}>
            <Stethoscope size={32} style={{ opacity: 0.3 }} />
            <p>Aucune consultation pour ces critères.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {visible.map((c) => (
              <article key={c.id} className={`${styles.consult} ${styles[`st-${c.statut}`]}`}>
                <div className={styles.consultHeader}>
                  <span className={`${styles.statutChip} ${styles[`chip-${c.statut}`]}`}>
                    {CONSULT_STATUT_LABEL[c.statut]}
                  </span>
                  {c.date && (
                    <span className={styles.dateChip}>
                      <Calendar size={11} /> {fmtDateFR(c.date)}
                      {c.heure && (
                        <>
                          <span style={{ opacity: 0.4, margin: '0 4px' }}>·</span>
                          <Clock size={11} /> {c.heure}
                        </>
                      )}
                    </span>
                  )}
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(c)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className={styles.consultBody} onClick={() => openEdit(c)}>
                  <h3>{c.patient}</h3>
                  <p className={styles.motif}>{c.motif}</p>
                  <div className={styles.meta}>
                    {c.medecin && <span>👨‍⚕️ Dr. {c.medecin}</span>}
                    {c.diagnostic && <span>📋 {c.diagnostic}</span>}
                  </div>
                </div>

                {(c.statut === 'prevue' || c.statut === 'encours') && (
                  <div className={styles.actions}>
                    {c.statut === 'prevue' && (
                      <Button size="sm" onClick={() => setStatut(c, 'encours')}>
                        <Play size={12} /> Démarrer
                      </Button>
                    )}
                    {c.statut === 'encours' && (
                      <Button size="sm" onClick={() => setStatut(c, 'terminee')}>
                        <CheckCircle2 size={12} /> Terminer
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setStatut(c, 'annulee')}>
                      <XCircle size={12} /> Annuler
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier la consultation' : 'Nouvelle consultation'}
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
              Médecin
              <input
                type="text"
                value={form.medecin ?? ''}
                onChange={(e) => setForm({ ...form, medecin: e.target.value })}
              />
            </label>
          </div>
          <label>
            Motif *
            <input
              type="text"
              value={form.motif ?? ''}
              onChange={(e) => setForm({ ...form, motif: e.target.value })}
              placeholder="Ex: Bilan annuel, fièvre…"
            />
          </label>
          <div className={styles.row3}>
            <label>
              Date
              <input type="date" value={form.date ?? ''}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>
              Heure
              <input type="time" value={form.heure ?? ''}
                onChange={(e) => setForm({ ...form, heure: e.target.value })} />
            </label>
            <label>
              Statut
              <select
                value={form.statut ?? 'prevue'}
                onChange={(e) => setForm({ ...form, statut: e.target.value as ConsultStatut })}
              >
                {(['prevue', 'encours', 'terminee', 'annulee'] as ConsultStatut[]).map((s) => (
                  <option key={s} value={s}>{CONSULT_STATUT_LABEL[s]}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Diagnostic
            <input type="text" value={form.diagnostic ?? ''}
              onChange={(e) => setForm({ ...form, diagnostic: e.target.value })} />
          </label>
          <label>
            Prescription
            <textarea rows={3} value={form.prescription ?? ''}
              onChange={(e) => setForm({ ...form, prescription: e.target.value })} />
          </label>
          <label>
            Notes
            <textarea rows={3} value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
      </Modal>
    </>
  );
}
