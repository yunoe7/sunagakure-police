'use client';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  Page ADMIN — Maintenance
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Console technique pour les admins :
 *  1. 🗜 Compression photos en masse (analyse + recompression)
 *  2. 💾 Export / Import des données
 *  3. 📜 Audit log (journal des actions sensibles)
 *
 *  Sécurité : RequireAdminStrict (admins techniques uniquement)
 * ═══════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import {
  Image as ImageIcon,
  Download,
  Upload,
  ScrollText,
  Wrench,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RequireAdminStrict } from '@/components/Require';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { logAction, ACTION_LABEL, ACTION_COLOR } from '@/lib/audit';
import { toast } from '@/lib/toast';
import { confirmAction } from '@/components/ui/ConfirmDialog';

import styles from './page.module.css';

export default function MaintenancePage() {
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
      <MaintenanceContent />
    </RequireAdminStrict>
  );
}

function MaintenanceContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PhotoCompressionSection />
      <BackupSection />
      <AuditLogSection />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Section 1 : COMPRESSION PHOTOS
 * ═══════════════════════════════════════════════════════════════════ */

type AnalyzeResult = {
  totalPhotos: number;
  totalSizeKB: number;
  candidatesForCompression: number;
  candidatesSizeKB: number;
};

function PhotoCompressionSection() {
  const u = useCurrentUser();
  const [analyzing, setAnalyzing] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  /**
   * Récupère TOUTES les photos de la DB en parcourant les paths connus.
   * Retourne une liste de { path, photoField, value }.
   */
  async function fetchAllPhotos(): Promise<
    { path: string; field: string; value: string; itemKey: string }[]
  > {
    const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL manquant');

    // Paths à scanner et champs photo possibles
    const targets = [
      { path: 'sunagakure/dossiers', fields: ['photo'] },
      { path: 'sunagakure/recenses', fields: ['photo'] },
      { path: 'sunagakure/bingobook', fields: ['portrait'] },
      { path: 'sunagakure/annonces', fields: ['photo'] },
      { path: 'sunagakure/plaintes', fields: ['photo'] },
      { path: 'sunagakure/users', fields: ['photo'] },
      { path: 'sunagakure/recrutement', fields: ['photo'] },
      { path: 'members', fields: ['avatarUrl'] },
    ];

    const all: { path: string; field: string; value: string; itemKey: string }[] = [];

    for (const { path, fields } of targets) {
      try {
        const res = await fetch(`${dbUrl}/${path}.json`);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data) continue;

        const items = Array.isArray(data)
          ? data.map((v, i) => [String(i), v] as const)
          : Object.entries(data);

        for (const [key, item] of items) {
          if (!item || typeof item !== 'object') continue;
          for (const field of fields) {
            const v = (item as Record<string, unknown>)[field];
            if (typeof v === 'string' && v.startsWith('data:image/')) {
              all.push({ path, field, value: v, itemKey: key });
            }
          }
        }
      } catch (err) {
        console.warn(`[Maintenance] Échec scan ${path} :`, err);
      }
    }

    return all;
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setResult(null);
    try {
      const photos = await fetchAllPhotos();
      const totalSize = photos.reduce((s, p) => s + p.value.length, 0);
      // Considérée comme "candidate" si elle fait plus de 250 KB en base64
      const candidates = photos.filter((p) => p.value.length > 250_000);
      const candSize = candidates.reduce((s, p) => s + p.value.length, 0);

      setResult({
        totalPhotos: photos.length,
        totalSizeKB: Math.round(totalSize / 1024),
        candidatesForCompression: candidates.length,
        candidatesSizeKB: Math.round(candSize / 1024),
      });
      toast.success('Analyse terminée');
    } catch (err) {
      console.error(err);
      toast.error("Erreur d'analyse");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCompress() {
    if (!result || result.candidatesForCompression === 0) return;
    const ok = await confirmAction({
      title: 'Compresser les photos',
      message: `Vous allez recompresser ${result.candidatesForCompression} photo(s). Cette action modifie la base de données et est irréversible.`,
      confirmLabel: 'Compresser',
      variant: 'danger',
    });
    if (!ok) return;

    setCompressing(true);
    const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!;

    try {
      const photos = await fetchAllPhotos();
      const candidates = photos.filter((p) => p.value.length > 250_000);
      setProgress({ current: 0, total: candidates.length });

      let savedBytes = 0;
      let done = 0;

      for (const photo of candidates) {
        try {
          const compressed = await compressDataUrl(photo.value, 600, 0.75);
          if (compressed.length < photo.value.length) {
            // PATCH du champ uniquement (pas tout l'objet)
            const url = `${dbUrl}/${photo.path}/${photo.itemKey}.json`;
            await fetch(url, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [photo.field]: compressed }),
            });
            savedBytes += photo.value.length - compressed.length;
          }
        } catch (err) {
          console.warn('[Compress] Échec sur', photo.path, photo.itemKey, err);
        }
        done++;
        setProgress({ current: done, total: candidates.length });
      }

      const savedKB = Math.round(savedBytes / 1024);
      toast.success(`✅ ${done} photos compressées · ${savedKB} KB économisés`);

      await logAction({
        who: u.displayName,
        whoId: u.id ?? null,
        action: 'compress',
        target: 'photos',
        detail: `Compression de ${done} photo(s) · ${savedKB} KB économisés`,
      });

      setResult(null); // Forcer re-analyse
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la compression');
    } finally {
      setCompressing(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  return (
    <Card
      title="Compression des photos"
      subtitle="Réduire la taille des images stockées en base"
    >
      <p className={styles.sectionDesc}>
        <ImageIcon size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Parcourt toutes les photos enregistrées (dossiers, recensés, bingobook, annonces,
        plaintes, profils) et propose de recompresser celles qui pèsent plus de 250 KB.
        La qualité visuelle reste proche de l&apos;originale (~95%).
      </p>

      <div className={styles.actionsRow}>
        <Button onClick={handleAnalyze} disabled={analyzing || compressing}>
          {analyzing ? 'Analyse…' : '🔍 Analyser'}
        </Button>
        {result && result.candidatesForCompression > 0 && (
          <Button
            variant="primary"
            onClick={handleCompress}
            disabled={compressing}
          >
            {compressing
              ? `Compression… ${progress.current}/${progress.total}`
              : `🗜 Compresser ${result.candidatesForCompression} photo(s)`}
          </Button>
        )}
      </div>

      {result && (
        <div className={styles.statBox}>
          <div>
            <strong>{result.totalPhotos}</strong> photo(s) au total ·{' '}
            <strong>{result.totalSizeKB}</strong> KB
          </div>
          <div>
            <strong>{result.candidatesForCompression}</strong> au-dessus du seuil
            (250 KB) ·{' '}
            <strong>{result.candidatesSizeKB}</strong> KB potentiellement compressibles
          </div>
          {result.candidatesForCompression === 0 && (
            <div className={styles.okHint}>
              <CheckCircle2 size={14} /> Toutes les photos sont déjà optimisées.
            </div>
          )}
        </div>
      )}

      {compressing && (
        <div className={styles.progress}>
          <div
            className={styles.progressBar}
            style={{
              width: `${
                progress.total === 0 ? 0 : (progress.current / progress.total) * 100
              }%`,
            }}
          />
        </div>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Section 2 : EXPORT / IMPORT
 * ═══════════════════════════════════════════════════════════════════ */

function BackupSection() {
  const u = useCurrentUser();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!;
      // On exporte tout ce qui est accessible en lecture
      const res = await fetch(`${dbUrl}/.json`);
      if (!res.ok) throw new Error('Lecture DB échouée');
      const data = await res.json();

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(
        2,
        '0'
      )}h${String(now.getMinutes()).padStart(2, '0')}`;
      const fileName = `sunagakure-backup-${stamp}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      const sizeKB = Math.round(json.length / 1024);
      toast.success(`✅ Export terminé · ${sizeKB} KB`);

      await logAction({
        who: u.displayName,
        whoId: u.id ?? null,
        action: 'export',
        target: 'database',
        detail: `Export complet de la base (${sizeKB} KB)`,
      });
    } catch (err) {
      console.error(err);
      toast.error("Erreur d'export");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    const ok = await confirmAction({
      title: '⚠️ Importer un backup',
      message:
        `Vous allez ÉCRASER l'intégralité de la base de données avec le contenu de "${file.name}". ` +
        `Cette action est IRRÉVERSIBLE. Avez-vous une sauvegarde récente avant de continuer ?`,
      confirmLabel: 'Oui, écraser la base',
      variant: 'danger',
    });
    if (!ok) return;

    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validation minimale : doit être un objet, pas un tableau
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('Format invalide : un objet JSON est attendu');
      }

      const dbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!;
      const res = await fetch(`${dbUrl}/.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      toast.success("✅ Import réussi · rechargez la page pour voir les données");

      await logAction({
        who: u.displayName,
        whoId: u.id ?? null,
        action: 'import',
        target: 'database',
        detail: `Import depuis le fichier "${file.name}"`,
      });
    } catch (err) {
      console.error(err);
      toast.error(`Erreur d'import : ${err instanceof Error ? err.message : 'inconnue'}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card
      title="Sauvegarde des données"
      subtitle="Exporter et restaurer la base Firebase"
    >
      <p className={styles.sectionDesc}>
        <Download size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        L&apos;export télécharge un fichier JSON contenant toute la base. L&apos;import
        écrase tout par le contenu du fichier — fais une sauvegarde avant !
      </p>

      <div className={styles.actionsRow}>
        <Button onClick={handleExport} disabled={exporting || importing}>
          <Download size={14} />
          {exporting ? 'Export…' : 'Télécharger un backup'}
        </Button>

        <label className={styles.importBtn}>
          <Upload size={14} />
          {importing ? 'Import…' : 'Restaurer depuis un fichier'}
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            disabled={exporting || importing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = ''; // permettre re-sélection même fichier
            }}
          />
        </label>
      </div>

      <div className={styles.warningBox}>
        <AlertTriangle size={14} /> L&apos;import écrase{' '}
        <strong>l&apos;intégralité</strong> de la base. Toujours exporter avant
        d&apos;importer.
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Section 3 : AUDIT LOG
 * ═══════════════════════════════════════════════════════════════════ */

function AuditLogSection() {
  const { entries, loading } = useAuditLog({ limit: 200 });
  const [filter, setFilter] = useState<string>('all');

  const visible = entries.filter((e) => {
    if (filter === 'all') return true;
    return e.action === filter;
  });

  function fmtRelative(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    if (hr < 24) return `il y a ${hr}h`;
    if (days < 7) return `il y a ${days}j`;
    return new Date(ts).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  }

  return (
    <Card
      title="Journal d'audit"
      subtitle={`${entries.length} action(s) enregistrée(s)`}
    >
      <p className={styles.sectionDesc}>
        <ScrollText size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        Traçabilité des actions sensibles (créations, modifications, suppressions,
        exports, imports, compressions).
      </p>

      <div className={styles.filterRow}>
        {['all', 'create', 'update', 'delete', 'export', 'import', 'compress'].map(
          (f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.filterBtnOn : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Toutes' : ACTION_LABEL[f as keyof typeof ACTION_LABEL]}
            </button>
          )
        )}
      </div>

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <Wrench size={32} style={{ opacity: 0.3 }} />
          <p>
            {entries.length === 0
              ? 'Aucune action loggée pour le moment.'
              : 'Aucune action ne correspond au filtre.'}
          </p>
          {entries.length === 0 && (
            <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>
              Les actions seront enregistrées au fur et à mesure que tu intègres
              <code> logAction(...) </code> dans les pages.
            </p>
          )}
        </div>
      ) : (
        <ul className={styles.logList}>
          {visible.map((e) => (
            <li key={e.id} className={styles.logItem}>
              <div
                className={styles.logDot}
                style={{ background: ACTION_COLOR[e.action] }}
              />
              <div className={styles.logBody}>
                <div className={styles.logLine}>
                  <strong>{e.who}</strong>{' '}
                  <span
                    className={styles.logAction}
                    style={{
                      color: ACTION_COLOR[e.action],
                      borderColor: ACTION_COLOR[e.action] + '60',
                    }}
                  >
                    {ACTION_LABEL[e.action]}
                  </span>{' '}
                  <span className={styles.logTarget}>{e.target}</span>
                </div>
                <div className={styles.logDetail}>{e.detail}</div>
              </div>
              <div className={styles.logTime} title={new Date(e.when).toLocaleString('fr-FR')}>
                {fmtRelative(e.when)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Helper : compression d'une data URL
 * ═══════════════════════════════════════════════════════════════════ */

function compressDataUrl(
  dataUrl: string,
  maxSize: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Image invalide'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas non supporté'));
      ctx.drawImage(img, 0, 0, width, height);

      let out = canvas.toDataURL('image/webp', quality);
      if (!out.startsWith('data:image/webp')) {
        out = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(out);
    };
    img.src = dataUrl;
  });
}
