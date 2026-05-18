'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page ADMIN — Panel administrateur
 * ════════════════════════════════════════════════════════════════
 *
 * 4 onglets :
 *   - Vue d'ensemble (stats globales)
 *   - Utilisateurs (liste + édition rôle/statut/grade)
 *   - Connexions (historique avec filtres)
 *   - Audit (timeline d'événements + feature flags)
 *
 * ⚠️ Sécurités :
 *   - On NE TOUCHE JAMAIS au champ `pass` des users (mots de passe hashés)
 *   - Confirmation obligatoire pour changer un rôle
 *   - Protection contre l'auto-dégradation (TODO: quand on aura le vrai user connecté)
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Activity,
  Users as UsersIcon,
  History,
  ShieldCheck,
  Search,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Globe,
  Monitor,
  Smartphone,
  Sparkles,
  Loader2,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet, dbUpdate, dbGet } from '@/lib/db';
import { toast } from '@/lib/toast';
import { compressDataUrl, dataUrlSize, fmtSize } from '@/lib/image';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import {
  type User,
  type UserRole,
  type UserStatut,
  type LoginEntry,
  type TimelineEntry,
  type FeaturesMap,
  USER_ROLES,
  USER_STATUTS,
  ROLE_LABEL,
  ROLE_COLOR,
  KNOWN_FEATURES,
  fmtDateTime,
  fmtRelative,
} from '@/types/admin';

import styles from './page.module.css';

type Tab = 'overview' | 'users' | 'logins' | 'audit';

export default function AdminPage() {
  const { data: usersData } = useFirebaseValue<User[] | null>('users');
  const { data: loginsData } = useFirebaseValue<LoginEntry[] | null>('loginHistory');
  const { data: timelineData } = useFirebaseValue<TimelineEntry[] | null>('timeline');
  const { data: featuresData } = useFirebaseValue<FeaturesMap | null>('features');

  const [tab, setTab] = useState<Tab>('overview');

  // ─── Normalisation ───
  const users = useMemo<User[]>(
    () =>
      (Array.isArray(usersData)
        ? usersData
        : usersData
          ? Object.values(usersData)
          : []
      ).filter((u): u is User => u !== null && typeof u === 'object' && !!u.id),
    [usersData]
  );

  const logins = useMemo<LoginEntry[]>(
    () =>
      (Array.isArray(loginsData)
        ? loginsData
        : loginsData
          ? Object.values(loginsData)
          : []
      ).filter((l): l is LoginEntry => l !== null && typeof l === 'object' && !!l.date),
    [loginsData]
  );

  const timeline = useMemo<TimelineEntry[]>(
    () =>
      (Array.isArray(timelineData)
        ? timelineData
        : timelineData
          ? Object.values(timelineData)
          : []
      ).filter((t): t is TimelineEntry => t !== null && typeof t === 'object' && !!t.date),
    [timelineData]
  );

  const features = featuresData || {};

  // ─── Stats overview ───
  const stats = useMemo(() => {
    const total = users.length;
    const actifs = users.filter((u) => u.statut === 'Actif').length;
    const admins = users.filter((u) => u.role === 'admin' || u.role === 'gerant').length;
    const last7d = logins.filter((l) => Date.now() - l.date < 7 * 24 * 3600 * 1000).length;
    const failures = logins.filter((l) => l.type === 'echec').length;

    // Sessions uniques sur 24h
    const last24h = logins.filter((l) => Date.now() - l.date < 24 * 3600 * 1000);
    const uniqueUsers24h = new Set(last24h.map((l) => l.userId).filter(Boolean)).size;

    return { total, actifs, admins, last7d, failures, uniqueUsers24h };
  }, [users, logins]);

  // ─── Rendu ───
  return (
    <Card
      title="Panel administrateur"
      subtitle="Gestion du village et supervision système"
    >
      {/* Onglets */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'overview' ? styles.tabActive : ''}`}
          onClick={() => setTab('overview')}
        >
          <Activity size={14} />
          <span>Vue d&apos;ensemble</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'users' ? styles.tabActive : ''}`}
          onClick={() => setTab('users')}
        >
          <UsersIcon size={14} />
          <span>Utilisateurs</span>
          <span className={styles.tabCount}>{users.length}</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'logins' ? styles.tabActive : ''}`}
          onClick={() => setTab('logins')}
        >
          <History size={14} />
          <span>Connexions</span>
          <span className={styles.tabCount}>{logins.length}</span>
        </button>
        <button
          className={`${styles.tab} ${tab === 'audit' ? styles.tabActive : ''}`}
          onClick={() => setTab('audit')}
        >
          <ShieldCheck size={14} />
          <span>Audit &amp; Features</span>
        </button>
      </div>

      {/* CONTENU */}
      {tab === 'overview' && <OverviewTab stats={stats} timeline={timeline} />}
      {tab === 'users' && <UsersTab users={users} />}
      {tab === 'logins' && <LoginsTab logins={logins} />}
      {tab === 'audit' && <AuditTab timeline={timeline} features={features} />}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── ONGLET 1 : VUE D'ENSEMBLE ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function OverviewTab({
  stats,
  timeline,
}: {
  stats: {
    total: number;
    actifs: number;
    admins: number;
    last7d: number;
    failures: number;
    uniqueUsers24h: number;
  };
  timeline: TimelineEntry[];
}) {
  const recentEvents = useMemo(
    () => [...timeline].sort((a, b) => b.date - a.date).slice(0, 8),
    [timeline]
  );

  return (
    <div className={styles.overview}>
      <div className={styles.statGrid}>
        <StatCard label="Utilisateurs totaux" value={stats.total} color="gold" />
        <StatCard label="Actifs" value={stats.actifs} color="green" />
        <StatCard label="Administrateurs" value={stats.admins} color="orange" />
        <StatCard label="Connexions (7j)" value={stats.last7d} color="blue" />
        <StatCard
          label="Utilisateurs uniques (24h)"
          value={stats.uniqueUsers24h}
          color="purple"
        />
        <StatCard label="Tentatives échouées" value={stats.failures} color="red" />
      </div>

      <h3 className={styles.sectionTitle}>Derniers événements</h3>
      {recentEvents.length === 0 ? (
        <p className={styles.empty}>Aucun événement enregistré.</p>
      ) : (
        <div className={styles.timelineList}>
          {recentEvents.map((e, i) => (
            <div
              key={i}
              className={`${styles.timelineRow} ${e.urgence ? styles.urgence : ''}`}
            >
              <div className={styles.timelineDate}>{fmtRelative(e.date)}</div>
              <div className={styles.timelineText}>
                {e.urgence && <AlertTriangle size={11} style={{ marginRight: 4 }} />}
                {e.text}
              </div>
              {e.auteur && <div className={styles.timelineAuthor}>par {e.auteur}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: 'gold' | 'green' | 'orange' | 'blue' | 'purple' | 'red';
}) {
  return (
    <div className={`${styles.statCard} ${styles[`sc-${color}`]}`}>
      <div className={styles.statVal}>{value}</div>
      <div className={styles.statLbl}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── ONGLET 2 : UTILISATEURS ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function UsersTab({ users }: { users: User[] }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statutFilter, setStatutFilter] = useState<'all' | UserStatut>('all');
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Partial<User>>({});

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== 'all') list = list.filter((u) => u.role === roleFilter);
    if (statutFilter !== 'all') list = list.filter((u) => u.statut === statutFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((u) =>
        ((u.nom || '') + ' ' + (u.login || '') + ' ' + (u.grade || '') + ' ' + (u.section || ''))
          .toLowerCase()
          .includes(q)
      );
    }
    return [...list].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }, [users, search, roleFilter, statutFilter]);

  function openEdit(u: User) {
    setEditing(u);
    setForm(u);
  }

  function closeEdit() {
    setEditing(null);
    setForm({});
  }

  async function handleSave() {
    if (!editing) return;
    if (!form.nom?.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }

    // Confirmation OBLIGATOIRE si on change le rôle
    if (form.role !== editing.role) {
      const ok = await confirmAction({
        title: 'Confirmer le changement de rôle',
        message: `Vraiment changer le rôle de ${editing.nom} de "${ROLE_LABEL[(editing.role || 'visiteur') as UserRole] || editing.role}" à "${ROLE_LABEL[(form.role || 'visiteur') as UserRole] || form.role}" ?`,
        confirmLabel: 'Confirmer',
        variant: 'danger',
      });
      if (!ok) return;
    }

    try {
      // On met à jour seulement les champs autorisés (jamais `pass` ni `id`)
      const safeUpdate = {
        nom: form.nom?.trim(),
        grade: form.grade?.trim() || null,
        role: form.role,
        section: form.section?.trim() || null,
        statut: form.statut,
      };
      // dbUpdate sur le chemin précis du user
      // Note : on cherche son index dans le tableau
      const list = [...users];
      const idx = list.findIndex((u) => u.id === editing.id);
      if (idx === -1) throw new Error('Introuvable');
      list[idx] = { ...list[idx], ...safeUpdate } as User;
      await dbSet('users', list);
      toast.success('Utilisateur mis à jour');
      closeEdit();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(u: User) {
    const ok = await confirmAction({
      title: 'Supprimer l\'utilisateur',
      message: `Supprimer définitivement ${u.nom} ? Cette action est IRRÉVERSIBLE. L'utilisateur perdra l'accès à l'intranet.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dbSet('users', users.filter((x) => x.id !== u.id));
      toast.success('Utilisateur supprimé');
      if (editing?.id === u.id) closeEdit();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Rechercher par nom, login, grade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
        >
          <option value="all">Tous les rôles</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value as 'all' | UserStatut)}
        >
          <option value="all">Tous les statuts</option>
          {USER_STATUTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>Aucun utilisateur pour ces filtres.</p>
      ) : (
        <table className={styles.userTable}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Login</th>
              <th>Grade</th>
              <th>Section</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Créé</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} onClick={() => openEdit(u)}>
                <td>
                  <strong>{u.nom}</strong>
                </td>
                <td className={styles.mono}>{u.login || '—'}</td>
                <td>{u.grade || '—'}</td>
                <td>{u.section || '—'}</td>
                <td>
                  <RoleBadge role={(u.role || 'visiteur') as UserRole} />
                </td>
                <td>
                  <StatutBadge statut={(u.statut || 'Actif') as UserStatut} />
                </td>
                <td className={styles.muted}>{fmtRelative(u.created)}</td>
                <td>
                  <button
                    className={styles.iconBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(u);
                    }}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={!!editing}
        onClose={closeEdit}
        title={`Modifier ${editing?.nom || 'utilisateur'}`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeEdit}>
              Annuler
            </Button>
            <Button onClick={handleSave}>
              <Save size={14} /> Enregistrer
            </Button>
          </>
        }
      >
        {editing && (
          <div className={styles.formFields}>
            <div className={styles.row}>
              <label>
                Nom complet *
                <input
                  type="text"
                  value={form.nom ?? ''}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  autoFocus
                />
              </label>
              <label>
                Login (lecture seule)
                <input
                  type="text"
                  value={editing.login || ''}
                  disabled
                  className={styles.disabled}
                />
              </label>
            </div>
            <div className={styles.row}>
              <label>
                Grade
                <input
                  type="text"
                  value={form.grade ?? ''}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  placeholder="Ex: Jonin, Chunin…"
                />
              </label>
              <label>
                Section
                <input
                  type="text"
                  value={form.section ?? ''}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                  placeholder="Ex: police, medical…"
                />
              </label>
            </div>
            <div className={styles.row}>
              <label>
                Rôle ⚠️
                <select
                  value={form.role ?? 'visiteur'}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Statut
                <select
                  value={form.statut ?? 'Actif'}
                  onChange={(e) =>
                    setForm({ ...form, statut: e.target.value as UserStatut })
                  }
                >
                  {USER_STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.warningBox}>
              <AlertTriangle size={14} />
              <span>
                Le mot de passe et l&apos;ID ne peuvent pas être modifiés depuis ce
                panel. Les changements de rôle demandent une confirmation.
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const color = ROLE_COLOR[role] || 'gray';
  return (
    <span className={`${styles.roleBadge} ${styles[`rb-${color}`]}`}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

function StatutBadge({ statut }: { statut: UserStatut }) {
  const map: Record<UserStatut, string> = {
    Actif: 'green',
    Inactif: 'gray',
    Suspendu: 'orange',
    Banni: 'red',
  };
  const color = map[statut] || 'gray';
  return (
    <span className={`${styles.statutBadge} ${styles[`sb-${color}`]}`}>
      {statut}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── ONGLET 3 : CONNEXIONS ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function LoginsTab({ logins }: { logins: LoginEntry[] }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'connexion' | 'echec'>('all');

  const filtered = useMemo(() => {
    let list = logins;
    if (typeFilter !== 'all') list = list.filter((l) => l.type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((l) =>
        (
          (l.nom || '') +
          ' ' +
          (l.ip || '') +
          ' ' +
          (l.browser || '') +
          ' ' +
          (l.os || '') +
          ' ' +
          (l.geo?.country || '') +
          ' ' +
          (l.geo?.city || '')
        )
          .toLowerCase()
          .includes(q)
      );
    }
    return [...list].sort((a, b) => b.date - a.date);
  }, [logins, search, typeFilter]);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Membre, IP, navigateur, pays…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'connexion' | 'echec')}
        >
          <option value="all">Tous types</option>
          <option value="connexion">Connexions réussies</option>
          <option value="echec">Tentatives échouées</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>Aucune entrée pour ces filtres.</p>
      ) : (
        <div className={styles.loginList}>
          {filtered.slice(0, 100).map((l, i) => (
            <div
              key={i}
              className={`${styles.loginRow} ${l.type === 'echec' ? styles.loginFail : ''}`}
            >
              <div className={styles.loginDate}>
                {l.type === 'echec' ? (
                  <XCircle size={13} style={{ color: '#fca5a5' }} />
                ) : (
                  <CheckCircle2 size={13} style={{ color: '#86efac' }} />
                )}
                {fmtDateTime(l.date)}
              </div>
              <div className={styles.loginUser}>
                <strong>{l.nom || 'Inconnu'}</strong>
                {l.grade && <span className={styles.muted}> · {l.grade}</span>}
              </div>
              <div className={styles.loginDevice}>
                {l.device?.includes('Mobile') ? (
                  <Smartphone size={11} />
                ) : (
                  <Monitor size={11} />
                )}
                <span>{l.browser || '—'}</span>
                {l.os && <span className={styles.muted}> · {l.os}</span>}
              </div>
              <div className={styles.loginGeo}>
                {l.geo?.country ? (
                  <>
                    <Globe size={11} />
                    <span>
                      {l.geo.city ? `${l.geo.city}, ` : ''}
                      {l.geo.country}
                    </span>
                  </>
                ) : l.ip ? (
                  <span className={styles.mono}>{l.ip}</span>
                ) : (
                  <span className={styles.muted}>—</span>
                )}
              </div>
            </div>
          ))}
          {filtered.length > 100 && (
            <p className={styles.muted} style={{ textAlign: 'center', padding: 12 }}>
              … {filtered.length - 100} entrées plus anciennes masquées.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── ONGLET 4 : AUDIT & FEATURES ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function AuditTab({
  timeline,
  features,
}: {
  timeline: TimelineEntry[];
  features: FeaturesMap;
}) {
  const sortedTimeline = useMemo(
    () => [...timeline].sort((a, b) => b.date - a.date).slice(0, 100),
    [timeline]
  );

  async function toggleFeature(key: string, current: boolean) {
    try {
      await dbUpdate('features', { [key]: !current });
      toast.success(`${key} ${!current ? 'activé' : 'désactivé'}`);
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  }

  return (
    <div className={styles.auditWrap}>
      {/* Optimisation des photos */}
      <PhotoOptimizer />

      {/* Features */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Modules (Feature Flags)</h3>
        <p className={styles.sectionDesc}>
          Active ou désactive globalement certains modules de l&apos;intranet.
        </p>
        <div className={styles.featureGrid}>
          {KNOWN_FEATURES.map((f) => {
            const enabled = !!features[f.key];
            return (
              <div key={f.key} className={styles.featureCard}>
                <div className={styles.featureInfo}>
                  <strong>{f.label}</strong>
                  <span>{f.desc}</span>
                  <span className={styles.featureKey}>{f.key}</span>
                </div>
                <button
                  className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
                  onClick={() => toggleFeature(f.key, enabled)}
                  aria-label={enabled ? 'Désactiver' : 'Activer'}
                >
                  <span className={styles.toggleHandle} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Journal d&apos;audit ({sortedTimeline.length})</h3>
        {sortedTimeline.length === 0 ? (
          <p className={styles.empty}>Aucun événement enregistré.</p>
        ) : (
          <div className={styles.timelineList}>
            {sortedTimeline.map((e, i) => (
              <div
                key={i}
                className={`${styles.timelineRow} ${e.urgence ? styles.urgence : ''}`}
              >
                <div className={styles.timelineDate}>{fmtRelative(e.date)}</div>
                <div className={styles.timelineText}>
                  {e.urgence && <AlertTriangle size={11} style={{ marginRight: 4 }} />}
                  {e.text}
                </div>
                {e.auteur && <div className={styles.timelineAuthor}>par {e.auteur}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── PHOTO OPTIMIZER ──────────────────────────────────────────────────
// Compresse en lot les images stockées dans Firebase pour gagner de la
// place (bingobook, plaintes, users.photo). Utile en maintenance.
// ═══════════════════════════════════════════════════════════════════════

interface PhotoInfo {
  path: string;        // chemin Firebase complet (ex: "bingobook/123.portrait")
  collection: string;  // 'bingobook' | 'plaintes' | 'users'
  itemId: string | number;
  field: string;       // 'portrait' | 'photoAccuse' | 'photo'
  dataUrl: string;
  size: number;
}

interface ScanResult {
  total: number;
  totalSize: number;
  large: PhotoInfo[];   // photos qui pourraient être compressées
  largeSize: number;
}

const LARGE_THRESHOLD = 50 * 1024; // 50 Ko — au-dessus, on considère "à compresser"

function PhotoOptimizer() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [savedBytes, setSavedBytes] = useState(0);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setSavedBytes(0);
    try {
      const photos: PhotoInfo[] = [];

      // Bingo book : { id: { portrait, ... } } ou tableau
      const bingo = await dbGet<unknown>('bingobook');
      collectPhotos(bingo, 'bingobook', 'portrait', photos);

      // Plaintes : tableau d'objets { photoAccuse }
      const plaintes = await dbGet<unknown>('plaintes');
      collectPhotos(plaintes, 'plaintes', 'photoAccuse', photos);

      // Users : { photo }
      const users = await dbGet<unknown>('users');
      collectPhotos(users, 'users', 'photo', photos);

      const totalSize = photos.reduce((s, p) => s + p.size, 0);
      const large = photos.filter((p) => p.size > LARGE_THRESHOLD);
      const largeSize = large.reduce((s, p) => s + p.size, 0);

      setScanResult({ total: photos.length, totalSize, large, largeSize });
      toast.success(`${photos.length} photos analysées`);
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de l\'analyse');
    } finally {
      setScanning(false);
    }
  }

  async function handleCompress() {
    if (!scanResult || scanResult.large.length === 0) return;
    const ok = await confirmAction({
      title: 'Compresser toutes les grosses photos',
      message: `Recompresser ${scanResult.large.length} photo${scanResult.large.length > 1 ? 's' : ''} (${fmtSize(scanResult.largeSize)}) ? Cette opération peut prendre 1-2 minutes.`,
      confirmLabel: 'Lancer la compression',
    });
    if (!ok) return;

    setCompressing(true);
    setProgress({ done: 0, total: scanResult.large.length });
    let saved = 0;

    try {
      // Récupère les collections d'un coup pour limiter les lectures
      const bingo = await dbGet<Record<string, { portrait?: string }> | { portrait?: string }[]>('bingobook');
      const plaintes = await dbGet<{ id: number; photoAccuse?: string }[]>('plaintes');
      const users = await dbGet<{ id: number; photo?: string }[]>('users');

      // On accumule les modifications et on commit à la fin (1 write par collection)
      const bingoCopy: Record<string, { portrait?: string }> | { portrait?: string }[] | null = bingo
        ? Array.isArray(bingo)
          ? ([...bingo] as { portrait?: string }[])
          : ({ ...(bingo as Record<string, { portrait?: string }>) } as Record<string, { portrait?: string }>)
        : null;
      const plaintesCopy = plaintes ? [...(plaintes as { id: number; photoAccuse?: string }[])] : null;
      const usersCopy = users ? [...(users as { id: number; photo?: string }[])] : null;

      let bingoChanged = false;
      let plaintesChanged = false;
      let usersChanged = false;

      for (let i = 0; i < scanResult.large.length; i++) {
        const p = scanResult.large[i];
        try {
          const compressed = await compressDataUrl(p.dataUrl, 400, 0.75);
          const newSize = dataUrlSize(compressed);

          if (newSize < p.size) {
            saved += p.size - newSize;

            // Applique au copy correspondant
            if (p.collection === 'bingobook' && bingoCopy) {
              if (Array.isArray(bingoCopy)) {
                const idx = bingoCopy.findIndex((x, ix) => String(ix) === String(p.itemId) || (x && (x as { id?: number }).id === Number(p.itemId)));
                if (idx !== -1) {
                  bingoCopy[idx] = { ...bingoCopy[idx], [p.field]: compressed };
                  bingoChanged = true;
                }
              } else {
                if (bingoCopy[p.itemId as string]) {
                  bingoCopy[p.itemId as string] = {
                    ...bingoCopy[p.itemId as string],
                    [p.field]: compressed,
                  };
                  bingoChanged = true;
                }
              }
            } else if (p.collection === 'plaintes' && plaintesCopy) {
              const idx = plaintesCopy.findIndex((x) => x && x.id === Number(p.itemId));
              if (idx !== -1) {
                plaintesCopy[idx] = { ...plaintesCopy[idx], [p.field]: compressed };
                plaintesChanged = true;
              }
            } else if (p.collection === 'users' && usersCopy) {
              const idx = usersCopy.findIndex((x) => x && x.id === Number(p.itemId));
              if (idx !== -1) {
                usersCopy[idx] = { ...usersCopy[idx], [p.field]: compressed };
                usersChanged = true;
              }
            }
          }
        } catch (e) {
          console.warn('Échec compression', p.path, e);
        }
        setProgress({ done: i + 1, total: scanResult.large.length });
      }

      // Commit les écritures
      if (bingoChanged && bingoCopy) await dbSet('bingobook', bingoCopy);
      if (plaintesChanged && plaintesCopy) await dbSet('plaintes', plaintesCopy);
      if (usersChanged && usersCopy) await dbSet('users', usersCopy);

      setSavedBytes(saved);
      toast.success(`Compression terminée — ${fmtSize(saved)} économisés`);
      // On relance un scan pour mettre à jour l'état
      await handleScan();
    } catch (err) {
      console.error(err);
      toast.error('Erreur pendant la compression');
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>
        <Sparkles size={14} style={{ marginRight: 6, display: 'inline', verticalAlign: 'middle' }} />
        Optimisation des photos
      </h3>
      <p className={styles.sectionDesc}>
        Compresse toutes les photos déjà uploadées (Bingo Book, plaintes, profils)
        pour <strong>réduire la taille de la base</strong>. Utile si Firebase commence à saturer.
        La qualité visuelle reste excellente (~95% identique).
      </p>

      <div className={styles.optimizerBox}>
        <div className={styles.optimizerState}>
          <div className={styles.optimizerLabel}>État actuel</div>
          {!scanResult ? (
            <div className={styles.optimizerEmpty}>
              Cliquez « Analyser » pour voir l&apos;état des photos.
            </div>
          ) : (
            <div className={styles.optimizerStats}>
              <div>
                <strong>{scanResult.total}</strong> photo{scanResult.total > 1 ? 's' : ''} en base
                <span className={styles.muted}> · {fmtSize(scanResult.totalSize)} au total</span>
              </div>
              {scanResult.large.length > 0 ? (
                <div className={styles.optimizerHighlight}>
                  <strong>{scanResult.large.length}</strong> photo{scanResult.large.length > 1 ? 's' : ''} dépassent {fmtSize(LARGE_THRESHOLD)}
                  <span className={styles.muted}> · soit {fmtSize(scanResult.largeSize)} à optimiser</span>
                </div>
              ) : (
                <div className={styles.optimizerOk}>
                  <CheckCircle2 size={13} /> Toutes les photos sont déjà optimisées.
                </div>
              )}
              {savedBytes > 0 && (
                <div className={styles.optimizerSaved}>
                  ✨ Économie réalisée : <strong>{fmtSize(savedBytes)}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {compressing && (
          <div className={styles.progressBox}>
            <div className={styles.progressLabel}>
              <Loader2 size={12} className={styles.spin} />
              Compression en cours : {progress.done} / {progress.total}
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        )}

        <div className={styles.optimizerActions}>
          <Button variant="outline" onClick={handleScan} disabled={scanning || compressing}>
            {scanning ? <Loader2 size={12} className={styles.spin} /> : <Sparkles size={12} />}
            {scanning ? 'Analyse…' : 'Analyser'}
          </Button>
          <Button
            onClick={handleCompress}
            disabled={!scanResult || scanResult.large.length === 0 || compressing || scanning}
          >
            {compressing ? <Loader2 size={12} className={styles.spin} /> : <Sparkles size={12} />}
            {compressing ? 'Compression…' : 'Compresser toutes les photos'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Parcourt une collection Firebase et extrait les photos d'un champ donné.
 * Gère les 2 formats : tableau ou objet à clés.
 */
function collectPhotos(
  data: unknown,
  collection: string,
  field: string,
  out: PhotoInfo[]
) {
  if (!data || typeof data !== 'object') return;
  const items = Array.isArray(data) ? data : Object.entries(data as Record<string, unknown>);

  if (Array.isArray(data)) {
    data.forEach((item, idx) => {
      if (!item || typeof item !== 'object') return;
      const rec = item as Record<string, unknown>;
      const photo = rec[field];
      if (typeof photo === 'string' && photo.startsWith('data:image')) {
        out.push({
          path: `${collection}/${rec.id ?? idx}.${field}`,
          collection,
          itemId: (rec.id as number | string) ?? idx,
          field,
          dataUrl: photo,
          size: dataUrlSize(photo),
        });
      }
    });
  } else {
    (items as [string, unknown][]).forEach(([key, item]) => {
      if (!item || typeof item !== 'object') return;
      const rec = item as Record<string, unknown>;
      const photo = rec[field];
      if (typeof photo === 'string' && photo.startsWith('data:image')) {
        out.push({
          path: `${collection}/${key}.${field}`,
          collection,
          itemId: (rec.id as number | string) ?? key,
          field,
          dataUrl: photo,
          size: dataUrlSize(photo),
        });
      }
    });
  }
}
