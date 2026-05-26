'use client';

import { useMemo, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFirebaseValueRoot } from '@/hooks/useFirebaseValueRoot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  Search,
  Download,
  Filter,
  X,
  Clock,
  User,
  Target,
  Database,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types audit log (alignés sur logAction) ─────────────────────────
type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'export'
  | 'import'
  | 'compress';

interface AuditEntry {
  id: string;
  who: string;
  whoId: string;
  action: AuditAction;
  target: string;
  targetId?: string;
  detail?: unknown;
  ts: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────
const PAGE_SIZE = 50;
const AUDIT_LIMIT = 2000;

const ACTION_COLORS: Record<AuditAction, string> = {
  create: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  update: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  delete: 'bg-red-500/15 text-red-700 border-red-500/30',
  login: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
  export: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  import: 'bg-cyan-500/15 text-cyan-700 border-cyan-500/30',
  compress: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d}j`;
  return formatDate(ts);
}

function normalizeAudit(raw: unknown): AuditEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const entries = Object.entries(raw as Record<string, Partial<AuditEntry>>);
  return entries
    .map(([id, v]) => ({
      id,
      who: v.who ?? 'Inconnu',
      whoId: v.whoId ?? '',
      action: (v.action ?? 'update') as AuditAction,
      target: v.target ?? 'unknown',
      targetId: v.targetId,
      detail: v.detail,
      ts: typeof v.ts === 'number' ? v.ts : 0,
    }))
    .filter((e) => e.ts > 0)
    .sort((a, b) => b.ts - a.ts);
}

// ─── Page principale ─────────────────────────────────────────────────
export default function MaintenancePage() {
  const { user, can, isLoading: userLoading } = useCurrentUser();

  // Permission : Conseil du Vent + WL + admin
  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (user.isWL) return true;
    if (can.adminGeneral()) return true;
    // Conseil du Vent = rôle 1380772738528186375 (déjà inclus dans adminGeneral
    // selon les règles métier du projet, mais double-check explicite)
    return user.roles?.includes('1380772738528186375') ?? false;
  }, [user, can]);

  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="w-5 h-5" />
              Accès refusé
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cette page est réservée au Conseil du Vent, à l'administration
            générale et aux membres whitelistés.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Activity className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <p className="text-sm text-muted-foreground">
            Outils administrateur — supervision et diagnostic
          </p>
        </div>
      </div>

      <Tabs defaultValue="audit" className="space-y-4">
        <TabsList>
          <TabsTrigger value="audit" className="gap-2">
            <Database className="w-4 h-4" />
            Audit Log
          </TabsTrigger>
          {/* Tabs futurs : Users, Firebase Health, Purge… */}
        </TabsList>

        <TabsContent value="audit">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab Audit Log ───────────────────────────────────────────────────
function AuditLogTab() {
  const { value: rawAudit, isLoading } = useFirebaseValueRoot<
    Record<string, AuditEntry>
  >('audit_log', { limitToLast: AUDIT_LIMIT });

  const entries = useMemo(() => normalizeAudit(rawAudit), [rawAudit]);

  // ─── Filtres ────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterTarget, setFilterTarget] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [page, setPage] = useState(1);

  // ─── Options de filtres dérivées des données ────────────────────
  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      if (e.whoId && !map.has(e.whoId)) map.set(e.whoId, e.who);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const targetOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      // On groupe sur le préfixe (ex: "police:casier:infraction" → "police:casier")
      const parts = e.target.split(':');
      if (parts.length >= 2) {
        set.add(`${parts[0]}:${parts[1]}`);
      } else {
        set.add(e.target);
      }
    });
    return Array.from(set).sort();
  }, [entries]);

  // ─── Filtrage ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
    const q = search.trim().toLowerCase();

    return entries.filter((e) => {
      if (filterUser !== 'all' && e.whoId !== filterUser) return false;
      if (filterAction !== 'all' && e.action !== filterAction) return false;
      if (filterTarget !== 'all' && !e.target.startsWith(filterTarget))
        return false;
      if (e.ts < fromTs || e.ts > toTs) return false;
      if (q) {
        const haystack = [
          e.who,
          e.target,
          e.targetId ?? '',
          JSON.stringify(e.detail ?? ''),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, filterUser, filterAction, filterTarget, dateFrom, dateTo, search]);

  // Reset page si filtres changent
  useMemo(() => setPage(1), [
    filterUser,
    filterAction,
    filterTarget,
    dateFrom,
    dateTo,
    search,
  ]);

  const paginated = useMemo(
    () => filtered.slice(0, page * PAGE_SIZE),
    [filtered, page]
  );

  // ─── Stats header ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = Date.now();
    const day = 86400000;
    const last24h = entries.filter((e) => now - e.ts < day).length;
    const last7d = entries.filter((e) => now - e.ts < 7 * day).length;
    const last30d = entries.filter((e) => now - e.ts < 30 * day).length;

    // Top 5 users
    const userCounts = new Map<string, { name: string; count: number }>();
    entries.forEach((e) => {
      const cur = userCounts.get(e.whoId) ?? { name: e.who, count: 0 };
      userCounts.set(e.whoId, { name: cur.name, count: cur.count + 1 });
    });
    const topUsers = Array.from(userCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top 5 targets (groupés sur préfixe)
    const targetCounts = new Map<string, number>();
    entries.forEach((e) => {
      const parts = e.target.split(':');
      const key = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : e.target;
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
    });
    const topTargets = Array.from(targetCounts.entries())
      .map(([target, count]) => ({ target, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { last24h, last7d, last30d, topUsers, topTargets };
  }, [entries]);

  // ─── Export ─────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Date', 'Utilisateur', 'Discord ID', 'Action', 'Target', 'Target ID', 'Detail'],
      ...filtered.map((e) => [
        formatDate(e.ts),
        e.who,
        e.whoId,
        e.action,
        e.target,
        e.targetId ?? '',
        JSON.stringify(e.detail ?? ''),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} entrées exportées`);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} entrées exportées`);
  }

  function resetFilters() {
    setSearch('');
    setFilterUser('all');
    setFilterAction('all');
    setFilterTarget('all');
    setDateFrom('');
    setDateTo('');
  }

  const hasActiveFilters =
    search ||
    filterUser !== 'all' ||
    filterAction !== 'all' ||
    filterTarget !== 'all' ||
    dateFrom ||
    dateTo;

  // ─── Modale détail ──────────────────────────────────────────────
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Chargement de l'audit log…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="24 dernières heures"
          value={stats.last24h}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="7 derniers jours"
          value={stats.last7d}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="30 derniers jours"
          value={stats.last30d}
        />
        <StatCard
          icon={<Database className="w-4 h-4" />}
          label="Total chargé"
          value={entries.length}
          subtitle={`max ${AUDIT_LIMIT}`}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <TopList
          title="Top utilisateurs"
          icon={<User className="w-4 h-4" />}
          items={stats.topUsers.map((u) => ({ label: u.name, value: u.count }))}
        />
        <TopList
          title="Top targets"
          icon={<Target className="w-4 h-4" />}
          items={stats.topTargets.map((t) => ({
            label: t.target,
            value: t.count,
          }))}
        />
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtres
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  {filtered.length} / {entries.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-8"
                >
                  <X className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={exportCSV}
                className="h-8"
              >
                <Download className="w-3 h-3 mr-1" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportJSON}
                className="h-8"
              >
                <Download className="w-3 h-3 mr-1" />
                JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans who, target, detail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger>
                <SelectValue placeholder="Utilisateur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous utilisateurs</SelectItem>
                {userOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes actions</SelectItem>
                <SelectItem value="create">create</SelectItem>
                <SelectItem value="update">update</SelectItem>
                <SelectItem value="delete">delete</SelectItem>
                <SelectItem value="login">login</SelectItem>
                <SelectItem value="export">export</SelectItem>
                <SelectItem value="import">import</SelectItem>
                <SelectItem value="compress">compress</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterTarget} onValueChange={setFilterTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous targets</SelectItem>
                {targetOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Du"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Au"
            />
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardContent className="p-0">
          {paginated.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucune entrée ne correspond aux filtres.
            </div>
          ) : (
            <div className="divide-y">
              {paginated.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelected(entry)}
                  className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <Badge
                    variant="outline"
                    className={`${ACTION_COLORS[entry.action]} font-mono text-xs shrink-0`}
                  >
                    {entry.action}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium truncate">{entry.who}</span>
                      <span className="text-muted-foreground">→</span>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate">
                        {entry.target}
                      </code>
                      {entry.targetId && (
                        <code className="text-xs text-muted-foreground truncate">
                          #{entry.targetId}
                        </code>
                      )}
                    </div>
                    {entry.detail !== undefined && entry.detail !== null && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {typeof entry.detail === 'string'
                          ? entry.detail
                          : JSON.stringify(entry.detail)}
                      </div>
                    )}
                  </div>
                  <div
                    className="text-xs text-muted-foreground shrink-0 text-right"
                    title={formatDate(entry.ts)}
                  >
                    {formatRelative(entry.ts)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {paginated.length < filtered.length && (
            <div className="p-3 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setPage((p) => p + 1)}
              >
                Charger plus ({paginated.length} / {filtered.length})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modale détail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  selected ? ACTION_COLORS[selected.action] : ''
                }
              >
                {selected?.action}
              </Badge>
              <code className="text-sm">{selected?.target}</code>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Date" value={formatDate(selected.ts)} />
              <DetailRow
                label="Utilisateur"
                value={`${selected.who} (${selected.whoId})`}
              />
              <DetailRow label="Action" value={selected.action} />
              <DetailRow label="Target" value={selected.target} />
              {selected.targetId && (
                <DetailRow label="Target ID" value={selected.targetId} />
              )}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Detail</div>
                <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-96">
                  {selected.detail !== undefined && selected.detail !== null
                    ? JSON.stringify(selected.detail, null, 2)
                    : '(aucun détail)'}
                </pre>
              </div>
              <DetailRow label="Entry ID" value={selected.id} mono />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold">{value.toLocaleString('fr-FR')}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}

function TopList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: { label: string; value: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground">Aucune donnée</div>
        ) : (
          items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="truncate">{item.label}</span>
              <Badge variant="secondary" className="ml-2 shrink-0">
                {item.value}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</div>
    </div>
  );
}
