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
}
export interface ModelData extends ApiRecord {
  id: string;
  name?: string | null;
  latest_version?: number | null;
  version?: number | null;
  task?: string | null;
  engine?: string | null;
  feature_columns?: string[];
}
