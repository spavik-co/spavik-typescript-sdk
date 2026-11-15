import type { ModelInfo } from './types.js';
// Types internes des requetes ; le JSON reste inconnu a la frontiere HTTP.
export type ApiRecord = Record<string, unknown>;
export interface Requete {
  methode: string;
  chemin: string;
  operation: string;
  corps?: ApiRecord | null;
  parametres?: Record<string, unknown>;
  delai?: number;
  idempotence?: string;
  contexte?: string;
  /** Route lisible sans cle (catalogue des moteurs). */
  publique?: boolean;
}
/** Ce que les en-tetes de la reponse disent, hors du corps rendu a l'appelant. */
export interface Meta {
  requestId: string | null;
  engineVersion: string | null;
  predictionsRemaining: number | null;
}
export interface Reponse<T> {
  corps: T;
  meta: Meta;
}
export interface ModelData extends ModelInfo {
  version?: number | null;
}
