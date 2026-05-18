'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ANNONCES — migrée depuis l'ancien intranet
 * ════════════════════════════════════════════════════════════════
 *
 * Lit/écrit le tableau `annonces` dans Firebase (compatible ancien intranet).
 *
 * Différences clés vs page Patients :
 *   - Données stockées en TABLEAU (pas en objet à clés)
 *   - Pas de dbPush : on lit le tableau, on modifie, on dbSet() le tout
 *   - Tri : épinglées d'abord, puis par date décroissante
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Save, Pin, Calendar, User } from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type Annonce,
  type AnnonceCategorie,
  ANNONCE_CATEGORIES,
  annCatKey,
} from '@/types/annonce';

import styles from './page.module.css';

const FB_PATH = 'annonces';

export default function AnnoncesPage() {
  // ─── Lecture temps réel du tableau d'annonces ───
  const { data, loading } = useFirebaseValue<Annonce[] | null>(FB_PATH);

  // ─── État local ───
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Annonce>>({});

  // ─── Liste triée : épinglées d'abord, puis par date décroissante ───
  const annonces = useMemo(() => {
    if (!data) return [];
    const list = (Array.isArray(data) ? data : Object.values(data)).filter(
      (a): a is Annonce => a !== null && typeof a === 'object'
    );
    return [...list].sort((a, b) => {
      if (a.pin && !b.pin) return -1;
      if (!a.pin && b.pin) return 1;
      return (b.date ?? 0) - (a.date ?? 0);
    });
  }, [data]);

  // ─── Handlers ───
  function openCreate() {
    setEditingId(null);
    setForm({
      cat: 'Information',
      pin: false,
      auteur: 'Ninja',
    });
    setShowForm(true);
  }

  function openEdit(a: Annonce) {
    setEditingId(a.id);
    setForm(a);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  }

  async function handleSave() {
    if (!form.titre?.trim() || !form.contenu?.trim()) {
      toast.error('Le titre et le contenu sont obligatoires');
      return;
    }

    try {
      const current = Array.isArray(data) ? [...data] : [];

      if (editingId) {
        const idx = current.findIndex((a) => a && a.id === editingId);
        if (idx === -1) throw new Error('Annonce introuvable');
        current[idx] = { ...current[idx], ...form } as Annonce;
        await dbSet(FB_PATH, current);
        toast.success('Annonce mise à jour');
      } else {
        const newAnnonce: Annonce = {
          id: Date.now(),
          titre: form.titre!,
          cat: form.cat || 'Information',
          contenu: form.contenu!,
          auteur: form.auteur || 'Ninja',
          pin: !!form.pin,
          date: Date.now(),
        };
        current.push(newAnnonce);
        await dbSet(FB_PATH, current);
        toast.success('Annonce publiée');
      }
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(a: Annonce) {
    const ok = await confirmAction({
      title: "Supprimer l'annonce",
      message: `Supprimer "${a.titre}" ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const current = Array.isArray(data) ? [...data] : [];
      const filtered = current.filter((x) => x && x.id !== a.id);
      await dbSet(FB_PATH, filtered);
      toast.success('Annonce supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Annonces"
        subtitle={`${annonces.length} annonce${annonces.length > 1 ? 's' : ''}`}
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> Nouvelle annonce
          </Button>
        }
      >
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : annonces.length === 0 ? (
          <p className={styles.empty}>Aucune annonce pour l&apos;instant.</p>
        ) : (
          <div className={styles.list}>
            {annonces.map((a) => (
              <article
                key={a.id}
                className={styles.annonce}
                onClick={() => openEdit(a)}
              >
                <header className={styles.annHeader}>
                  <span
                    className={`${styles.catBadge} ${styles[annCatKey(a.cat)]}`}
                  >
                    {a.cat || '—'}
                  </span>
                  {a.pin && (
                    <span className={styles.pinBadge}>
                      <Pin size={11} /> Épinglée
                    </span>
                  )}
                  <span className={styles.meta}>
                    <User size={11} /> {a.auteur || '—'}
                    <span className={styles.dot}>·</span>
                    <Calendar size={11} /> {fmtDate(a.date)}
                  </span>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(a);
                    }}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </header>
                <h3 className={styles.titleH3}>{a.titre || '(Sans titre)'}</h3>
                <p className={styles.content}>{a.contenu}</p>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Modifier l'annonce" : 'Nouvelle annonce'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeForm}>
              Annuler
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Publier
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            Titre *
            <input
              type="text"
              value={form.titre ?? ''}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              autoFocus
              maxLength={120}
            />
          </label>

          <div className={styles.row}>
            <label>
              Catégorie
              <select
                value={form.cat ?? 'Information'}
                onChange={(e) =>
                  setForm({ ...form, cat: e.target.value as AnnonceCategorie })
                }
              >
                {ANNONCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Auteur
              <input
                type="text"
                value={form.auteur ?? ''}
                onChange={(e) => setForm({ ...form, auteur: e.target.value })}
              />
            </label>
          </div>

          <label>
            Contenu *
            <textarea
              rows={6}
              value={form.contenu ?? ''}
              onChange={(e) => setForm({ ...form, contenu: e.target.value })}
              placeholder="Écris ton annonce ici…"
            />
          </label>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={!!form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.checked })}
            />
            <span>📌 Épingler en tête de liste</span>
          </label>
        </div>
      </Modal>
    </>
  );
}

// ─── Helpers ───

function fmtDate(ts: number | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
