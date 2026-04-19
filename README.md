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
| `admin` | `aysenLM69001toz` |

> Changer le mot de passe admin dès le premier déploiement via **Panel Admin → Modifier**.

---

## 📦 Stack technique

- **Langage** : HTML / CSS / JavaScript vanilla (aucun framework)
- **Base de données** : Firebase Realtime Database (`suna-police` project)
- **Stockage local** : `localStorage` (clé `suna_v4`) — fallback hors-ligne
- **Hachage MDP** : `crypto.subtle` SHA-256 (navigateur natif)
- **Fonts** : Google Fonts (Cinzel, Barlow Condensed, Share Tech Mono)

---

## 🗂️ Fonctionnalités

### Accessibles à tous les membres
| Section | Description |
|---|---|
| 📊 Tableau de bord | Vue d'ensemble : effectifs, recensés, plaintes actives, opérations |
| 📢 Annonces | Publication et lecture des communications officielles (épinglage possible) |
| 📝 Recensement | Fiches de recensement des civils / suspects |
| 🎖️ Recrutement | Candidatures, suivi et intégration des recrues |
| 📋 Plaintes | Dépôt et gestion des plaintes (ouvertes / en cours / résolues / rejetées) |
| 📜 Code Pénal | Consultation du code pénal par catégorie (délit → crime) |

### Réservées aux membres (non-visiteurs)
| Section | Description |
|---|---|
| 🗂️ Dossiers criminels | Création et suivi des dossiers judiciaires |
| 🚨 Opérations | Planification et suivi des opérations de terrain |
| 👮 Effectifs | Annuaire visuel des agents actifs avec photos |
| ⚖️ Sanctions / Promo | Historique des sanctions et promotions par agent |

### Réservées aux admins (gérants)
| Section | Description |
|---|---|
| ⚙️ Panel Admin | Gestion des comptes, grades, rôles et statistiques |

---

## 👥 Système de rôles

| Rôle | Libellé | Accès |
|---|---|---|
| `admin` | Admin | Toutes les sections + Panel Admin |
| `gerant` | Gérant | Membres + sections opérationnelles |
| `cogerant` | Co-Gérant | Idem gérant |
| `officier` | Officier | Membre standard |
| `sergent` | Sergent | Membre standard |
| `membre` | Membre | Membre standard |
| `stagiaire` | Stagiaire | Membre standard |
| `visiteur` | Visiteur | Sections publiques uniquement (recensement, plaintes, code pénal) |

> Les comptes créés via le formulaire d'inscription sont automatiquement attribués au rôle `visiteur` et au dernier grade de la liste. Un admin peut ensuite les promouvoir.

---

## 🔒 Sécurité

- Les mots de passe sont **hachés en SHA-256** côté client avant stockage (jamais en clair dans Firebase).
- La session "Se souvenir de moi" stocke uniquement `{id, hash}` en `localStorage`, **jamais dans Firebase**.
- Un compte désactivé est automatiquement déconnecté à la prochaine synchronisation Firebase.
- Il est impossible de supprimer ou désactiver le dernier admin actif.
- Un utilisateur ne peut pas supprimer son propre compte.

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

Activable via le bouton en haut à droite de l'interface. La préférence est sauvegardée en `localStorage`.

---

## 📱 Compatibilité mobile

L'interface est responsive avec une barre de navigation inférieure sur mobile. Le délai de clic iOS 300ms est supprimé via `touch-action: manipulation`.

---

## 📝 Notes de version

- **v4** — Synchronisation Firebase temps réel, hachage SHA-256, mode hors-ligne, session persistante
- Clé localStorage : `suna_v4`
