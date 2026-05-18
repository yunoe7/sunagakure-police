# Guide de migration page par page

Ce document explique **comment migrer une page de l'ancien intranet vers Next.js**, en suivant un workflow reproductible.

---

## Workflow général (à répéter pour chaque page)

### 1. Identifier les éléments à migrer

Dans l'ancien `index.html`, repère :
- **L'HTML** : le bloc `<div id="page-XXX">…</div>`
- **Le CSS** : les classes utilisées dans ce bloc
- **Le JS** : toutes les fonctions qui touchent à cette page
- **Le chemin Firebase** : où sont stockées les données (ex: `medical/patients`)
- **Le state local** : variables globales liées à cette page

### 2. Créer le fichier Next.js

```
src/app/(intranet)/<module>/<page>/page.tsx
src/app/(intranet)/<module>/<page>/page.module.css   ← styles scopés
```

### 3. Adapter le code (mental model)

| Ancien intranet (HTML/JS) | Next.js (React) |
|---|---|
| `document.getElementById('x').innerHTML = ...` | `setState(...)` + JSX |
| `onValue(ref(db, 'patients'), snap => ...)` | `useFirebaseValue('patients')` |
| `window._fbPush(ref(db, 'x'), value)` | `await dbPush('x', value)` |
| `window._fbUpdate(ref(db, 'x/' + id), data)` | `await dbUpdate('x/' + id, data)` |
| `showToast('Sauvé', 'success')` | `toast.success('Sauvé')` |
| `<button onclick="foo()">` | `<button onClick={foo}>` |
| Variable globale `currentPatient` | `const [currentPatient, setCurrentPatient] = useState(null)` |
| `if(active) el.classList.add('active')` | `className={active ? styles.active : ''}` |
| `document.addEventListener('keydown', …)` | `useEffect(() => { document.addEventListener(…); return () => document.removeEventListener(…); }, [])` |

### 4. Tester

```bash
npm run dev
# Ouvre http://localhost:3000/<module>/<page>
# Compare avec l'ancien intranet ouvert dans un autre onglet
```

### 5. Itérer

Tu remarqueras des bugs/différences. Corrige-les **avant de passer à la page suivante**, sinon tu accumules de la dette.

---

## Exemple concret : migrer "Annonces"

### Étape 1 — Repérer dans `index.html`

```bash
# Cherche le bloc HTML
grep -n 'id="page-annonces"' index.html

# Cherche les fonctions liées
grep -n 'function.*annonce\|annonce.*function' index.html

# Cherche le chemin Firebase
grep -n "ref(.*annonces\|'annonces'" index.html
```

### Étape 2 — Créer les types

```ts
// src/types/annonce.ts
export interface Annonce {
  id: string;
  titre: string;
  contenu: string;
  auteur?: string;
  createdAt: number;
  pinned?: boolean;
}
```

### Étape 3 — Copier la page Patients et adapter

```bash
cp src/app/\(intranet\)/medical/patients/page.tsx \
   src/app/\(intranet\)/annonces/page.tsx
cp src/app/\(intranet\)/medical/patients/page.module.css \
   src/app/\(intranet\)/annonces/page.module.css
```

Puis dans `page.tsx` :
- Remplace `import type { Patient }` par `import type { Annonce }`
- Remplace `'medical/patients'` par `'annonces'`
- Adapte les champs du formulaire (titre, contenu au lieu de nom, prénom, âge)
- Adapte les colonnes du tableau

---

## Patterns courants

### Filtrer / trier une collection

```tsx
const sorted = useMemo(() => {
  if (!data) return [];
  return Object.entries(data)
    .map(([id, v]) => ({ ...v, id }))
    .filter((x) => /* condition */)
    .sort((a, b) => b.createdAt - a.createdAt);  // plus récent d'abord
}, [data]);
```

### Compter des éléments par catégorie

```tsx
const stats = useMemo(() => {
  if (!data) return {};
  return Object.values(data).reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}, [data]);
```

### Multi-sources (joindre plusieurs collections)

```tsx
const { data: patients } = useFirebaseValue<Record<string, Patient>>('medical/patients');
const { data: consultations } = useFirebaseValue<Record<string, Consultation>>('medical/consultations');

const consultationsByPatient = useMemo(() => {
  if (!consultations) return {};
  return Object.values(consultations).reduce((acc, c) => {
    (acc[c.patientId] = acc[c.patientId] || []).push(c);
    return acc;
  }, {} as Record<string, Consultation[]>);
}, [consultations]);
```

### Confirmer une action destructive

Pour l'instant on utilise `confirm()` natif (rapide à coder). Plus tard, remplace par un composant `ConfirmDialog` qui réutilise le style des modales.

### Loading skeleton plutôt que "Chargement…"

```tsx
{loading ? (
  <div className={styles.skeleton}>
    {[1, 2, 3].map((i) => <div key={i} className={styles.skeletonRow} />)}
  </div>
) : (
  /* contenu */
)}
```

---

## Pièges spécifiques à Next.js que tu vas rencontrer

### "useState/useEffect is not defined"

→ Tu as oublié `'use client';` en haut du fichier. Next.js par défaut crée des **Server Components** qui ne peuvent pas utiliser de hooks. Ajoute cette directive en première ligne.

### "Hydration mismatch"

→ Tu rends du contenu différent entre le serveur et le client. Cause fréquente : `new Date()` ou `Math.random()` au premier rendu. Solution : utilise `useEffect` pour les valeurs dynamiques, ou marque le composant comme `'use client'` + protège avec un `useEffect`.

### "Cannot read properties of undefined"

→ Tes données Firebase ne sont pas encore arrivées. Toujours gérer `loading` ET `data === null`.

```tsx
if (loading) return <Spinner />;
if (!data) return <Empty />;
return <List items={data} />;
```

### Liste qui re-render trop

→ Tu passes une nouvelle fonction inline à chaque render. Mémoïse avec `useCallback` les handlers que tu passes en props.

---

## Ordre de migration recommandé

1. **Annonces** — formulaire simple, idéal pour s'échauffer
2. **Histoire** — lecture seule, encore plus simple
3. **Code pénal** — pareil, lecture
4. **Médical / Consultations** — relation N-1 avec Patients (premier vrai pattern de relation)
5. **Médical / Pharmacie** — stock, donc maths simples
6. **Médical / Dons** — pareil
7. **Médical / Psy** — pareil
8. **Missions / Disponibles**, **Actives**, **Récompenses** — module isolé
9. **Effectifs**, **Hiérarchie**, **Équipes** — annuaire
10. **Adoptions**, **Impôts** — modules isolés
11. **Diplomatie** (4 sous-pages) — module isolé
12. **Avocat** (4 sous-pages) — commence à se connecter avec Juge
13. **Juge** (6 sous-pages) — connecté avec Avocat
14. **Police** (4 sous-pages) — connecté avec Juge
15. **Admin** — dernier, agrège tout

Le **module Juge + Avocat + Police** est de loin le plus gros morceau, garde-le pour la fin quand tu maîtrises bien React.
