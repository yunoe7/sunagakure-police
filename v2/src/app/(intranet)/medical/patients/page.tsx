'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  PAGE DE RÉFÉRENCE — Patients (module Médical)
 * ════════════════════════════════════════════════════════════════
 *
 * Permissions :
 * - Voir : tout le monde (connecté)
 * - Créer / modifier / supprimer : TOUS LES MEMBRES MÉDECIN + Admin
 *   (action opérationnelle quotidienne)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Search, Plus, Trash2, Save } from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbPush, dbUpdate, dbRemove, serverTimestamp } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RequireMembreBranche } from '@/components/Require';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import type { Patient } from '@/types/medical';

import styles from './page.module.css';

const FB_PATH = 'medical/patients';

export default function PatientsPage() {
  const { can } = useCurrentUser();
  const canEdit = can.membreBranche('medecin');

  const { data, loading } = useFirebaseValue<Record<string, Patient>>(FB_PATH);

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Patient>>({});

  const patients = useMemo(() => {
    if (!data) return [];
    const arr = Object.entries(data).map(([id, p]) => ({ ...p, id }));
    const q = search.trim().toLowerCase();
    return arr
      .filter((p) => {
        if (!q) return true;
        return (
          p.nom?.toLowerCase().includes(q) ||
          p.prenom?.toLowerCase().includes(q) ||
          p.village?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  }, [data, search]);

  function openCreate() {
    setEditingId(null);
    setForm({});
    setShowForm(true);
  }

  function openEdit(p: Patient) {
    if (!canEdit) return;
    setEditingId(p.id);
    setForm(p);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  }

  async function handleSave() {
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    try {
      if (editingId) {
        await dbUpdate(`${FB_PATH}/${editingId}`, {
          ...form,
          updatedAt: serverTimestamp(),
        });
        toast.success('Patient mis à jour');
      } else {
        await dbPush(FB_PATH, {
          ...form,
          createdAt: serverTimestamp(),
        });
        toast.success('Patient créé');
      }
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(p: Patient) {
    const ok = await confirmAction({
      title: 'Supprimer le patient',
      message: `Confirmer la suppression de ${p.nom}${p.prenom ? ' ' + p.prenom : ''} ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await dbRemove(`${FB_PATH}/${p.id}`);
      toast.success('Patient supprimé');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  return (
    <>
      <Card
        title="Patients"
        subtitle={`${patients.length} enregistrement${patients.length > 1 ? 's' : ''}`}
        actions={
          <>
            <div className={styles.searchBox}>
              <Search size={14} />
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <RequireMembreBranche branche="medecin">
              <Button onClick={openCreate}>
                <Plus size={14} /> Nouveau
              </Button>
            </RequireMembreBranche>
          </>
        }
      >
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : patients.length === 0 ? (
          <p className={styles.empty}>
            {search ? 'Aucun résultat.' : 'Aucun patient enregistré.'}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Prénom</th>
                <th>Âge</th>
                <th>Village</th>
                <th>Groupe</th>
                {canEdit && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openEdit(p)}
                  style={canEdit ? { cursor: 'pointer' } : { cursor: 'default' }}
                >
                  <td>{p.nom}</td>
                  <td>{p.prenom ?? '—'}</td>
                  <td>{p.age ?? '—'}</td>
                  <td>{p.village ?? '—'}</td>
                  <td>{p.groupeSanguin ?? '—'}</td>
                  {canEdit && (
                    <td>
                      <button
                        className={styles.iconBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p);
                        }}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Modifier le patient' : 'Nouveau patient'}
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>
              Annuler
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Nom *
            <input
              type="text"
              value={form.nom ?? ''}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              autoFocus
            />
          </label>
          <label>
            Prénom
            <input
              type="text"
              value={form.prenom ?? ''}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
            />
          </label>
          <div className={styles.row}>
            <label>
              Âge
              <input
                type="number"
                value={form.age ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    age: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </label>
            <label>
              Groupe sanguin
              <select
                value={form.groupeSanguin ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    groupeSanguin: e.target.value as Patient['groupeSanguin'],
                  })
                }
              >
                <option value="">—</option>
                {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Village
            <input
              type="text"
              value={form.village ?? ''}
              onChange={(e) => setForm({ ...form, village: e.target.value })}
            />
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
