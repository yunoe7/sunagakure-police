/**
 * Types du module Médical.
 * Adapte ces structures à ce que tu stockes réellement dans Firebase.
 */

export interface Patient {
  id: string;
  nom: string;
  prenom?: string;
  age?: number;
  village?: string;
  groupeSanguin?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  notes?: string;
  createdAt: number; // timestamp serveur
  updatedAt?: number;
}

export interface Consultation {
  id: string;
  patientId: string;
  date: number;
  motif: string;
  diagnostic?: string;
  traitement?: string;
  medecin?: string;
}

export interface Medicament {
  id: string;
  nom: string;
  stock: number;
  unite?: string;
  prixUnitaire?: number;
}
