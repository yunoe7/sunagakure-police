# 🚔 Police Sunagakure — Portail Intranet

Portail intranet tout-en-un pour la gestion de la Police de Sunagakure (serveur RP).
Application **100% front-end** en fichier HTML unique, synchronisée en temps réel via Firebase Realtime Database.

---

## 🚀 Déploiement

L'application est un **fichier HTML auto-suffisant** (`index.html`). Aucune installation ni serveur back-end requis.

### Hébergement recommandé
| Plateforme | Méthode | Lien |
|---|---|---|
| **Netlify** | Glisser-déposer le fichier sur Netlify Drop | [netlify.com/drop](https://netlify.com/drop) |
| **GitHub Pages** | Pousser le fichier sur un repo public | [pages.github.com](https://pages.github.com) |
| Tout hébergeur statique | Upload via FTP/panel | — |

> ⚠️ Le fichier doit être servi via **HTTPS** pour que Firebase et le hachage des mots de passe (`crypto.subtle`) fonctionnent correctement.

---

## 🔑 Connexion par défaut

| Identifiant | Mot de passe |
|---|---|
| `????` | `????` |

> Changer le mot de passe admin dès le premier déploiement via **Panel Admin → Modifier**.

---

## 📦 Stack technique

- **Langage** : HTML / CSS / JavaScript vanilla (aucun framework)
- **Base de données** : Firebase Realtime Database (`suna-police` project)
- **Stockage local** : `localStorage` (clé `suna_v4`) — fallback hors-ligne
- **Hachage MDP** : `crypto.subtle` SHA-256 (navigateur natif)
- **Graphiques** : Chart.js 4.4 (CDN)
- **Fonts** : Google Fonts (Cinzel, Barlow Condensed, Share Tech Mono)

---

## 🗂️ Fonctionnalités

### Accessibles à tous les membres
| Section | Description |
|---|---|
| 📊 Tableau de bord | Vue d'ensemble : effectifs, recensés, plaintes actives, opérations + graphiques temps réel |
| 📢 Annonces | Publication et lecture des communications officielles (épinglage possible) |
| 📝 Recensement | Fiches de recensement des civils / suspects avec filtres actifs visibles |
| 🎖️ Recrutement | Candidatures, suivi et intégration des recrues |
| 📋 Plaintes | Dépôt et gestion des plaintes — lien automatique vers dossier criminel et fiche recensement |
| 📜 Code Pénal | Consultation du code pénal par catégorie (délit → crime) |

### Réservées aux membres (non-visiteurs)
| Section | Description |
|---|---|
| 🗂️ Dossiers criminels | Création et suivi des dossiers judiciaires |
| 🚨 Opérations | Planification et suivi des opérations de terrain + vue calendrier |
| 👮 Effectifs | Annuaire visuel des agents actifs avec photos + graphiques de répartition |
| 🏛️ Hiérarchie | Organigramme officiel avec les 5 grades dans l'ordre, membres et postes vacants |
| ⚖️ Sanctions / Promo | Historique des sanctions et promotions par agent |
| 💬 Messagerie | Messagerie interne entre membres |
| 👤 Mon profil | Statistiques personnelles, activité récente, changement de mot de passe |

### Réservées aux admins / gérants
| Section | Description |
|---|---|
| ⚙️ Panel Admin | Gestion des comptes, grades, rôles, statistiques, journal d'audit exportable |

---

## 👥 Système de rôles

| Rôle | Libellé | Accès |
|---|---|---|
| `admin` | 🔴 Admin | Toutes les sections + Panel Admin |
| `gerant` | 🏛️ Gérant | Direction — modification + toutes sections membres |
| `cogerant` | 🥈 Co-Gérant | Idem Gérant |
| `sergent` | ⚔️ Sergent | Modification + toutes sections membres |
| `officier` | 🔵 Officier | Membre opérationnel |
| `stagiaire` | 🌱 Stagiaire | Membre en formation |
| `visiteur` | 👁 Visiteur | Sections publiques uniquement (annonces, recensement, plaintes, code pénal) |

> Les comptes créés via le formulaire d'inscription sont automatiquement attribués au rôle `visiteur`. Un admin peut ensuite les promouvoir.

### Permissions de modification (`canModify`)
Les rôles **admin**, **gérant**, **co-gérant** et **sergent** peuvent créer/modifier/supprimer des entrées (annonces, dossiers, opérations, sanctions, code pénal…). Les officiers et stagiaires ont un accès en lecture seule aux sections membres.

---

## 🏛️ Hiérarchie & Organigramme

La page **Hiérarchie** affiche l'organigramme officiel en temps réel :

```
🏛️ Gérant
    ↓
🥈 Co-Gérant
    ↓
⚔️ Sergent
    ↓
🔵 Officier
    ↓
🌱 Stagiaire
```

Chaque grade affiche les membres actifs avec photo, grade RP et un indicateur de statut. Les postes vacants sont signalés automatiquement.

---

## 🔒 Sécurité

- Les mots de passe sont **hachés en SHA-256** côté client avant stockage (jamais en clair dans Firebase).
- La session "Se souvenir de moi" stocke uniquement `{id, hash}` en `localStorage`, **jamais dans Firebase**.
- Un compte désactivé est automatiquement déconnecté à la prochaine synchronisation Firebase.
- Il est impossible de supprimer ou désactiver le dernier admin actif.
- Un utilisateur ne peut pas supprimer son propre compte.
- Une **confirmation de déconnexion** est demandée pour éviter les déconnexions accidentelles.

### Reset d'urgence
Si le mot de passe admin est perdu, un lien **"Réinitialiser les données"** apparaît sur l'écran de connexion après une tentative échouée avec l'identifiant `admin`. Cette action efface toutes les données et restaure les paramètres d'usine.

---

## 🔧 Configuration Firebase

Le projet Firebase est déjà configuré dans le fichier. Pour utiliser votre propre base :

1. Créer un projet sur [console.firebase.google.com](https://console.firebase.google.com)
2. Activer **Realtime Database** (mode test ou avec règles adaptées)
3. Remplacer le bloc `firebaseConfig` dans le fichier HTML :

```js
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_PROJECT.firebaseapp.com",
  projectId: "VOTRE_PROJECT",
  storageBucket: "VOTRE_PROJECT.firebasestorage.app",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId: "VOTRE_APP_ID",
  databaseURL: "https://VOTRE_PROJECT-default-rtdb.europe-west1.firebasedatabase.app"
};
```

### Règles Realtime Database recommandées
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
> Pour la production, restreindre l'accès selon vos besoins.

---

## 🌙 Mode sombre

Activable via le bouton 🌙 en haut à droite de l'interface. La préférence est sauvegardée en `localStorage`.

---

## 📱 Compatibilité mobile

Interface entièrement responsive avec :
- Barre de navigation inférieure à 4 onglets
- Drawer "Plus" pour les sections secondaires
- Swipe horizontal entre les pages principales
- Swipe vertical pour fermer les modales (bottom sheets)
- Pull-to-refresh pour forcer la synchronisation Firebase
- FAB contextuel (+) selon la page active
- Suppression du délai 300ms iOS via `touch-action: manipulation`
- Scroll-to-top automatique

---

## 📊 Graphiques

Deux types de graphiques propulsés par **Chart.js** :

| Emplacement | Graphique |
|---|---|
| Tableau de bord | Plaintes sur les 30 derniers jours (courbe) |
| Tableau de bord | Recensement par faction (donut) |
| Effectifs | Répartition des agents par rôle (barres) |
| Effectifs | Répartition des agents par grade (donut) |

Les graphiques se mettent à jour automatiquement et supportent le mode sombre.

---

## 📋 Journal d'audit

Disponible dans le **Panel Admin**, le journal d'audit enregistre toutes les actions importantes (publications, modifications, sanctions, connexions…) avec horodatage. Exportable en CSV.

---

## 🏷️ Filtres actifs

Sur la page **Recensement**, les filtres appliqués (faction, nature, recherche texte) apparaissent sous forme de chips supprimables en un clic.

---

## 🔗 Liaison plainte → dossier

Lors de la consultation d'une plainte, si l'accusé possède un **dossier criminel** ou une **fiche de recensement**, des boutons de navigation directe apparaissent automatiquement dans la modale.

---

## 📝 Notes de version

- **v5** — Hiérarchie & organigramme, 5 rôles officiels (gérant/co-gérant/sergent/officier/stagiaire), graphiques effectifs, filtres chips recensement, confirmation déconnexion, journal d'audit, liaison plainte→dossier, corrections stabilité
- **v4** — Synchronisation Firebase temps réel, hachage SHA-256, mode hors-ligne, session persistante, messagerie interne, profil, graphiques dashboard, calendrier opérations, pull-to-refresh, swipe mobile
- Clé localStorage : `suna_v4`
