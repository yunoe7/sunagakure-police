'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Page HISTOIRE — archives du village (lore)
 * ════════════════════════════════════════════════════════════════
 *
 * - Stockage Firebase : sunagakure/lore_articles (objet à clés id)
 * - Contenu en Markdown (gras, italique, listes, citations…)
 * - Tri chronologique (plus récent en premier)
 * - Filtres : Tous / Publiés / Brouillons
 * - Vue éclatée : liste d'articles + modal d'édition avec preview live
 * ════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Search,
  Eye,
  EyeOff,
  ScrollText,
  Calendar,
  User,
} from 'lucide-react';

import { useFirebaseValue } from '@/hooks/useFirebaseValue';
import { dbSet, dbRemove } from '@/lib/db';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { renderMarkdown, markdownExcerpt, countWords } from '@/lib/markdown';
import {
  type LoreArticle,
  ERA_SUGGESTIONS,
  LORE_CATEGORIES,
} from '@/types/lore';

import styles from './page.module.css';

const FB_PATH = 'lore_articles';

type Filter = 'all' | 'published' | 'draft';

export default function HistoirePage() {
  // ─── Lecture temps réel ───
  const { data, loading } = useFirebaseValue<Record<string, LoreArticle>>(FB_PATH);

  // ─── État local ───
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<LoreArticle>>({});
  const [previewMode, setPreviewMode] = useState(false);

  // ─── Liste filtrée + triée ───
  const articles = useMemo(() => {
    if (!data) return [];
    const arr = Object.values(data).filter(
      (a): a is LoreArticle => a !== null && typeof a === 'object' && !!a.id
    );
    const q = search.trim().toLowerCase();
    return arr
      .filter((a) => {
        if (filter === 'published' && !a.published) return false;
        if (filter === 'draft' && a.published) return false;
        if (!q) return true;
        const s = ((a.title || '') + ' ' + (a.content || '') + ' ' + (a.era || '') + ' ' + (a.author || '')).toLowerCase();
        return s.includes(q);
      })
      .sort((a, b) => (b.createdAt ?? b.id ?? 0) - (a.createdAt ?? a.id ?? 0));
  }, [data, search, filter]);

  const viewing = viewingId ? articles.find((a) => a.id === viewingId) : null;

  // ─── Handlers ───
  function openCreate() {
    setEditingId(null);
    setForm({
      title: '',
      content: '',
      era: '',
      cat: '',
      author: '',
      published: false,
    });
    setPreviewMode(false);
    setShowEditor(true);
  }

  function openEdit(a: LoreArticle) {
    setEditingId(a.id);
    setForm(a);
    setPreviewMode(false);
    setShowEditor(true);
    setViewingId(null); // ferme la lecture si ouverte
  }

  function closeEditor() {
    setShowEditor(false);
    setEditingId(null);
    setForm({});
    setPreviewMode(false);
  }

  async function handleSave(asPublished: boolean) {
    if (!form.title?.trim()) {
      toast.error('Le titre est obligatoire');
      return;
    }
    if (!form.content?.trim()) {
      toast.error('Le contenu est vide');
      return;
    }

    try {
      const now = Date.now();
      const article: LoreArticle = {
        id: editingId ?? now,
        title: form.title!.trim(),
        content: form.content!,
        era: form.era?.trim() || undefined,
        cat: form.cat || undefined,
        author: form.author?.trim() || undefined,
        published: asPublished,
        createdAt: editingId ? (form.createdAt ?? now) : now,
        updatedAt: now,
      };

      await dbSet(`${FB_PATH}/${article.id}`, article);

      toast.success(
        editingId
          ? asPublished
            ? 'Article publié'
            : 'Brouillon enregistré'
          : asPublished
            ? 'Article publié'
            : 'Brouillon créé'
      );
      closeEditor();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde');
    }
  }

  async function handleDelete(a: LoreArticle) {
    const ok = await confirmAction({
      title: "Supprimer l'article",
      message: `Supprimer "${a.title}" des archives ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await dbRemove(`${FB_PATH}/${a.id}`);
      toast.success('Article supprimé');
      if (viewingId === a.id) setViewingId(null);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  // ─── Stats pour le hero ───
  const totalArticles = data ? Object.keys(data).length : 0;
  const publishedCount = data
    ? Object.values(data).filter((a) => a && (a as LoreArticle).published).length
    : 0;

  // ─── Rendu ───
  return (
    <>
      <Card
        title="Histoire"
        subtitle="Archives officielles du village"
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> Nouvel article
          </Button>
        }
      >
        {/* Stats hero */}
        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <div className={styles.overline}>Archives officielles</div>
            <h2 className={styles.heroTitle}>
              Mémoire du <span>Pays du Vent</span>
            </h2>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <div className={styles.statVal}>{totalArticles}</div>
              <div className={styles.statLbl}>Articles</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{publishedCount}</div>
              <div className={styles.statLbl}>Publiés</div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Rechercher dans les archives…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.filters}>
            <button
              className={`${styles.fbtn} ${filter === 'all' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('all')}
            >
              Tous
            </button>
            <button
              className={`${styles.fbtn} ${filter === 'published' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('published')}
            >
              Publiés
            </button>
            <button
              className={`${styles.fbtn} ${filter === 'draft' ? styles.fbtnOn : ''}`}
              onClick={() => setFilter('draft')}
            >
              Brouillons
            </button>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : articles.length === 0 ? (
          <div className={styles.empty}>
            <ScrollText size={32} style={{ opacity: 0.3 }} />
            <p>
              {search || filter !== 'all'
                ? 'Aucun article pour ces critères.'
                : 'Les archives sont vides. Écris le premier article !'}
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {articles.map((a) => (
              <article
                key={a.id}
                className={`${styles.entry} ${!a.published ? styles.draft : ''}`}
                onClick={() => setViewingId(a.id)}
              >
                {a.era && <div className={styles.eraTag}>{a.era}</div>}
                <h3 className={styles.entryTitle}>{a.title}</h3>
                <p className={styles.excerpt}>{markdownExcerpt(a.content, 220)}</p>
                <div className={styles.meta}>
                  {a.author && (
                    <span>
                      <User size={11} /> {a.author}
                    </span>
                  )}
                  <span>
                    <Calendar size={11} /> {fmtDate(a.createdAt ?? a.id)}
                  </span>
                  {!a.published && (
                    <span className={styles.draftBadge}>
                      <EyeOff size={11} /> Brouillon
                    </span>
                  )}
                  {a.cat && <span className={styles.catBadge}>{a.cat}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      {/* Modale de LECTURE d'article */}
      <Modal
        open={!!viewing}
        onClose={() => setViewingId(null)}
        title={viewing?.title || ''}
        size="lg"
        footer={
          viewing && (
            <>
              <Button
                variant="ghost"
                onClick={() => handleDelete(viewing)}
              >
                <Trash2 size={14} /> Supprimer
              </Button>
              <Button onClick={() => openEdit(viewing)}>
                Modifier
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className={styles.viewer}>
            {viewing.era && <div className={styles.viewerEra}>{viewing.era}</div>}
            <div className={styles.viewerMeta}>
              {viewing.author && (
                <span>
                  <User size={12} /> {viewing.author}
                </span>
              )}
              <span>
                <Calendar size={12} /> {fmtDate(viewing.createdAt ?? viewing.id)}
              </span>
              {viewing.cat && <span className={styles.catBadge}>{viewing.cat}</span>}
            </div>
            <div
              className={styles.viewerContent}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(viewing.content) }}
            />
          </div>
        )}
      </Modal>

      {/* Modale d'ÉDITION */}
      <Modal
        open={showEditor}
        onClose={closeEditor}
        title={editingId ? "Modifier l'article" : 'Nouvel article'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreviewMode((p) => !p)}>
              <Eye size={14} /> {previewMode ? 'Éditer' : 'Aperçu'}
            </Button>
            <div style={{ flex: 1 }} />
            <Button variant="outline" onClick={closeEditor}>
              Annuler
            </Button>
            <Button variant="outline" onClick={() => handleSave(false)}>
              <Save size={14} /> Brouillon
            </Button>
            <Button onClick={() => handleSave(true)}>
              📜 Publier
            </Button>
          </>
        }
      >
        <div className={styles.editor}>
          {/* Méta */}
          <div className={styles.editorMeta}>
            <label className={styles.full}>
              Titre *
              <input
                type="text"
                value={form.title ?? ''}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
                placeholder="Ex: La Grande Tempête de Suna"
              />
            </label>
            <div className={styles.metaRow}>
              <label>
                Ère
                <input
                  type="text"
                  list="era-suggestions"
                  value={form.era ?? ''}
                  onChange={(e) => setForm({ ...form, era: e.target.value })}
                  placeholder="Ex: Ère ancienne"
                />
                <datalist id="era-suggestions">
                  {ERA_SUGGESTIONS.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </label>
              <label>
                Catégorie
                <select
                  value={form.cat ?? ''}
                  onChange={(e) => setForm({ ...form, cat: e.target.value })}
                >
                  <option value="">—</option>
                  {LORE_CATEGORIES.map((c) => (
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
                  value={form.author ?? ''}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  placeholder="Toi"
                />
              </label>
            </div>
          </div>

          {/* Contenu : éditeur OU aperçu */}
          {previewMode ? (
            <div className={styles.previewBox}>
              <div
                className={styles.viewerContent}
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(form.content || '*(rien à afficher)*'),
                }}
              />
            </div>
          ) : (
            <>
              <label className={styles.contentLabel}>
                Contenu (Markdown)
                <textarea
                  rows={14}
                  value={form.content ?? ''}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder={`# Titre principal\n\nUn paragraphe avec du **gras** et de l'*italique*.\n\n## Sous-titre\n\n- Point 1\n- Point 2\n\n> Une citation marquante.`}
                />
              </label>
              <div className={styles.editorHint}>
                <strong>Astuces Markdown :</strong> <code># Titre</code>{' '}
                <code>**gras**</code> <code>*italique*</code>{' '}
                <code>`code`</code> <code>&gt; citation</code>{' '}
                <code>- liste</code> <code>[lien](url)</code>
                <span className={styles.wordCount}>
                  {countWords(form.content || '')} mots
                </span>
              </div>
            </>
          )}
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
    month: 'long',
    year: 'numeric',
  });
}
