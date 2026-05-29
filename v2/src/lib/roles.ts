/**
 * ═══════════════════════════════════════════════════════════════════
 *  SUNAGAKURE — Mapping des rôles Discord vers rôles intranet
 * ═══════════════════════════════════════════════════════════════════
 *  Ce fichier contient :
 *  - L'ID du serveur Discord (Guild ID)
 *  - Tous les rôles Discord avec leurs IDs
 *  - Les fonctions de mapping Discord -> intranet
 *  - Les types TypeScript pour l'utilisateur intranet
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── GUILD ID ───────────────────────────────────────────────────────
export const GUILD_ID = "1380772738481782794";

// ─── RANGS NINJA (hiérarchie verticale, du + bas au + haut) ─────────
export const RANGS = {
  GENIN: "1380772738528186368",
  GENIN_CONFIRME: "1380772738528186369",
  TOKUBETSU_CHUNIN: "1481296308395446362",
  CHUNIN: "1380772738528186370",
  KAKUNIN: "1380772738528186372",
  TOKUBETSU_JONIN: "1380772738528186373",
  JONIN: "1380772738528186376",
  SAIRIN: "1497377819016167486",
  COMMANDANT_JONIN: "1380772738528186377",
  BRAS_DROIT_KAZEKAGE: "1498737912630743180",
  KAZEKAGE: "1380772738607874130",
} as const;

// Ordre hiérarchique (index = niveau, du + bas au + haut)
export const RANG_HIERARCHIE: { id: string; nom: string; niveau: number }[] = [
  { id: RANGS.GENIN, nom: "Genin", niveau: 1 },
  { id: RANGS.GENIN_CONFIRME, nom: "Genin confirmé", niveau: 2 },
  { id: RANGS.TOKUBETSU_CHUNIN, nom: "Tokubetsu Chunin", niveau: 3 },
  { id: RANGS.CHUNIN, nom: "Chunin", niveau: 4 },
  { id: RANGS.KAKUNIN, nom: "Kakunin", niveau: 5 },
  { id: RANGS.TOKUBETSU_JONIN, nom: "Tokubetsu Jonin", niveau: 6 },
  { id: RANGS.JONIN, nom: "Jonin", niveau: 7 },
  { id: RANGS.SAIRIN, nom: "Sairin", niveau: 8 },
  { id: RANGS.COMMANDANT_JONIN, nom: "Commandant Jonin", niveau: 9 },
  { id: RANGS.BRAS_DROIT_KAZEKAGE, nom: "Bras droit du Kazekage", niveau: 10 },
  { id: RANGS.KAZEKAGE, nom: "Kazekage", niveau: 11 },
];

// ─── BRANCHES / DÉPARTEMENTS ────────────────────────────────────────
export const BRANCHES = {
  POLICE: "1380772738481782801",
  MEDECIN: "1481308550394417257",
  SCIENTIFIQUE: "1481308321507180695",
  ACADEMIE: "1380772738481782799",
  STRATEGE: "1481305805566251170",
  DIPLOMATE: "1380772738481782800",
  BUREAU_MISSIONS: "1503880208694902824",
  RENSEIGNEMENT: "1481711054001148004",
  INTERROGATOIRE: "1488288952359194835",
  ARTS_GUERRE: "1482234378196095109",
  JOURNALISTE: "1498743284326207590",
  ORPHELIN: "1482588842107076618",
} as const;

export const BRANCHES_INFO: { id: string; nom: string; slug: string }[] = [
  { id: BRANCHES.POLICE, nom: "Police", slug: "police" },
  { id: BRANCHES.MEDECIN, nom: "Médecin", slug: "medecin" },
  { id: BRANCHES.SCIENTIFIQUE, nom: "Scientifique", slug: "scientifique" },
  { id: BRANCHES.ACADEMIE, nom: "Académie", slug: "academie" },
  { id: BRANCHES.STRATEGE, nom: "Stratège", slug: "stratege" },
  { id: BRANCHES.DIPLOMATE, nom: "Diplomate", slug: "diplomate" },
  { id: BRANCHES.BUREAU_MISSIONS, nom: "Bureau des missions", slug: "bureau-missions" },
  { id: BRANCHES.RENSEIGNEMENT, nom: "Renseignement", slug: "renseignement" },
  { id: BRANCHES.INTERROGATOIRE, nom: "Interrogatoire", slug: "interrogatoire" },
  { id: BRANCHES.ARTS_GUERRE, nom: "Arts de la guerre", slug: "arts-guerre" },
  { id: BRANCHES.JOURNALISTE, nom: "Journaliste", slug: "journaliste" },
  { id: BRANCHES.ORPHELIN, nom: "Orphelinat", slug: "orphelin" },
];

// ─── GÉRANTS (chefs de branche) ─────────────────────────────────────
export const GERANTS = {
  POLICE: "1481306495374065735",
  MEDICAL: "1481308199503007926",
  SCIENTIFIQUE: "1481308311981785180",
  ACADEMIE: "1481306921771466783",
  ORPHELINAT: "1482588630403907644",
  BUREAU_MISSIONS: "1486122375085817956",
  STRATEGIE: "1491202813408313515",
  DIPLOMATIE: "1491202645531033750",
} as const;

// Mapping Gérant -> slug de branche
export const GERANT_TO_BRANCHE: Record<string, string> = {
  [GERANTS.POLICE]: "police",
  [GERANTS.MEDICAL]: "medecin",
  [GERANTS.SCIENTIFIQUE]: "scientifique",
  [GERANTS.ACADEMIE]: "academie",
  [GERANTS.ORPHELINAT]: "orphelin",
  [GERANTS.BUREAU_MISSIONS]: "bureau-missions",
  [GERANTS.STRATEGIE]: "stratege",
  [GERANTS.DIPLOMATIE]: "diplomate",
};

// ─── CO-GÉRANTS (adjoints chefs de branche) ─────────────────────────
export const CO_GERANTS = {
  POLICE: "1481306688027099236",
  ACADEMIE: "1481307122972233739",
  STRATEGIE: "1481305550900822097",
  RENSEIGNEMENT: "1481710828918013952",
} as const;

export const CO_GERANT_TO_BRANCHE: Record<string, string> = {
  [CO_GERANTS.POLICE]: "police",
  [CO_GERANTS.ACADEMIE]: "academie",
  [CO_GERANTS.STRATEGIE]: "stratege",
  [CO_GERANTS.RENSEIGNEMENT]: "renseignement",
};

// ═══════════════════════════════════════════════════════════════════
//  KŌEKI — Grades, mapping, permissions
// ═══════════════════════════════════════════════════════════════════
// ✅ PHASE 6 (partielle) : 3 rôles Kōeki réellement créés et branchés :
//      GERANT, CO_GERANT, et MEMBRE_ECO (= le rôle "Koeki" générique,
//      membre simple qui voit tout le Kōeki sauf l'édition du Trésor).
//    Les 5 autres restent des PLACEHOLDERS : tant qu'ils valent ces
//    chaînes, aucun membre ne matchera (sûr). À remplacer plus tard
//    si tu crées les rôles superviseurs / chefs / membre-event.

export const KOEKI_ROLES = {
  GERANT: "1509952675339567194",
  CO_GERANT: "1509952850099441674",
  SUPERVISEUR_ECO: "KOEKI_SUPERVISEUR_ECO_PLACEHOLDER",
  SUPERVISEUR_EVENT: "KOEKI_SUPERVISEUR_EVENT_PLACEHOLDER",
  CHEF_ECO: "KOEKI_CHEF_ECO_PLACEHOLDER",
  CHEF_EVENT: "KOEKI_CHEF_EVENT_PLACEHOLDER",
  // Rôle "Koeki" générique (membre simple, accès aux deux pôles, pas le Trésor)
  MEMBRE_ECO: "1509952923357024286",
  MEMBRE_EVENT: "KOEKI_MEMBRE_EVENT_PLACEHOLDER",
} as const;

// Type de grade (aligné sur KoekiGrade dans types/koeki.ts)
export type KoekiGrade =
  | 'gerant' | 'co-gerant'
  | 'superviseur-eco' | 'superviseur-event'
  | 'chef-eco' | 'chef-event'
  | 'membre-eco' | 'membre-event';

// Pôle d'appartenance, dérivé du grade
export type KoekiPole = 'economie' | 'evenementiel' | 'both';

// Mapping ID Discord → grade Kōeki.
// Ordre = priorité (du + haut au + bas) : si un membre cumule plusieurs
// rôles Kōeki, on retient le plus élevé.
const KOEKI_ROLE_TO_GRADE: { id: string; grade: KoekiGrade }[] = [
  { id: KOEKI_ROLES.GERANT, grade: 'gerant' },
  { id: KOEKI_ROLES.CO_GERANT, grade: 'co-gerant' },
  { id: KOEKI_ROLES.SUPERVISEUR_ECO, grade: 'superviseur-eco' },
  { id: KOEKI_ROLES.SUPERVISEUR_EVENT, grade: 'superviseur-event' },
  { id: KOEKI_ROLES.CHEF_ECO, grade: 'chef-eco' },
  { id: KOEKI_ROLES.CHEF_EVENT, grade: 'chef-event' },
  { id: KOEKI_ROLES.MEMBRE_ECO, grade: 'membre-eco' },
  { id: KOEKI_ROLES.MEMBRE_EVENT, grade: 'membre-event' },
];

// Pôle de chaque grade
const KOEKI_GRADE_POLE: Record<KoekiGrade, KoekiPole> = {
  'gerant': 'both',
  'co-gerant': 'both',
  'superviseur-eco': 'economie',
  'superviseur-event': 'evenementiel',
  'chef-eco': 'economie',
  'chef-event': 'evenementiel',
  'membre-eco': 'economie',
  'membre-event': 'evenementiel',
};

export type KoekiInfo = {
  grade: KoekiGrade;
  pole: KoekiPole;
} | null;

/**
 * Récupère le grade Kōeki le plus élevé d'un user (null si aucun).
 */
export function getKoekiGrade(roleIds: string[]): KoekiInfo {
  for (const { id, grade } of KOEKI_ROLE_TO_GRADE) {
    if (roleIds.includes(id)) {
      return { grade, pole: KOEKI_GRADE_POLE[grade] };
    }
  }
  return null;
}

// ─── HELPERS DE PERMISSION KŌEKI (fonctions pures) ──────────────────
// Convention : (koeki: KoekiInfo, isAdmin = false). isAdmin court-circuite en true.
// Implémente la table du brief.

const KOEKI_DIRECTION: KoekiGrade[] = ['gerant', 'co-gerant'];

// Tous les grades "membre simple" (les deux pôles).
// 🆕 Les membres voient TOUT le Kōeki (éco + event) en lecture, mais
//    n'éditent rien de sensible (pas de gestion, pas de Trésor).
const KOEKI_MEMBRES: KoekiGrade[] = ['membre-eco', 'membre-event'];

function koekiHas(koeki: KoekiInfo, grades: KoekiGrade[]): boolean {
  return !!koeki && grades.includes(koeki.grade);
}

/** Accès au module Kōeki en général (n'importe quel grade ou admin). */
export function isKoeki(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || !!koeki;
}

// ── ÉCONOMIE : sociétés ──
// 🆕 Voir l'économie : direction + pôle éco + TOUS les membres (les deux pôles).
export function canVoirEconomie(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, [
    'gerant', 'co-gerant', 'superviseur-eco', 'chef-eco', ...KOEKI_MEMBRES,
  ]);
}
export function canGererSocietes(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, [
    'gerant', 'co-gerant', 'superviseur-eco', 'chef-eco',
  ]);
}
// 🆕 Déclarer un CA : direction + pôle éco + tous les membres.
export function canDeclarerCA(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, [
    'gerant', 'co-gerant', 'superviseur-eco', 'chef-eco', ...KOEKI_MEMBRES,
  ]);
}
export function canModifierTaux(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, ['gerant', 'co-gerant', 'superviseur-eco']);
}
// Édition du Trésor / renflouement BDM : DIRECTION UNIQUEMENT (Gérant + Co-Gérant).
// Les membres ne l'ont pas → Trésor en lecture seule pour eux.
export function canRenflouerBDM(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, KOEKI_DIRECTION);
}

// ── MARCHÉ ──
// 🆕 Voir le marché : direction + pôle event + TOUS les membres (les deux pôles).
export function canVoirMarche(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, [
    'gerant', 'co-gerant', 'superviseur-event', 'chef-event', ...KOEKI_MEMBRES,
  ]);
}
export function canGererMarche(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, [
    'gerant', 'co-gerant', 'superviseur-event', 'chef-event',
  ]);
}

// ── COMPTAS INTERNES ──
export function canVoirComptaGlobale(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, [
    'gerant', 'co-gerant', 'superviseur-eco', 'superviseur-event',
    'chef-eco', 'chef-event',
  ]);
}
export function canPointerCompta(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || koekiHas(koeki, [
    'gerant', 'co-gerant', 'superviseur-eco', 'superviseur-event',
  ]);
}
export function canVoirSaCompta(koeki: KoekiInfo, isAdmin = false): boolean {
  return isAdmin || !!koeki;
}

// ── PARAMÈTRES ──
export function canVoirParametres(koeki: KoekiInfo, isAdmin = false): boolean {
  return canModifierTaux(koeki, isAdmin);
}

// ─── RÔLES SPÉCIAUX / INSTITUTIONNELS ───────────────────────────────
export const SPECIAUX = {
  CONSEIL_DU_VENT: "1380772738528186375",
  CONSEILLER_KAZEKAGE: "1380772738607874129",
  STAFF: "1380772738607874131",
  GESTIONS: "1380772738607874132",
  NINJA_DE_SUNA: "1380772738481782803",
} as const;

// ─── CLANS (info perso, pas de permission) ──────────────────────────
export const CLANS = {
  SHOMU: "1380772738481782795",
  KUGUTSU: "1380772738481782796",
  SABAKU: "1380772738481782797",
} as const;

export const CLAN_TO_NOM: Record<string, string> = {
  [CLANS.SHOMU]: "Shomu",
  [CLANS.KUGUTSU]: "Kugutsu",
  [CLANS.SABAKU]: "Sabaku",
};

// ═══════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════

export type Rang = {
  id: string;
  nom: string;
  niveau: number;
};

export type Branche = {
  id: string;
  nom: string;
  slug: string;
};

export type IntranetUser = {
  /** Discord user ID */
  discordId: string;
  /** Pseudo Discord */
  username: string;
  /** Avatar Discord URL (peut être null) */
  avatarUrl: string | null;

  /** Rang ninja le plus élevé (null si aucun rang ninja) */
  rang: Rang | null;
  /** Toutes les branches de l'user */
  branches: Branche[];
  /** Slugs des branches dont l'user est Gérant */
  gerantDe: string[];
  /** Slugs des branches dont l'user est Co-gérant */
  coGerantDe: string[];
  /** Clan d'appartenance (null si aucun) */
  clan: string | null;

  // ─── KŌEKI ───
  /** Grade Kōeki le plus élevé + pôle (null si pas membre Kōeki) */
  koeki: KoekiInfo;

  /** Drapeaux d'accès */
  /** Rôle RP : a vraiment le rôle Discord Kazekage */
  isKazekage: boolean;
  /** Permission technique : peut tout gérer (whitelisté OU Kazekage RP) */
  isAdmin: boolean;
  isStaff: boolean;
  isConseilDuVent: boolean;
  isConseillerKazekage: boolean;
  isWhitelisted: boolean;
  isMembreServeur: boolean;

  /** IDs Discord bruts (pour debug / extensions) */
  rolesRaw: string[];
};

// ═══════════════════════════════════════════════════════════════════
//  FONCTIONS DE MAPPING
// ═══════════════════════════════════════════════════════════════════

/**
 * Récupère le rang ninja le plus élevé parmi les rôles Discord d'un user.
 * Retourne null si l'user n'a aucun rang ninja.
 */
export function getRangLePlusEleve(roleIds: string[]): Rang | null {
  let meilleur: Rang | null = null;
  for (const role of RANG_HIERARCHIE) {
    if (roleIds.includes(role.id)) {
      if (!meilleur || role.niveau > meilleur.niveau) {
        meilleur = role;
      }
    }
  }
  return meilleur;
}

/**
 * Récupère toutes les branches d'un user (un user peut être dans plusieurs).
 */
export function getBranches(roleIds: string[]): Branche[] {
  return BRANCHES_INFO.filter((b) => roleIds.includes(b.id));
}

/**
 * Récupère les slugs des branches dont l'user est Gérant.
 */
export function getGerantDe(roleIds: string[]): string[] {
  return roleIds
    .filter((id) => GERANT_TO_BRANCHE[id])
    .map((id) => GERANT_TO_BRANCHE[id]);
}

/**
 * Récupère les slugs des branches dont l'user est Co-gérant.
 */
export function getCoGerantDe(roleIds: string[]): string[] {
  return roleIds
    .filter((id) => CO_GERANT_TO_BRANCHE[id])
    .map((id) => CO_GERANT_TO_BRANCHE[id]);
}

/**
 * Récupère le clan d'appartenance (premier trouvé, généralement un seul).
 */
export function getClan(roleIds: string[]): string | null {
  for (const [id, nom] of Object.entries(CLAN_TO_NOM)) {
    if (roleIds.includes(id)) return nom;
  }
  return null;
}

/**
 * Construit un IntranetUser complet à partir des données Discord.
 */
export function buildIntranetUser(params: {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  roleIds: string[];
  isMembreServeur: boolean;
  isWhitelisted: boolean;
}): IntranetUser {
  const { discordId, username, avatarUrl, roleIds, isMembreServeur, isWhitelisted } = params;

  return {
    discordId,
    username,
    avatarUrl,
    rang: getRangLePlusEleve(roleIds),
    branches: getBranches(roleIds),
    gerantDe: getGerantDe(roleIds),
    coGerantDe: getCoGerantDe(roleIds),
    clan: getClan(roleIds),

    // ─── KŌEKI ───
    koeki: getKoekiGrade(roleIds),

    isKazekage: roleIds.includes(RANGS.KAZEKAGE),
    isAdmin: isWhitelisted || roleIds.includes(RANGS.KAZEKAGE),
    isStaff: roleIds.includes(SPECIAUX.STAFF),
    isConseilDuVent: roleIds.includes(SPECIAUX.CONSEIL_DU_VENT),
    isConseillerKazekage: roleIds.includes(SPECIAUX.CONSEILLER_KAZEKAGE),
    isWhitelisted,
    isMembreServeur,

    rolesRaw: roleIds,
  };
}

/**
 * Vérifie si un user a le droit d'accéder à l'intranet.
 * Règle : membre du serveur Discord OU whitelisté manuellement.
 */
export function hasAccess(user: { isMembreServeur: boolean; isWhitelisted: boolean }): boolean {
  return user.isMembreServeur || user.isWhitelisted;
}
