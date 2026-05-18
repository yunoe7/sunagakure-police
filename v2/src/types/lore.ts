/**
 * Types du module Histoire (lore du village).
 *
 * Stockage Firebase : `sunagakure/lore_articles` (objet à clés id)
 * Le préfixe `sunagakure/` est ajouté automatiquement par db.ts.
 *
 * Note : différent de l'ancien intranet qui stockait en localStorage.
 * Avec Firebase, les articles sont maintenant partagés entre tous les joueurs.
 */

export interface LoreArticle {
  id: number;          // timestamp (Date.now())
  title: string;
  era?: string;        // ex: "Ère ancienne", "Période moderne"
  cat?: string;        // catégorie
  author?: string;
  content: string;     // Markdown
  published: boolean;  // true = publié, false = brouillon
  createdAt: number;
  updatedAt?: number;
}

// Suggestions d'ères pour le formulaire (libre, l'utilisateur peut taper la sienne)
export const ERA_SUGGESTIONS = [
  'Ère ancienne',
  'Fondation du village',
  'Première guerre shinobi',
  'Deuxième guerre shinobi',
  'Troisième guerre shinobi',
  'Quatrième guerre shinobi',
  'Ère moderne',
  'Époque actuelle',
];

// Catégories
export const LORE_CATEGORIES = [
  'Histoire générale',
  'Personnages',
  'Batailles',
  'Clans',
  'Traditions',
  'Lieux',
  'Légendes',
  'Autre',
];
