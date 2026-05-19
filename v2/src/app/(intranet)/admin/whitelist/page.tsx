'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ADMIN — Gestion de la whitelist
 * ════════════════════════════════════════════════════════════════
 *
 *  Permet aux Admin techniques d'ajouter/retirer des admins
 *  sans toucher au code.
 *
 *  Stockage : Firebase (admin_whitelist)
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
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: 'rgba(212, 172, 13, 0.08)',
            border: '1px solid rgba(212, 172, 13, 0.25)',
            borderRadius: 4,
            marginBottom: '1.5rem',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: '#d4ac0d' }} />
          <div>
            Les admins inscrits ici ont <strong>accès complet à l'intranet</strong>, peuvent
            modifier toutes les branches, et peuvent gérer cette whitelist.
            <br />
            Pour récupérer un Discord ID : clic droit sur le pseudo dans Discord →
            <em> Copier l'identifiant utilisateur</em> (Mode développeur activé requis).
          </div>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Chargement…</p>
        ) : entries.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
            Aucun admin pour le moment.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map((entry) => {
              const isMe = entry.discordId === user?.discordId;
              return (
                <div
                  key={entry.discordId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr auto',
                    gap: '1rem',
                    alignItems: 'center',
                    padding: '0.85rem 1rem',
                    background: entry.isHardcoded
                      ? 'rgba(212, 172, 13, 0.06)'
                      : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 4,
                  }}
                >
                  {/* Icône */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: entry.isHardcoded
                        ? 'rgba(212, 172, 13, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: entry.isHardcoded ? '#d4ac0d' : '#888',
                    }}
                  >
                    <Shield size={18} />
                  </div>

                  {/* Infos */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <strong style={{ fontSize: 14 }}>{entry.note}</strong>
                      {entry.isHardcoded && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            background: 'rgba(212, 172, 13, 0.15)',
                            color: '#d4ac0d',
                            borderRadius: 3,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Hardcodé
                        </span>
                      )}
                      {isMe && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            background: 'rgba(100, 200, 100, 0.15)',
                            color: '#7dd87d',
                            borderRadius: 3,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Toi
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.6,
                        fontFamily: 'monospace',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>{entry.discordId}</span>
                      <button
                        type="button"
                        onClick={() => copyId(entry.discordId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'inherit',
                          opacity: 0.5,
                          cursor: 'pointer',
                          padding: 2,
                          display: 'flex',
                        }}
                        title="Copier l'ID"
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                    {!entry.isHardcoded && (
                      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                        Ajouté par {entry.addedBy ?? 'inconnu'} · {fmtDate(entry.addedAt)}
                      </div>
                    )}
                  </div>

                  {/* Bouton supprimer */}
                  <div>
                    {entry.isHardcoded ? (
                      <span style={{ fontSize: 11, opacity: 0.4 }}>Protégé</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemove(entry.discordId, entry.note)}
                        disabled={saving}
                        style={{
                          background: 'rgba(220, 70, 70, 0.1)',
                          border: '1px solid rgba(220, 70, 70, 0.3)',
                          color: '#e87878',
                          padding: '6px 10px',
                          borderRadius: 3,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                        }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Discord ID *</span>
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="1234567890123456789"
              autoFocus
              style={{ fontFamily: 'monospace' }}
            />
            <span style={{ fontSize: 11, opacity: 0.5 }}>
              17 à 19 chiffres. Pour le récupérer : clic droit sur le pseudo dans Discord →
              "Copier l'identifiant utilisateur" (Mode développeur activé).
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Pseudo Discord / Note *</span>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Hyo Ryuzen"
            />
            <span style={{ fontSize: 11, opacity: 0.5 }}>
              Pour pouvoir reconnaître facilement cette personne dans la liste.
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}
