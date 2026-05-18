/**
 * Mini parser Markdown → HTML, sécurisé contre l'injection XSS.
 *
 * Stratégie :
 * 1. Échappe TOUT le HTML d'entrée d'abord (< → &lt;, etc.) — bloque le XSS
 * 2. Applique ensuite les conversions Markdown → balises HTML
 *
 * Supporté :
 *   # Titre h1
 *   ## Titre h2
 *   ### Titre h3
 *   **gras**
 *   *italique* ou _italique_
 *   `code inline`
 *   > citation (sur une ligne)
 *   - liste
 *   1. liste numérotée
 *   --- (séparateur)
 *   [texte](url)
 *   Paragraphes (lignes vides séparatrices)
 *
 * On reste volontairement simple pour ne pas dépendre d'une lib externe.
 * Si tu veux des features avancées plus tard, on pourra passer à `marked` ou `markdown-it`.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeUrl(url: string): string {
  // On bloque les URLs javascript: et data: pour éviter le XSS via les liens.
  const trimmed = url.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#';
  return trimmed.replace(/"/g, '&quot;');
}

export function renderMarkdown(md: string): string {
  if (!md) return '';

  // 1. Échappe tout le HTML
  let text = escapeHtml(md);

  // 2. Code inline `xxx` (à faire avant le reste pour protéger les caractères spéciaux)
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 3. Découpe en blocs séparés par lignes vides
  const blocks = text.split(/\n\s*\n/);

  const html = blocks
    .map((block) => {
      block = block.trim();
      if (!block) return '';

      // Séparateur horizontal
      if (/^-{3,}$/.test(block) || /^={3,}$/.test(block) || /^\*{3,}$/.test(block)) {
        return '<hr/>';
      }

      // Titres
      if (block.startsWith('### ')) return `<h3>${inline(block.slice(4))}</h3>`;
      if (block.startsWith('## ')) return `<h2>${inline(block.slice(3))}</h2>`;
      if (block.startsWith('# ')) return `<h1>${inline(block.slice(2))}</h1>`;

      // Citation : toutes les lignes du bloc commencent par >
      const lines = block.split('\n');
      if (lines.every((l) => l.startsWith('&gt;') || l.startsWith('>'))) {
        const inner = lines
          .map((l) => l.replace(/^(&gt;|>)\s?/, ''))
          .join('<br/>');
        return `<blockquote>${inline(inner)}</blockquote>`;
      }

      // Liste non numérotée : - item ou * item
      if (lines.every((l) => /^[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }

      // Liste numérotée : 1. item
      if (lines.every((l) => /^\d+\.\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('');
        return `<ol>${items}</ol>`;
      }

      // Paragraphe par défaut : les retours à la ligne dans un même bloc deviennent <br/>
      return `<p>${inline(lines.join('<br/>'))}</p>`;
    })
    .join('\n');

  return html;
}

/**
 * Applique les conversions inline : gras, italique, liens.
 */
function inline(s: string): string {
  // Liens [texte](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label: string, url: string) =>
      `<a href="${escapeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );

  // Gras **texte**
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

  // Italique *texte* ou _texte_
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');

  return s;
}

/**
 * Extrait un résumé court depuis du Markdown (pour les cards d'aperçu).
 * Retire le formatage et tronque à N caractères.
 */
export function markdownExcerpt(md: string, maxLen = 180): string {
  if (!md) return '';
  // Retire les caractères de formatage et les liens markdown
  const plain = md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [texte](url) → texte
    .replace(/[*_`#>-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

/**
 * Compte les mots dans du Markdown (pour l'indicateur dans l'éditeur).
 */
export function countWords(md: string): number {
  if (!md) return 0;
  return md
    .replace(/[*_`#>-]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
