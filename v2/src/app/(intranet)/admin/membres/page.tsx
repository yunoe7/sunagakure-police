'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ADMIN — Liste des membres + gestion des accès
 * ════════════════════════════════════════════════════════════════
 *
 *  Affiche tous les utilisateurs connectés (members/ via auth.ts).
 *
 *  🆕 Bouton « Gérer les accès » par membre → modale qui permet
 *     d'attribuer, EN PLUS de Discord (modèle ajout) :
 *       - branches (membre), gérant/co-gérant de branche
 *       - rang ninja, admin technique  → overrides/{id}
 *       - grade Kōeki                  → koeki/grades/{id}
 *     Indépendant de Discord (qui propage mal ses rôles via OAuth).
 *
 *  Sécurité : RequireAdminStrict (admins techniques uniquement).
 *  ⚠️ Donner l'admin ici accorde Maintenance/Whitelist — à protéger
 *     aussi via les règles Firebase sur overrides/.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useMemo } from 'react';
import {
  Search, Users, ShieldCheck, Activity, Settings2, Save, X,
} from 'lucide-react';

import { useMembers, type Member } from '@/hooks/useMembers';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { RequireAdminStrict } from '@/components/Require';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { dbSet } from '@/lib/db';
import { logAction } from '@/lib/audit';
import { toast } from '@/lib/toast';
import {
  KOEKI_GRADES_PATH,
  KOEKI_GRADE_OPTIONS,
  gradeLabel,
  type KoekiGradeOverride,
} from '@/types/koekiGrades';
import {
  OVERRIDES_PATH,
  BRANCHE_OPTIONS,
  RANG_OPTIONS,
  brancheLabel,
  normalizeOverride,
  type RoleOverride,
} from '@/types/roleOverrides';
import type { KoekiGrade } from '@/lib/roles';

export default function AdminMembresPage() {
  return (
    <RequireAdminStrict
      fallback={
        <Card title="Accès refusé">
          <p style={{ padding: '2rem', textAlign: 'center', opacity: 0.7 }}>
            Cette page est réservée aux administrateurs techniques.
          </p>
        </Card>
      }
    >
      <MembresManager />
    </RequireAdminStrict>
  );
}

function MembresManager() {
  const { members, loading, stats } = useMembers();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);

  // Overrides + grades Kōeki en base (lecture globale)
  const { data: overridesData } = useFirebaseValue<Record<string, RoleOverride> | null>(
    OVERRIDES_PATH
  );
  const { data: gradesData } = useFirebaseValue<Record<string, KoekiGradeOverride> | null>(
    KOEKI_GRADES_PATH
  );

  const sorted = useMemo(() => {
    const list = [...members];
    list.sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return b.lastLogin - a.lastLogin;
    });
    return list;
  }, [members]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (m) =>
        (m.username || '').toLowerCase().includes(q) ||
        (m.rangNom || '').toLowerCase().includes(q) ||
        (m.clan || '').toLowerCase().includes(q) ||
        m.branches.some((b) => b.includes(q))
    );
  }, [sorted, search]);

  function fmtRelative(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (min < 1) return 'à l\'instant';
    if (min < 60) return `il y a ${min} min`;
    if (hr < 24) return `il y a ${hr}h`;
    if (days < 7) return `il y a ${days}j`;
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  }

  function isOnline(ts: number): boolean {
    return Date.now() - ts < 5 * 60 * 1000;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <StatBox icon={<Users size={18} />} label="Total membres" value={stats.total} color="#d4ac0d" />
        <StatBox icon={<Activity size={18} />} label="Actifs (7j)" value={stats.actifs7j} color="#7dd87d" />
        <StatBox icon={<Activity size={18} />} label="Actifs (30j)" value={stats.actifs30j} color="#60a5fa" />
        <StatBox icon={<ShieldCheck size={18} />} label="Admins" value={stats.admins} color="#fbbf24" />
      </div>

      <Card
        title="Membres connectés"
        subtitle={`${visible.length} ninja(s)${search ? ` (filtré sur ${members.length})` : ''}`}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 6,
            marginBottom: 14,
          }}
        >
          <Search size={14} style={{ opacity: 0.5 }} />
          <input
            type="text"
            placeholder="Rechercher par pseudo, rang, branche, clan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: 'inherit', outline: 'none', fontSize: 13,
            }}
          />
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>Chargement…</p>
        ) : visible.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
            {search ? 'Aucun membre correspondant.' : 'Aucun membre enregistré pour le moment.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visible.map((m) => (
              <MemberRow
                key={m.discordId}
                member={m}
                isOnline={isOnline(m.lastLogin)}
                lastLoginText={fmtRelative(m.lastLogin)}
                koekiGrade={gradesData?.[m.discordId]?.grade ?? null}
                override={overridesData?.[m.discordId] ?? null}
                onManage={() => setEditing(m)}
              />
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <ManageAccessModal
          member={editing}
          override={overridesData?.[editing.discordId] ?? null}
          koekiGrade={gradesData?.[editing.discordId]?.grade ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ─── Modale de gestion des accès ─────────────────────────────────

function ManageAccessModal({
  member, override, koekiGrade, onClose,
}: {
  member: Member;
  override: RoleOverride | null;
  koekiGrade: KoekiGrade | null;
  onClose: () => void;
}) {
  const { displayName, id: myId } = useCurrentUser();
  const init = normalizeOverride(override ?? {});

  const [branches, setBranches] = useState<string[]>(init.branches ?? []);
  const [gerantDe, setGerantDe] = useState<string[]>(init.gerantDe ?? []);
  const [coGerantDe, setCoGerantDe] = useState<string[]>(init.coGerantDe ?? []);
  const [rangNiveau, setRangNiveau] = useState<number | null>(init.rangNiveau ?? null);
  const [isAdmin, setIsAdmin] = useState<boolean>(init.isAdmin === true);
  const [grade, setGrade] = useState<KoekiGrade | null>(koekiGrade);
  const [saving, setSaving] = useState(false);

  function toggle(list: string[], setList: (v: string[]) => void, slug: string) {
    setList(list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: RoleOverride = {
        branches, gerantDe, coGerantDe,
        rangNiveau: rangNiveau ?? null,
        isAdmin,
        setBy: displayName,
        setAt: Date.now(),
      };
      await dbSet(`${OVERRIDES_PATH}/${member.discordId}`, payload);

      // Grade Kōeki (chemin séparé)
      const gradePayload: KoekiGradeOverride = {
        grade, setBy: displayName, setAt: Date.now(),
      };
      await dbSet(`${KOEKI_GRADES_PATH}/${member.discordId}`, gradePayload);

      logAction({
        who: displayName,
        whoId: myId ?? null,
        action: 'update',
        target: 'roles:override',
        targetId: member.discordId,
        detail:
          `Accès de ${member.username} mis à jour — ` +
          `branches: [${branches.join(', ') || '—'}], ` +
          `gérant: [${gerantDe.join(', ') || '—'}], ` +
          `co-gérant: [${coGerantDe.join(', ') || '—'}], ` +
          `rang: ${rangNiveau ?? '—'}, admin: ${isAdmin}, ` +
          `Kōeki: ${grade ? gradeLabel(grade) : '—'}`,
      });

      toast.success(`Accès de ${member.username} enregistrés`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
    color: 'rgba(212,180,74,0.85)', fontWeight: 700,
    fontFamily: 'Share Tech Mono, monospace', marginBottom: 8, display: 'block',
  };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: 0.3, fontWeight: 600,
    border: active ? '1px solid rgba(212,172,13,0.6)' : '1px solid rgba(255,255,255,0.12)',
    background: active
      ? 'linear-gradient(180deg, rgba(212,172,13,0.22), rgba(212,172,13,0.08))'
      : 'rgba(255,255,255,0.03)',
    color: active ? '#f0d875' : 'rgba(255,255,255,0.6)',
    transition: 'all 0.12s',
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Gérer les accès — ${member.username}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            <X size={14} /> Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: 0 }}>
          Ces accès <strong>s'ajoutent</strong> à ceux donnés par Discord (ils n'en retirent
          aucun). Effet immédiat après un rechargement de la page côté membre.
        </p>

        {/* Branches */}
        <div>
          <span style={labelStyle}>Branches (membre)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BRANCHE_OPTIONS.map((b) => (
              <button
                key={b.slug}
                type="button"
                style={chip(branches.includes(b.slug))}
                onClick={() => toggle(branches, setBranches, b.slug)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Gérant */}
        <div>
          <span style={labelStyle}>Gérant de</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BRANCHE_OPTIONS.map((b) => (
              <button
                key={b.slug}
                type="button"
                style={chip(gerantDe.includes(b.slug))}
                onClick={() => toggle(gerantDe, setGerantDe, b.slug)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Co-gérant */}
        <div>
          <span style={labelStyle}>Co-Gérant de</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BRANCHE_OPTIONS.map((b) => (
              <button
                key={b.slug}
                type="button"
                style={chip(coGerantDe.includes(b.slug))}
                onClick={() => toggle(coGerantDe, setCoGerantDe, b.slug)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rang + Kōeki côte à côte */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <span style={labelStyle}>Rang ninja (minimum imposé)</span>
            <select
              value={rangNiveau ?? ''}
              onChange={(e) => setRangNiveau(e.target.value ? Number(e.target.value) : null)}
              style={selectStyle}
            >
              <option value="" style={optStyle}>Aucun (laisser Discord)</option>
              {RANG_OPTIONS.map((r) => (
                <option key={r.niveau} value={r.niveau} style={optStyle}>
                  {r.nom} (niv. {r.niveau})
                </option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>Grade Kōeki</span>
            <select
              value={grade ?? ''}
              onChange={(e) => setGrade((e.target.value || null) as KoekiGrade | null)}
              style={selectStyle}
            >
              <option value="" style={optStyle}>Aucun</option>
              {KOEKI_GRADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={optStyle}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Admin technique */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 8,
            background: isAdmin ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.03)',
            border: isAdmin ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: isAdmin ? '#fca5a5' : '#fff' }}>
              Administrateur technique
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              ⚠️ Donne accès à Maintenance et Whitelist. À n'accorder qu'avec prudence.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAdmin((v) => !v)}
            style={{
              position: 'relative', width: 46, height: 25, borderRadius: 13,
              border: 'none', cursor: 'pointer', flexShrink: 0,
              background: isAdmin ? '#f87171' : 'rgba(255,255,255,0.18)',
              transition: 'background 0.15s',
            }}
            aria-label="Activer admin"
          >
            <span
              style={{
                position: 'absolute', top: 3, left: isAdmin ? 24 : 3,
                width: 19, height: 19, borderRadius: '50%', background: '#fff',
                transition: 'left 0.15s',
              }}
            />
          </button>
        </div>
      </div>
    </Modal>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  padding: '9px 12px', background: 'rgba(0,0,0,0.4)', color: '#e8dcc0',
  border: '1px solid rgba(180,140,20,0.35)', borderRadius: 6, outline: 'none',
  fontSize: 13, fontFamily: 'Barlow, sans-serif', cursor: 'pointer',
};
const optStyle: React.CSSProperties = { background: '#1a1410', color: '#e8dcc0' };

// ─── Ligne membre ────────────────────────────────────────────────

function MemberRow({
  member, isOnline, lastLoginText, koekiGrade, override, onManage,
}: {
  member: Member;
  isOnline: boolean;
  lastLoginText: string;
  koekiGrade: KoekiGrade | null;
  override: RoleOverride | null;
  onManage: () => void;
}) {
  const m = member;
  const ov = normalizeOverride(override ?? {});
  const hasExtra =
    (ov.branches?.length ?? 0) > 0 ||
    (ov.gerantDe?.length ?? 0) > 0 ||
    (ov.coGerantDe?.length ?? 0) > 0 ||
    typeof ov.rangNiveau === 'number' ||
    ov.isAdmin === true ||
    !!koekiGrade;

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 12,
        alignItems: 'center', padding: '10px 14px',
        background: m.isAdmin ? 'rgba(212, 172, 13, 0.05)' : 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 6,
      }}
    >
      <div style={{ position: 'relative', width: 40, height: 40 }}>
        {m.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.avatarUrl}
            alt={m.username}
            style={{
              width: 40, height: 40, borderRadius: '50%', objectFit: 'cover',
              border: '1px solid rgba(212, 172, 13, 0.25)',
            }}
          />
        ) : (
          <div
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14, color: '#fff',
            }}
          >
            {m.username[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        {isOnline && (
          <div
            style={{
              position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
              borderRadius: '50%', background: '#7dd87d',
              border: '2px solid #14162a', boxShadow: '0 0 6px rgba(125, 216, 125, 0.6)',
            }}
            title="En ligne"
          />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, color: '#fff' }}>{m.username}</strong>
          {m.isAdmin && <Badge color="#d4ac0d" label="Admin" />}
          {ov.isAdmin && !m.isAdmin && <Badge color="#f87171" label="Admin (base)" />}
          {m.isStaff && <Badge color="#a78bfa" label="Staff" />}
          {m.isKazekage && <Badge color="#f87171" label="Kazekage" />}
          {koekiGrade && <Badge color="#34d399" label={gradeLabel(koekiGrade)} />}
        </div>
        <div
          style={{
            fontSize: 11, color: 'rgba(255,255,255,0.55)',
            display: 'flex', gap: 6, flexWrap: 'wrap',
          }}
        >
          <span>{m.rangNom ?? 'Sans rang'}</span>
          {m.branches.length > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{m.branches.join(', ')}</span>
            </>
          )}
          {(ov.branches?.length ?? 0) > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ color: '#7dd87d' }}>
                +{(ov.branches ?? []).map(brancheLabel).join(', ')}
              </span>
            </>
          )}
          {m.clan && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{m.clan}</span>
            </>
          )}
        </div>
        <div
          style={{
            fontSize: 10, opacity: 0.4, marginTop: 3,
            fontFamily: 'Share Tech Mono, monospace',
          }}
        >
          ID {m.discordId} · Connecté {lastLoginText}
        </div>
      </div>

      <div>
        <Button size="sm" variant={hasExtra ? undefined : 'outline'} onClick={onManage}>
          <Settings2 size={13} /> Gérer les accès
        </Button>
      </div>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        fontSize: 9, padding: '2px 6px', background: `${color}1f`, color,
        border: `1px solid ${color}50`, borderRadius: 3, textTransform: 'uppercase',
        letterSpacing: '0.05em', fontWeight: 700,
        fontFamily: 'Share Tech Mono, monospace',
      }}
    >
      {label}
    </span>
  );
}

function StatBox({
  icon, label, value, color,
}: {
  icon: React.ReactNode; label: string; value: number; color: string;
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.1))',
        border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: 6, background: `${color}22`, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <div
          style={{
            fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)', fontFamily: 'Share Tech Mono, monospace',
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          fontSize: 28, fontFamily: 'Barlow Condensed, sans-serif',
          fontWeight: 700, color, lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
