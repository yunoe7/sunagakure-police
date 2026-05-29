/**
 * ═══════════════════════════════════════════════════════════════════
 *  Types du module KŌEKI (公益)
 * ═══════════════════════════════════════════════════════════════════
 *  Deux sous-pôles :
 *   - Économie  : sociétés privées imposables + fiscalité + comptas internes
 *   - Marché    : marketplace RP (demandes vente/achat, rdv ninjas)
 *
 *  Le Trésor Central reste la source de vérité pour l'argent : une
 *  déclaration de CA crée un TresorMouvement (section 'koeki'), même
 *  pattern que la page Impôts (Vision C). Voir koeki/economie/page.tsx.
 *
 *  Stockage Firebase (proposé) :
 *    sunagakure/koeki/societes        → Societe[]
 *    sunagakure/koeki/declarations    → DeclarationCA[]
 *    sunagakure/koeki/parametres      → KoekiParametres
 *    sunagakure/koeki/comptas         → Record<discordId, ComptaKoeki>
 *    sunagakure/koeki/marche          → DemandeMarche[]
 * ═══════════════════════════════════════════════════════════════════
 */

import { fmtMoney, fmtDateFR, fmtDateTimeFR } from '@/types/compta';

// Ré-export pour confort (les pages koeki importent tout depuis ici)
export { fmtMoney, fmtDateFR, fmtDateTimeFR };

// ═══════════════════════════════════════════════════════════════════
//  SOCIÉTÉS
// ═══════════════════════════════════════════════════════════════════

/**
 * Type de société. Extensible : pour ajouter un 4e type, il suffit
 * d'ajouter une valeur ici PUIS une entrée dans SOCIETE_TYPE_LABEL,
 * SOCIETE_TYPE_ICON et DEFAULT_TAUX_PAR_TYPE (TypeScript forcera la
 * complétude des Record, donc rien ne sera oublié).
 */
export type SocieteType = 'restaurant' | 'service' | 'biens';

export const SOCIETE_TYPES: SocieteType[] = ['restaurant', 'service', 'biens'];

export const SOCIETE_TYPE_LABEL: Record<SocieteType, string> = {
  restaurant: 'Restaurant',
  service: 'Service',
  biens: 'Vente de biens',
};

export const SOCIETE_TYPE_ICON: Record<SocieteType, string> = {
  restaurant: '🍜',
  service: '🛠️',
  biens: '📦',
};

export interface Societe {
  id: string;                     // ex: "SOC-1707000000000"
  nom: string;                    // ex: "Ramen Ichiraku"
  type: SocieteType;
  proprietaireId: string;         // ref ninja (discordId ou id recensé)
  proprietaireNom?: string;       // dénormalisé pour affichage
  tauxImposition: number | null;  // % override ; null = utilise le taux global du type
  dateCreation: number;           // timestamp
  actif: boolean;                 // archivage soft
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  PARAMÈTRES KŌEKI (taux globaux par type)
// ═══════════════════════════════════════════════════════════════════

/**
 * Un taux global par type de société, surchargeable au niveau société.
 * Indexé sur SocieteType → ajouter un 4e type étend automatiquement
 * la forme attendue ici.
 */
export type TauxParType = Record<SocieteType, number>;

export interface KoekiParametres {
  tauxParType: TauxParType;
  // Barème de paie hebdo par grade Kōeki (voir PAIE plus bas)
  paieParGrade?: Partial<Record<KoekiGrade, number>>;
  // Montant versé à un organisateur d'event (remplace la paie de grade)
  paieOrganisateurEvent?: number;
}

// Taux d'imposition par défaut si rien en base (en %)
export const DEFAULT_TAUX_PAR_TYPE: TauxParType = {
  restaurant: 10,
  service: 12,
  biens: 15,
};

/**
 * Résout le taux d'imposition effectif d'une société :
 * override société si défini (non null), sinon taux global du type.
 */
export function tauxEffectif(societe: Societe, params: KoekiParametres): number {
  if (typeof societe.tauxImposition === 'number') return societe.tauxImposition;
  return params.tauxParType[societe.type] ?? 0;
}

/**
 * Calcule l'impôt dû pour un CA donné et un taux donné.
 * Arrondi à l'entier (ryōs entiers).
 */
export function calculImpot(chiffreAffaires: number, taux: number): number {
  if (!chiffreAffaires || chiffreAffaires <= 0) return 0;
  return Math.round((chiffreAffaires * taux) / 100);
}

// ═══════════════════════════════════════════════════════════════════
//  DÉCLARATION DE CA (lien Kōeki → Trésor, pattern Vision C)
// ═══════════════════════════════════════════════════════════════════

/**
 * Une déclaration de chiffre d'affaires d'une société.
 *
 * ⭐ Comme PaiementImpot : quand elle est enregistrée, un TresorMouvement
 *    est créé en parallèle dans tresorCentral/mouvements et son ID stocké
 *    ici (tresorMouvementId) pour permettre la suppression couplée.
 *
 * Convention TresorMouvement société (cf. koeki/economie/page.tsx) :
 *    id           : 'TM-SOC-<declarationId>'
 *    section      : 'koeki'
 *    sectionLabel : 'Fiscalité sociétés'
 *    amount       : impot (le montant qui entre au Trésor)
 *    rate         : taux appliqué (%)
 *    archiveId    : 'SOC-<societeId>'
 *    archiveLabel : '<nom société> — CA semaine <W>'
 *    soldeOrigine : chiffreAffaires déclaré
 */
export interface DeclarationCA {
  id: number;                    // timestamp
  societeId: string;
  societeNom: string;
  type: SocieteType;
  chiffreAffaires: number;       // CA déclaré
  taux: number;                  // taux appliqué au moment de la déclaration
  impot: number;                 // montant versé au Trésor
  date: number;                  // timestamp
  semaine?: string;              // ex: "2026-W12"
  agent?: string;                // qui a enregistré
  notes?: string;
  tresorMouvementId?: string;    // ⭐ liaison Trésor
}

// ═══════════════════════════════════════════════════════════════════
//  COMPTAS INTERNES KŌEKI (fiche par membre)
// ═══════════════════════════════════════════════════════════════════

/**
 * Grades Kōeki (alignés sur le mapping permissions dans lib/roles.ts).
 * Sert à la fois aux permissions ET au barème de paie hebdo.
 */
export type KoekiGrade =
  | 'gerant'
  | 'co-gerant'
  | 'superviseur-eco'
  | 'superviseur-event'
  | 'chef-eco'
  | 'chef-event'
  | 'membre-eco'
  | 'membre-event';

export const KOEKI_GRADE_LABEL: Record<KoekiGrade, string> = {
  'gerant': 'Gérant Kōeki',
  'co-gerant': 'Co-Gérant Kōeki',
  'superviseur-eco': 'Superviseur économie',
  'superviseur-event': 'Superviseur évènementiel',
  'chef-eco': 'Chef d\'équipe économie',
  'chef-event': 'Chef d\'équipe évènementiel',
  'membre-eco': 'Membre économie',
  'membre-event': 'Membre évènementiel',
};

/**
 * Barème de paie hebdomadaire par grade (en ryōs).
 * D'après le brief :
 *   - Membre : 10 000
 *   - Responsable de commerce / Chef d'équipe : 20 000
 *   - Organisateur d'événement : 25 000 OU organisation d'1 event (remplace, pas cumul)
 *
 * Interprétation appliquée (à ajuster si besoin) :
 *   - membre-eco / membre-event       → 10 000
 *   - chef-eco / chef-event           → 20 000
 *   - superviseur-* / gérant / co-g   → 20 000 (responsables) — à confirmer
 * Le bonus "organisateur d'event" est géré séparément (voir paieDeLaSemaine).
 */
export const DEFAULT_PAIE_PAR_GRADE: Record<KoekiGrade, number> = {
  'gerant': 20000,
  'co-gerant': 20000,
  'superviseur-eco': 20000,
  'superviseur-event': 20000,
  'chef-eco': 20000,
  'chef-event': 20000,
  'membre-eco': 10000,
  'membre-event': 10000,
};

/** Rémunération si un event a été organisé dans la semaine (remplace la paie de base). */
export const PAIE_ORGANISATEUR_EVENT = 25000;

export type MouvementComptaType = 'paie' | 'prime' | 'sanction' | 'remboursement' | 'ajustement';

export const MOUVEMENT_COMPTA_LABEL: Record<MouvementComptaType, string> = {
  paie: 'Paie hebdo',
  prime: 'Prime',
  sanction: 'Sanction',
  remboursement: 'Remboursement',
  ajustement: 'Ajustement',
};

export interface MouvementCompta {
  id: string;                    // ex: "MC-1707000000000"
  type: MouvementComptaType;
  montant: number;               // signé : + crédit, − débit
  motif?: string;
  date: number;
  agent?: string;                // qui a pointé (pour les manuels)
  semaine?: string;              // pour les paies auto
}

export interface ComptaKoeki {
  discordId: string;
  username?: string;
  grade: KoekiGrade | null;
  mouvements: MouvementCompta[];
  solde: number;                 // recalculable depuis mouvements, dénormalisé pour affichage
  dernierVersement?: string;     // semaine ISO du dernier versement de paie (anti-doublon)
  notes?: string;                // note/mémo libre sur le membre
}

/**
 * Recalcule le solde d'une fiche compta depuis ses mouvements.
 */
export function recomputeSolde(mouvements: MouvementCompta[]): number {
  return mouvements.reduce((s, m) => s + (m.montant || 0), 0);
}

/**
 * Détermine la paie de base d'un grade pour une semaine donnée.
 * Règle "event organisateur remplace" : si organisaEvent, on verse
 * PAIE_ORGANISATEUR_EVENT au lieu de la paie de grade (pas de cumul).
 *
 * Décision actée : PAS de rattrapage. Cette fonction calcule la paie
 * d'UNE semaine ; l'appelant ne la verse que pour la semaine courante
 * au login (cf. dernierVersement pour éviter le doublon).
 */
export function paieDeLaSemaine(params: {
  grade: KoekiGrade | null;
  organisaEvent: boolean;
  bareme?: Partial<Record<KoekiGrade, number>>;
  montantEvent?: number;
}): number {
  const { grade, organisaEvent, bareme, montantEvent } = params;
  if (organisaEvent) return typeof montantEvent === 'number' ? montantEvent : PAIE_ORGANISATEUR_EVENT;
  if (!grade) return 0;
  const table = { ...DEFAULT_PAIE_PAR_GRADE, ...(bareme ?? {}) };
  return table[grade] ?? 0;
}

// ═══════════════════════════════════════════════════════════════════
//  MARCHÉ (marketplace RP)
// ═══════════════════════════════════════════════════════════════════

export type DemandeSens = 'vente' | 'achat';

export const DEMANDE_SENS_LABEL: Record<DemandeSens, string> = {
  vente: 'Vend',
  achat: 'Recherche',
};

export type DemandeStatut = 'ouverte' | 'acceptee' | 'rdv' | 'cloturee' | 'annulee';

export const DEMANDE_STATUT_LABEL: Record<DemandeStatut, string> = {
  ouverte: 'Ouverte',
  acceptee: 'Acceptée',
  rdv: 'RDV fixé',
  cloturee: 'Clôturée',
  annulee: 'Annulée',
};

export interface DemandeMarche {
  id: string;                    // ex: "DM-1707000000000"
  sens: DemandeSens;             // vente ou achat
  objet: string;                 // ce qui est vendu/recherché
  description?: string;
  prix?: number;                 // prix demandé/proposé (null si négociable)
  auteurId: string;              // qui poste la demande
  auteurNom?: string;
  statut: DemandeStatut;
  ninjaAcceptanteId?: string;    // le Kōeki qui prend la demande en charge
  ninjaAcceptanteNom?: string;
  dateCreation: number;
  dateCloture?: number;
  rdvDate?: number;              // date+heure du RDV (timestamp ms)
  rdvLieu?: string;              // lieu RP du RDV
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS COMMUNS
// ═══════════════════════════════════════════════════════════════════

/** Génère un ID préfixé basé sur le timestamp (convention du projet). */
export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
