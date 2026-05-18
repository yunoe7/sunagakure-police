#!/usr/bin/env node
/**
 * Script de scaffolding pour générer une nouvelle page CRUD.
 *
 * Usage :
 *   node scripts/new-page.mjs <module>/<page> <FirebasePath>
 *
 * Exemples :
 *   node scripts/new-page.mjs annonces annonces
 *   node scripts/new-page.mjs medical/consultations medical/consultations
 *   node scripts/new-page.mjs juge/plaintes juge/plaintes
 *
 * Crée :
 *   src/app/(intranet)/<route>/page.tsx       ← copié depuis le template Patients
 *   src/app/(intranet)/<route>/page.module.css
 */

import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE_DIR = join(ROOT, 'src/app/(intranet)/medical/patients');

const [route, fbPath] = process.argv.slice(2);

if (!route || !fbPath) {
  console.error('Usage: node scripts/new-page.mjs <route> <FirebasePath>');
  console.error('Example: node scripts/new-page.mjs medical/consultations medical/consultations');
  process.exit(1);
}

const targetDir = join(ROOT, `src/app/(intranet)/${route}`);

if (existsSync(targetDir)) {
  console.error(`❌ La route /${route} existe déjà : ${targetDir}`);
  process.exit(1);
}

console.log(`📁 Création de ${targetDir}…`);
await mkdir(targetDir, { recursive: true });

// Copier le CSS tel quel (pratiquement universel)
console.log(`🎨 Copie du CSS…`);
await copyFile(join(TEMPLATE_DIR, 'page.module.css'), join(targetDir, 'page.module.css'));

// Copier + adapter le TSX
console.log(`📝 Génération de page.tsx…`);
let tsx = await readFile(join(TEMPLATE_DIR, 'page.tsx'), 'utf-8');

// Remplacer le chemin Firebase
tsx = tsx.replace(/const FB_PATH = '[^']+'/, `const FB_PATH = '${fbPath}'`);

// Ajouter un commentaire en haut pour signaler que c'est généré
const pageName = route.split('/').pop();
const header = `/**
 * Page ${pageName} — générée depuis le template Patients.
 * À adapter : type, champs du formulaire, colonnes du tableau.
 * Chemin Firebase : ${fbPath}
 */
`;
tsx = header + tsx;

await writeFile(join(targetDir, 'page.tsx'), tsx);

console.log(`✅ Page créée : /${route}`);
console.log(``);
console.log(`Prochaines étapes :`);
console.log(`  1. Créer le type dans src/types/${pageName}.ts`);
console.log(`  2. Adapter l'import "Patient" et les champs dans page.tsx`);
console.log(`  3. Adapter les colonnes du <table>`);
console.log(`  4. Adapter les champs du formulaire dans <Modal>`);
console.log(`  5. Ajouter l'entrée dans src/lib/navigation.ts`);
