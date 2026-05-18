# Sunagakure v2 — Intranet (Next.js)

Réécriture de l'intranet Sunagakure de HTML monofichier (46k lignes) vers Next.js 15 modulaire.

## 🚀 Démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer Firebase
cp .env.example .env.local
# Édite .env.local avec tes vraies clés Firebase

# 3. Lancer en dev
npm run dev
# → http://localhost:3000
```

## 📁 Structure

```
src/
├── app/                    # Pages (Next.js App Router)
│   ├── layout.tsx          # Layout racine
│   ├── page.tsx            # Redirection vers /dashboard
│   ├── globals.css         # CSS global (variables, reset)
│   ├── login/              # Connexion (page sans sidebar)
│   ├── (intranet)/         # Groupe avec sidebar
│   │   ├── layout.tsx      # Layout sidebar + topbar
│   │   ├── dashboard/
│   │   ├── annonces/
│   │   ├── medical/
│   │   ├── juge/
│   │   ├── police/
│   │   └── ...
├── components/             # Composants réutilisables
│   ├── ui/                 # Boutons, modales, toasts, etc.
│   └── layout/             # Sidebar, Topbar
├── lib/                    # Logique métier + Firebase
│   ├── firebase.ts         # Init Firebase + auth anonyme
│   ├── auth.ts             # Helpers d'authentification
│   └── db.ts               # Helpers Realtime Database
├── hooks/                  # Hooks React custom
│   ├── useFirebaseValue.ts # Hook principal pour onValue
│   └── useAuth.ts          # Hook d'auth
├── styles/                 # CSS modulaire
└── types/                  # Types TypeScript partagés
```

## 🔄 Plan de migration (estimation : 2-4 mois)

Migrer **module par module**, ton ancien intranet reste en ligne pendant ce temps :

1. ✅ **Phase 1 — Coquille** (1 semaine)
   - Setup projet ✅
   - Sidebar + Topbar + Routing ✅
   - Auth Firebase anonyme ✅
   - Page Login

2. **Phase 2 — Pages simples** (1-2 semaines)
   - Annonces (CRUD basique, exemple complet fourni)
   - Histoire / Code pénal (lecture seule)
   - Dashboard

3. **Phase 3 — Premier module métier** (2-3 semaines)
   - **Médical** recommandé (riche mais isolé du reste)
   - Patients, Consultations, Pharmacie, Dons, Psy

4. **Phase 4 — Missions** (2 semaines)
   - Disponibles, Actives, Récompenses, Comptabilité

5. **Phase 5 — Gros morceau** (1-2 mois)
   - Juge + Avocat + Police (très interconnectés, à faire ensemble)

6. **Phase 6 — Reste** (2-3 semaines)
   - Diplomatie, Impôts, Adoptions, Hiérarchie, Effectifs, Équipes
   - Admin + Code pénal

7. **Phase 7 — Bascule** (1 weekend)
   - Annonce 1 semaine à l'avance
   - Déploiement Vercel
   - DNS switch
   - Ancien intranet en backup 2-3 semaines

## 🔥 Patterns clés à connaître

### Lire des données Firebase en temps réel

```tsx
'use client';
import { useFirebaseValue } from '@/hooks/useFirebaseValue';

export default function MaPage() {
  const { data: patients, loading } = useFirebaseValue<Record<string, Patient>>('medical/patients');

  if (loading) return <div>Chargement...</div>;

  return (
    <ul>
      {Object.entries(patients ?? {}).map(([id, p]) => (
        <li key={id}>{p.nom}</li>
      ))}
    </ul>
  );
}
```

### Écrire des données

```tsx
import { dbSet, dbPush, dbUpdate } from '@/lib/db';

// Créer avec ID auto
await dbPush('medical/patients', { nom: 'Tanaka', age: 32 });

// Définir à un chemin précis
await dbSet(`medical/patients/${id}`, patient);

// Mise à jour partielle
await dbUpdate(`medical/patients/${id}`, { age: 33 });
```

## ⚠️ Pièges à éviter

- **Composants client** : ajoute `'use client'` en haut de tout fichier qui utilise des hooks, du state, ou du Firebase realtime. Le default Next.js c'est Server Components, qui ne peuvent PAS faire du onValue temps réel.
- **Listener cleanup** : toujours retourner la fonction `off()` dans le `useEffect`, sinon fuites mémoire à chaque navigation.
- **Variables d'env** : préfixées `NEXT_PUBLIC_` pour être accessibles côté client.
- **Pas de manipulation DOM directe** : oublie `document.getElementById`, laisse React gérer.

## 🚢 Déploiement (Vercel, gratuit)

```bash
npm install -g vercel
vercel
# Suis les instructions, ajoute les variables d'env dans le dashboard Vercel
```
