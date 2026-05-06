# Sunagakure Intranet

Application web tout-en-un pour la gestion administrative et opérationnelle du village caché de Sunagakure (jeu de rôle Naruto). Couvre la Police, le Tribunal, le Cabinet d'avocats, les Missions, l'Hôpital et la Diplomatie dans une seule interface, avec sync multi-utilisateurs en temps réel via Firebase.

## Architecture

Application monofichier en HTML/CSS/JS vanilla. Tout tient dans `index.html` (~1,75 Mo). Aucune compilation, aucune dépendance npm — il suffit d'ouvrir le fichier dans un navigateur ou de le servir en statique.

Les données sont stockées dans `localStorage` côté client et synchronisées via Firebase Realtime Database pour les sessions multi-utilisateurs. Si Firebase est indisponible, l'application reste pleinement fonctionnelle en mode hors-ligne.

## Sections

### Police de Sunagakure
- **Dossiers criminels** — fiches suspects avec infractions, dangerosité (Faible → Extrême), statut (Recherché, G.À.V., Incarcéré, Libéré, Surveillé), amendes payées/impayées, photo, tags personnalisables, marqueur défunt
- **Plaintes** — système de plaintes avec référence auto au format `POL-2026-NNN`, transmission au Tribunal, photo de l'accusé
- **Recensement** — registre des shinobis du village avec faction, nature de chakra, métier, clan, compétences, grade
- **Sanctions disciplinaires** — promotions, félicitations, avertissements, exclusions
- **Opérations** — planification d'arrestations, perquisitions, surveillance avec géolocalisation
- **Bingo Book** — registre des criminels recherchés inter-villages avec primes
- **Code pénal** — référentiel des infractions et peines

### Tribunal
- **Affaires** — dossiers judiciaires avec numéro auto `TRIB-2026-NNN`
- **Délibérés collégiaux** — vote des juges (Acquitté / Coupable / Charges réduites) avec verdict majoritaire pré-sélectionné lors du jugement final
- **Audiences** — calendrier des sessions
- **Jugements rendus** — verdict, motifs juridiques, sanctions
- **Jurisprudence** — création de précédents depuis n'importe quel jugement final (acquittement, culpabilité, charges réduites)

### Cabinet d'avocats
- Dossiers de défense, consultations, archives juridiques

### Missions
- Attribution de missions aux équipes, suivi de progression, comptes-rendus

### Hôpital
- **Patients** — admissions, chambres, pathologies
- **Consultations** — fiches médicales avec compte-rendu
- **Pharmacie** — inventaire, seuils d'alerte
- **Psychologie** — suivi psychiatrique
- **Don de sang** — banque de sang par groupe
- **Études scientifiques** — recherches médicales
- **Morgue & Légiste** — registre des décès
- **Comptabilité** — actes facturés

### Diplomatie
- **Laissez-passer** — émission, révocation, suivi des autorisations de séjour
- Relations inter-villages

## Système de rôles

Hiérarchie à 9 niveaux :

| Rôle | Couleur | Permissions |
|---|---|---|
| 🔴 Admin | Rouge | Accès total, dont panel admin |
| 🎖️ Haut Commandement | Violet | Oversight transverse — voit toutes sections, peut modifier partout, **sauf** panel admin |
| 🏛️ Gérant | Or | Direction d'une section, peut éditer grades/rôles |
| 🥈 Co-Gérant | Cyan | Bras droit du Gérant |
| ⚔️ Sergent | Orange | Commandement de terrain |
| 🔵 Officier | Bleu | Agent opérationnel |
| 👥 Membre | Vert | Lecture + actions de base |
| 🌱 Stagiaire | Gris | Recrue en formation |
| 👁 Visiteur | Gris | Lecture seule |

**Garde-fous de sécurité :**
- Seul un Admin peut promouvoir ou retirer le rôle Haut Commandement
- Seuls Admin/Gérant peuvent modifier grades et rôles (avec vérification serveur)
- Les rôles transversaux (admin, hautcommandement) ont un bypass propre dans la navigation

## Système de grades shinobi

Du junior au senior, chaque grade a sa propre couleur distinctive :

1. Genin (gris ardoise)
2. Genin Confirmé (vert)
3. Chunin (cyan)
4. Tokubetsu Chunin (teal)
5. Kakunin (lime)
6. Tokubetsu Jonin (indigo)
7. Jonin (violet)
8. **Sairin** (rose)
9. Commandant Jonin (rouge écarlate)
10. Kazekage (or doré, gradient sur la fiche détaillée)

Chaque grade dispose d'un montant d'impôts par défaut, modifiable par les admins.

## Fonctionnalités transverses

### Messagerie interne
Conversations privées 1-à-1 entre utilisateurs avec présence en temps réel, badges de notification, indicateur de lecture.

### Recherche unifiée
- **Recensement** : recherche multi-mots (logique ET) sur nom, prénom, faction, nature, métier, clan, notes, âge, sexe — un seul champ remplace tous les filtres déroulants
- **Tribunal "Plaintes reçues"** : recherche par référence (`POL-2026-001`), accusé, plaignant, type, description
- **Dossiers, Plaintes, Candidatures** : recherche libre sur les champs principaux

### Autocomplétion intelligente
Le champ "Nom RP du suspect" lors de la création/édition d'un dossier criminel propose en autocomplétion les noms du recensement, avec rang et faction. Navigation clavier (↑/↓/Entrée/Échap) supportée. Détection automatique des doublons : si le suspect a déjà un dossier ouvert, une alerte propose d'aller le modifier au lieu d'en créer un nouveau.

### Tri des tableaux
- **Tri par en-tête de colonne** : clic sur Réf., Nom, Date, Statut, Dangerosité, Amendes, etc. avec indicateur ↑/↓ persistant après re-render
- **Tri logique des statuts** : "à traiter" en haut, "terminés" en bas (pas d'ordre alphabétique aveugle)
- **Tri par amende** : impayés en premier (asc) ou payés en premier (desc), tri secondaire par montant
- **Tri par défunts** : option dédiée dans le dropdown + cycle 3 états (Visibles → Masqués → En premier) sur le bouton dédié dans la page Dossiers

### Synchronisation Firebase
Synchronisation temps réel entre tous les clients connectés : ajouts, modifications et suppressions sont propagés immédiatement. Garde-fous :
- Détection des suppressions distantes (un dossier supprimé par un autre joueur disparaît chez tous)
- Préservation des modifications locales en cours d'édition (re-render skippé tant qu'un modal est ouvert)
- Backfill automatique des références plaintes pour les anciennes données

### Filtres rapides Dossiers
Boutons de filtres en lignes :
- **Dangerosité** : Tous / Faible / Modéré / Élevé / Extrême
- **Statut** : Tous / Recherché / G.À.V. / Incarcéré / Libéré / Surveillé
- **Défunts** : cycle 3 états

## Stack technique

- **HTML5** + **CSS3** (variables CSS, flexbox, grid, animations)
- **JavaScript vanilla** (ES6+, sans framework)
- **Firebase Realtime Database** pour la sync multi-utilisateurs
- **Chart.js** pour les graphiques (effectifs, statistiques)
- **Polices** : Cinzel (titres), Share Tech Mono (codes/IDs), Barlow (corps)
- **Storage** : `localStorage` pour la persistance locale, Firebase pour la sync

## Installation

```bash
# Aucune installation requise — ouvrir directement le fichier
open index.html

# Ou servir en statique
python3 -m http.server 8000
# Puis http://localhost:8000
```

Pour la sync multi-utilisateurs, configurer une base Firebase Realtime Database et renseigner les credentials dans le `<script>` de configuration Firebase en haut du fichier.

## Sauvegarde et restauration

Le panel admin propose un export JSON complet (sans les mots de passe) et une restauration par import. Les exports peuvent aussi être faits en CSV pour les plaintes, recensement, sanctions, candidatures.

## Compatibilité

Testé sur Chrome, Firefox, Safari (desktop et mobile). Mobile responsive avec adaptations spécifiques :
- Sidebar latérale convertie en drawer
- Tables converties en cards verticales
- Modals plein écran
- Bouton retour mobile dans la messagerie

## Lore

Au cœur du Pays du Vent, la Police de Sunagakure veille sur l'ordre du village caché du sable. *« Que nul individu fiché n'échappe à la mémoire du Désert. »*
