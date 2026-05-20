/**
 * Configuration de la navigation de l'intranet.
 * Centralisée ici pour pouvoir ajouter/retirer/réordonner des pages
 * sans toucher au composant Sidebar.
 *
 * Chaque item = un lien dans la sidebar.
 * Sections = groupes (avec un titre type "POLICE", "JUSTICE", etc.)
 */
 
export interface NavItem {
  label: string;
  href: string;
  icon: string; // nom d'icône lucide-react
  badge?: number; // chiffre rouge optionnel
}
 
export interface NavSection {
  title: string;
  items: NavItem[];
}
 
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'GÉNÉRAL',
    items: [
      { label: 'Tableau de bord', href: '/dashboard', icon: 'LayoutDashboard' },
      { label: 'Annonces', href: '/annonces', icon: 'Megaphone' },
      { label: 'Histoire', href: '/histoire', icon: 'BookOpen' },
    ],
  },
  {
    title: 'POLICE',
    items: [
      { label: 'Recensement', href: '/recensement', icon: 'ScrollText' },
      { label: 'Adoptions', href: '/adoptions', icon: 'Baby' },
      { label: 'Recrutement', href: '/recrutement', icon: 'Award' },
      { label: 'Opérations', href: '/operations', icon: 'Siren' },
      { label: 'Sanctions', href: '/sanctions', icon: 'Scale' },
      { label: 'Casiers', href: '/casiers', icon: 'FileText' },
      { label: 'Dossiers', href: '/dossiers', icon: 'Folder' },
      { label: 'Bingo Book', href: '/bingobook', icon: 'BookMarked' },
      { label: 'Caisse', href: '/caisse', icon: 'Wallet' },
    ],
  },
  {
    title: 'JUSTICE',
    items: [
      { label: 'Plaintes', href: '/plaintes', icon: 'AlertCircle' },
      { label: 'Tribunal', href: '/tribunal', icon: 'Scale' },
      { label: 'Code pénal', href: '/codepenal', icon: 'BookText' },
      { label: 'Code de procédure', href: '/justice/procedure', icon: 'ScrollText' },
      { label: 'Archives', href: '/justice/archives', icon: 'Archive' },
      { label: 'Comptabilité', href: '/justice/comptabilite', icon: 'Wallet' },
    ],
  },
  {
    title: 'AVOCAT',
    items: [
      { label: 'Clients', href: '/avocat/clients', icon: 'Users' },
      { label: 'Affaires', href: '/avocat/affaires', icon: 'Briefcase' },
      { label: 'Plaidoiries', href: '/avocat/plaidoiries', icon: 'MessageSquare' },
      { label: 'Comptabilité', href: '/avocat/comptabilite', icon: 'Wallet' },
    ],
  },
  {
    title: 'MÉDICAL',
    items: [
      { label: 'Patients', href: '/medical/patients', icon: 'Heart' },
      { label: 'Consultations', href: '/medical/consultations', icon: 'Stethoscope' },
      { label: 'Pharmacie', href: '/medical/pharmacie', icon: 'Pill' },
      { label: 'Dons', href: '/medical/dons', icon: 'Droplet' },
      { label: 'Psychiatrie', href: '/medical/psy', icon: 'Brain' },
      { label: 'Salon scientifique', href: '/medical/scientifique', icon: 'FlaskConical' },
      { label: 'Morgue', href: '/medical/morgue', icon: 'Skull' },
      { label: 'Comptabilité', href: '/medical/comptabilite', icon: 'Wallet' },
    ],
  },
  {
    title: 'MISSIONS',
    items: [
      { label: 'Missions', href: '/missions', icon: 'Target' },
      { label: 'Récompenses', href: '/missions/recompenses', icon: 'Trophy' },
      { label: 'Comptabilité', href: '/missions/comptabilite', icon: 'Wallet' },
    ],
  },
  {
    title: 'DIPLOMATIE',
    items: [
      { label: 'Villages', href: '/diplo/villages', icon: 'Globe' },
      { label: 'Traités', href: '/diplo/traites', icon: 'FileSignature' },
      { label: 'Laissez-passer', href: '/diplo/laissez-passer', icon: 'BadgeCheck' },
      { label: 'Communications', href: '/diplo/communications', icon: 'Radio' },
      { label: 'Comptabilité', href: '/diplo/comptabilite', icon: 'Wallet' },
    ],
  },
  {
    title: 'ADMINISTRATION',
    items: [
      { label: 'Équipes', href: '/equipes', icon: 'Users2' },
      { label: 'Impôts', href: '/impots', icon: 'Receipt' },
      { label: 'Trésor Central', href: '/tresor', icon: 'Landmark' },
      { label: 'Membres', href: '/admin/membres', icon: 'Users' },
      { label: 'Whitelist', href: '/admin/whitelist', icon: 'ShieldCheck' },
      { label: 'Maintenance', href: '/admin/maintenance', icon: 'Wrench' },
    ],
  },
];
 
// Helper pour retrouver le label d'une page à partir de son URL
export function findNavItemByPath(pathname: string): NavItem | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === pathname || pathname.startsWith(item.href + '/')) {
        return item;
      }
    }
  }
  return null;
}
