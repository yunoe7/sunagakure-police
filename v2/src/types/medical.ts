/**
 * Types du module Médical / Hôpital de Sunagakure.
 *
 * Stockage Firebase :
 *   sunagakure/medical/patients         (Patients - module existant)
 *   sunagakure/hospital_consultations   (Consultations médicales)
 *   sunagakure/hospital_pharmacie       (Stock de médicaments)
 *   sunagakure/hospital_psy             (Consultations psy)
 *   sunagakure/hospital_dons            (Dons du sang)
 */

// ═══════════════════════════════════════════════════════════════════════
//  PATIENT (existant - ne pas casser)
// ═══════════════════════════════════════════════════════════════════════

export interface Patient {
  id: string;
  nom: string;
  prenom?: string;
  age?: number;
  village?: string;
  groupeSanguin?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  CONSULTATIONS MÉDICALES
// ═══════════════════════════════════════════════════════════════════════

export type ConsultStatut = 'prevue' | 'encours' | 'terminee' | 'annulee';

export const CONSULT_STATUT_LABEL: Record<ConsultStatut, string> = {
  prevue: '📅 Prévue',
  encours: '⏳ En cours',
  terminee: '✅ Terminée',
  annulee: '❌ Annulée',
};

export interface Consultation {
  id: number;
  patient: string;
  medecin?: string;
  motif: string;
  date?: string;
  heure?: string;
  statut: ConsultStatut;
  diagnostic?: string;
  prescription?: string;
  notes?: string;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  PHARMACIE
// ═══════════════════════════════════════════════════════════════════════

export type MedCategorie =
  | 'antalgique'
  | 'antibiotique'
  | 'antiseptique'
  | 'plante'
  | 'chakra'
  | 'soin'
  | 'autre';

export const MED_CATEGORIES: MedCategorie[] = [
  'antalgique',
  'antibiotique',
  'antiseptique',
  'plante',
  'chakra',
  'soin',
  'autre',
];

export const MED_CATEGORIE_LABEL: Record<MedCategorie, string> = {
  antalgique: 'Antalgique',
  antibiotique: 'Antibiotique',
  antiseptique: 'Antiseptique',
  plante: 'Plante médicinale',
  chakra: 'Soin chakra',
  soin: 'Soin général',
  autre: 'Autre',
};

export interface Medicament {
  id: number;
  nom: string;
  categorie: MedCategorie;
  stock: number;
  unite?: string;
  prix?: number;
  fournisseur?: string;
  notes?: string;
  alerteSeuil?: number;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  PSY
// ═══════════════════════════════════════════════════════════════════════

export type PsySeverite = 'leger' | 'modere' | 'severe' | 'critique';

export const PSY_SEVERITE_LABEL: Record<PsySeverite, string> = {
  leger: 'Léger',
  modere: 'Modéré',
  severe: 'Sévère',
  critique: 'Critique',
};

export interface ConsultPsy {
  id: number;
  patient: string;
  psychologue?: string;
  motif: string;
  date?: string;
  severite: PsySeverite;
  diagnostic?: string;
  therapie?: string;
  notes?: string;
  prochainRdv?: string;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  DONS DU SANG
// ═══════════════════════════════════════════════════════════════════════

export type GroupeSanguin = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+';

export const GROUPES_SANGUINS: GroupeSanguin[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

export interface DonSang {
  id: number;
  donneur: string;
  groupe: GroupeSanguin;
  quantite: number;
  date?: string;
  preleveur?: string;
  destination?: string;
  notes?: string;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

export function fmtDateFR(d: string | number | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

export function fmtMoney(n: number | undefined): string {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('fr-FR');
}
