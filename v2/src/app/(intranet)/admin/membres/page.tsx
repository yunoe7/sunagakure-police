'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ADMIN — Liste des membres connectés
 * ════════════════════════════════════════════════════════════════
 *
 *  Affiche tous les utilisateurs qui se sont déjà connectés
 *  à l'intranet (enregistrés automatiquement dans members/ via auth.ts).
 *
 *  🆕 Attribution de GRADE KŌEKI par membre, stockée en base
 *     (koeki/grades/{discordId}). Permet de gérer le Kōeki sans
 *     dépendre des rôles Discord (qui se propagent mal via OAuth).
 *     useCurrentUser lit ce grade en priorité sur le rôle Discord.
 *
 *  Sécurité : RequireAdminStrict (admin techniques uniquement)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useMemo } from 'react';
import { Search, Users, ShieldCheck, Activity, Briefcase, ChevronDown } from 'lucide-react';

import { useMembers, type Member } from '@/hooks/useMembers';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { RequireAdminStrict } from '@/components/Require';
import { Card } from '@/components/ui/Card';
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

  // 🆕 Tous les grades Kōeki en base, en une seule lecture
  const { data: gradesData } = useFirebaseValue<Record<string, KoekiGradeOverride> | null>(
    KOEKI_GRADES_PATH
  );

  // Tri : admins en premier, puis par dernière connexion descendante
  const sorted = useMemo(() => {
    const list = [...members];
    list.sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      return b.lastLogin - a.lastLogin;
    });
    return list;
  }, [members]);

  // Filtre recherche
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
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  }

  function isOnline(ts: number): boolean {
    return Date.now() - ts < 5 * 60 * 1000; // 5 min
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ═══ STATS ═══ */}
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

      {/* ═══ TABLEAU ═══ */}
      <Card
        title="Membres connectés"
        subtitle={`${visible.length} ninja(s)${search ? ` (filtré sur ${members.length})` : ''}`}
      >
        {/* Recherche */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 6,
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
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              outline: 'none',
              fontSize: 13,
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
                firstLoginText={fmtRelative(m.firstLogin)}
                koekiGrade={gradesData?.[m.discordId]?.grade ?? null}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────

function StatBox({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.1))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: `${color}22`,
            color: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'Share Tech Mono, monospace',
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          fontSize: 28,
          fontFamily: 'Barlow Condensed, sans-serif',
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  isOnline,
  lastLoginText,
  firstLoginText,
  koekiGrade,
}: {
  member: Member;
  isOnline: boolean;
  lastLoginText: string;
  firstLoginText: string;
  koekiGrade: KoekiGrade | null;
}) {
  const m = member;
  const { displayName, id: myId } = useCurrentUser();
  const [saving, setSaving] = useState(false);

  async function handleGradeChange(value: string) {
    const newGrade = (value === '' ? null : value) as KoekiGrade | null;
    setSaving(true);
    try {
      const payload: KoekiGradeOverride = {
        grade: newGrade,
        setBy: displayName,
        setAt: Date.now(),
      };
      await dbSet(`${KOEKI_GRADES_PATH}/${m.discordId}`, payload);

      logAction({
        who: displayName,
        whoId: myId ?? null,
        action: 'update',
        target: 'koeki:grade',
        targetId: m.discordId,
        detail: newGrade
          ? `Grade Kōeki de ${m.username} défini sur « ${gradeLabel(newGrade)} »`
          : `Grade Kōeki de ${m.username} retiré`,
      });

      toast.success(
        newGrade
          ? `${m.username} → ${gradeLabel(newGrade)}`
          : `Grade Kōeki retiré pour ${m.username}`
      );
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'enregistrement du grade');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 14px',
        background: m.isAdmin ? 'rgba(212, 172, 13, 0.05)' : 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 6,
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', width: 40, height: 40 }}>
        {m.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={m.avatarUrl}
            alt={m.username}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid rgba(212, 172, 13, 0.25)',
            }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
              color: '#fff',
            }}
          >
            {m.username[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        {isOnline && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#7dd87d',
              border: '2px solid #14162a',
              boxShadow: '0 0 6px rgba(125, 216, 125, 0.6)',
            }}
            title="En ligne"
          />
        )}
      </div>

      {/* Infos */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <strong style={{ fontSize: 13, color: '#fff' }}>{m.username}</strong>
          {m.isAdmin && <Badge color="#d4ac0d" label="Admin" />}
          {m.isStaff && <Badge color="#a78bfa" label="Staff" />}
          {m.isKazekage && <Badge color="#f87171" label="Kazekage" />}
          {m.gerantDe.length > 0 && <Badge color="#60a5fa" label={`Gérant ${m.gerantDe[0]}`} />}
          {koekiGrade && <Badge color="#34d399" label={gradeLabel(koekiGrade)} />}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span>{m.rangNom ?? 'Sans rang'}</span>
          {m.branches.length > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{m.branches.join(', ')}</span>
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
            fontSize: 10,
            opacity: 0.4,
            marginTop: 3,
            fontFamily: 'Share Tech Mono, monospace',
          }}
        >
          ID {m.discordId}
        </div>
      </div>

      {/* Dates + sélecteur de grade Kōeki */}
      <div style={{ textAlign: 'right', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
        <div title={`Première connexion : ${new Date(m.firstLogin).toLocaleString('fr-FR')}`}>
          <span style={{ opacity: 0.5 }}>Connecté</span> {lastLoginText}
        </div>
        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>Inscrit {firstLoginText}</div>

        {/* 🆕 Sélecteur de grade Kōeki */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 8,
          }}
        >
          <span
            style={{
              fontSize: 8,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.35)',
              fontFamily: 'Share Tech Mono, monospace',
            }}
          >
            Kōeki
          </span>
          <div
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 9,
                display: 'inline-flex',
                pointerEvents: 'none',
                color: koekiGrade ? '#34d399' : 'rgba(255,255,255,0.3)',
              }}
            >
              <Briefcase size={12} />
            </span>
            <select
              value={koekiGrade ?? ''}
              disabled={saving}
              onChange={(e) => handleGradeChange(e.target.value)}
              title="Grade Kōeki (géré dans l'intranet, indépendant de Discord)"
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                fontSize: 11,
                fontWeight: 600,
                padding: '6px 26px 6px 28px',
                minWidth: 150,
                textAlign: 'left',
                background: koekiGrade
                  ? 'linear-gradient(180deg, rgba(52,211,153,0.16), rgba(52,211,153,0.06))'
                  : 'rgba(255,255,255,0.04)',
                color: koekiGrade ? '#6ee7b7' : 'rgba(255,255,255,0.6)',
                border: koekiGrade
                  ? '1px solid rgba(52,211,153,0.5)'
                  : '1px solid rgba(255,255,255,0.12)',
                borderRadius: 7,
                outline: 'none',
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.5 : 1,
                fontFamily: 'Barlow Condensed, sans-serif',
                letterSpacing: 0.3,
                transition: 'all 0.15s ease',
                boxShadow: koekiGrade
                  ? '0 0 0 1px rgba(52,211,153,0.08), 0 2px 8px rgba(52,211,153,0.1)'
                  : 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(212,172,13,0.6)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(212,172,13,0.12)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = koekiGrade
                  ? 'rgba(52,211,153,0.5)'
                  : 'rgba(255,255,255,0.12)';
                e.currentTarget.style.boxShadow = koekiGrade
                  ? '0 0 0 1px rgba(52,211,153,0.08), 0 2px 8px rgba(52,211,153,0.1)'
                  : 'none';
              }}
            >
              <option value="">Aucun</option>
              {KOEKI_GRADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* Flèche custom */}
            <span
              style={{
                position: 'absolute',
                right: 9,
                pointerEvents: 'none',
                color: koekiGrade ? '#34d399' : 'rgba(255,255,255,0.4)',
                display: 'inline-flex',
              }}
            >
              <ChevronDown size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        fontSize: 9,
        padding: '2px 6px',
        background: `${color}1f`,
        color,
        border: `1px solid ${color}50`,
        borderRadius: 3,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: 700,
        fontFamily: 'Share Tech Mono, monospace',
      }}
    >
      {label}
    </span>
  );
}
