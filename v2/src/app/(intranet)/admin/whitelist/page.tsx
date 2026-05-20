'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ADMIN — Gestion de la whitelist
 * ════════════════════════════════════════════════════════════════
 *
 *  Permet aux Admin techniques d'ajouter/retirer des admins
 *  sans toucher au code.
 *
 *  Stockage : Firebase (sunagakure/admin_whitelist)
 *  Sécurité : protégée par RequireAdminStrict (whitelistés + Kazekage RP)
 *
 *  Note : les admins hardcodés (dans lib/whitelist.ts) sont affichés
 *  mais ne peuvent pas être retirés depuis l'UI.
 * ════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { Plus, Trash2, Shield, Copy, Info } from 'lucide-react';

import { useAdminWhitelist } from '@/hooks/useAdminWhitelist';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { RequireAdminStrict } from '@/components/Require';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { toast } from '@/lib/toast';

import styles from './page.module.css';

export default function AdminWhitelistPage() {
  return (
    <RequireAdminStrict
      fallback={
        <Card title="Accès refusé">
          <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.7 }}>
            Cette page est réservée aux administrateurs techniques de Sunagakure.
          </p>
        </Card>
      }
    >
      <WhitelistManager />
    </RequireAdminStrict>
  );
}

function WhitelistManager() {
  const { user } = useCurrentUser();
  const { entries, loading, saving, addAdmin, removeAdmin } = useAdminWhitelist();

  const [showForm, setShowForm] = useState(false);
  const [newId, setNewId] = useState('');
  const [newNote, setNewNote] = useState('');

  async function handleAdd() {
    const ok = await addAdmin(newId, newNote);
    if (ok) {
      setNewId('');
      setNewNote('');
      setShowForm(false);
    }
  }

  async function handleRemove(discordId: string, note: string) {
    const ok = await confirmAction({
      title: 'Retirer cet admin',
      message: `Retirer définitivement ${note} de la whitelist ? Cette personne perdra son accès admin technique au prochain login.`,
      confirmLabel: 'Retirer',
      variant: 'danger',
    });
    if (!ok) return;
    await removeAdmin(discordId);
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Discord ID copié');
    } catch {
      toast.error('Impossible de copier');
    }
  }

  function fmtDate(ts: number | null): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <>
      <Card
        title="Whitelist Admin"
        subtitle={`${entries.length} administrateur(s) technique(s)`}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus size={14} /> Ajouter un admin
          </Button>
        }
      >
        {/* Info banner */}
        <div className={styles.infoBanner}>
          <Info size={16} />
          <p>
            Les admins inscrits ici ont <strong>accès complet à l&apos;intranet</strong>,
            peuvent modifier toutes les branches, et peuvent gérer cette whitelist.
            <br />
            Pour récupérer un Discord ID : clic droit sur le pseudo dans Discord →
            <em> Copier l&apos;identifiant utilisateur</em> (Mode développeur activé requis).
          </p>
        </div>

        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : entries.length === 0 ? (
          <div className={styles.empty}>
            <Shield size={32} style={{ opacity: 0.3 }} />
            <p>Aucun admin pour le moment.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {entries.map((entry) => {
              const isMe = entry.discordId === user?.discordId;
              const cardClass = [
                styles.adminCard,
                entry.isHardcoded ? styles.adminCardHardcoded : '',
                isMe ? styles.adminCardMe : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div key={entry.discordId} className={cardClass}>
                  {/* Icône */}
                  <div className={styles.iconWrap}>
                    <Shield size={18} />
                  </div>

                  {/* Infos */}
                  <div className={styles.info}>
                    <div className={styles.infoHeader}>
                      <span className={styles.adminName}>{entry.note}</span>
                      {entry.isHardcoded && (
                        <span className={`${styles.badge} ${styles.badgeHardcoded}`}>
                          Hardcodé
                        </span>
                      )}
                      {isMe && (
                        <span className={`${styles.badge} ${styles.badgeMe}`}>Toi</span>
                      )}
                    </div>
                    <div className={styles.idLine}>
                      <span>{entry.discordId}</span>
                      <button
                        type="button"
                        onClick={() => copyId(entry.discordId)}
                        className={styles.copyBtn}
                        title="Copier l'ID"
                        aria-label="Copier l'ID Discord"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                    {!entry.isHardcoded && (
                      <div className={styles.meta}>
                        Ajouté par {entry.addedBy ?? 'inconnu'} · {fmtDate(entry.addedAt)}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className={styles.actions}>
                    {entry.isHardcoded ? (
                      <span className={styles.protectedLabel}>Protégé</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemove(entry.discordId, entry.note)}
                        disabled={saving}
                        className={styles.removeBtn}
                      >
                        <Trash2 size={12} /> Retirer
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modale ajout */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Ajouter un administrateur"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              <Plus size={14} /> Ajouter
            </Button>
          </>
        }
      >
        <div className={styles.formFields}>
          <label>
            <span className={styles.fieldLabel}>Discord ID *</span>
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="1234567890123456789"
              autoFocus
              className={styles.idInput}
            />
            <span className={styles.hint}>
              17 à 19 chiffres. Pour le récupérer : clic droit sur le pseudo dans Discord →
              <em> &quot;Copier l&apos;identifiant utilisateur&quot;</em> (Mode développeur activé).
            </span>
          </label>

          <label>
            <span className={styles.fieldLabel}>Pseudo Discord / Note *</span>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Hyo Ryuzen"
            />
            <span className={styles.hint}>
              Pour pouvoir reconnaître facilement cette personne dans la liste.
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}
