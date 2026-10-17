// La meme API simulee que du cote Python : memes routes, memes reponses,
// memes refus. C'est ce qui permet de comparer les deux bibliotheques.

export const CLE = 'sk-spv-api-TEST-FIXTURE-not-a-real-key';

export const CHURN = [
  { plan: 'pro', seats: 12, tickets_90d: 3, churn: 0 },
  { plan: 'free', seats: 1, tickets_90d: 9, churn: 1 },
  { plan: 'pro', seats: 40, tickets_90d: 1, churn: 0 },
  { plan: 'free', seats: 2, tickets_90d: 7, churn: 1 },
  { plan: 'team', seats: 8, tickets_90d: 2, churn: 0 },
  { plan: 'free', seats: 1, tickets_90d: 12, churn: 1 },
  { plan: 'pro', seats: 25, tickets_90d: 0, churn: 0 },
  { plan: 'team', seats: 6, tickets_90d: 5, churn: 1 },
  { plan: 'pro', seats: 18, tickets_90d: 1, churn: 0 },
  { plan: 'free', seats: 3, tickets_90d: 8, churn: 1 },
  { plan: 'team', seats: 11, tickets_90d: 2, churn: 0 },
  { plan: 'pro', seats: 30, tickets_90d: 4, churn: 0 },
];

function json(statut, corps, entetes = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'content-type': 'application/json', 'Retry-After': '0', 'x-spavik-request-id': `req_simule${statut}`, ...entetes },
  });
}

export function erreur(statut, code, extra = {}) {
  return json(statut, { status: 'error', message: code, messageDetail: 'detail', ...extra });
}

export class ApiSimulee {
  constructor() {
    this.appels = [];
    this.solde = 100;
    this.idempotence = new Map();
    this.scenario = new Map();
    this.modeles = new Map();
    this.pendingOutcomes = 0;
    this._compteur = 0;
    this._scores = 0;
    this.fetch = this.fetch.bind(this);
  }

  repondra(chemin, ...reponses) {
    const empile = this.scenario.get(chemin) || [];
    this.scenario.set(chemin, [...empile, ...reponses]);
  }

  compte(chemin) {
    return this.appels.filter((a) => a.chemin === chemin).length;
  }

  async fetch(url, options = {}) {
    const u = new URL(url);
    const chemin = u.pathname;
    const corps = options.body ? JSON.parse(options.body) : {};
    this.appels.push({
      chemin, methode: options.method, entetes: options.headers || {}, corps, params: u.searchParams,
    });

    const presentee = options.headers?.['X-Spavik-Api-Key'];
    if (presentee !== CLE) {
      return erreur(401, 'API_KEY_INVALID');
    }

    const empile = this.scenario.get(chemin);
    if (empile?.length) {
      const reponse = empile.shift();
      if (reponse instanceof Error) throw reponse;
      return reponse;
    }

    const cleIdem = options.headers?.['Idempotency-Key'];
    if (cleIdem && this.idempotence.has(cleIdem)) {
      return json(200, this.idempotence.get(cleIdem));
    }

    const reponse = await this._router(chemin, options.method, corps, u.searchParams);
    if (cleIdem && reponse.status < 400) {
      this.idempotence.set(cleIdem, JSON.parse(await reponse.clone().text()));
    }
    return reponse;
  }

  async _router(chemin, methode, corps, params) {
    if (chemin === '/v1/engine-families') return json(200, [{ id: 'presage', label: 'Presage', is_default: true }]);
    if (chemin === '/v1/engines') {
      return json(200, [{
        id: 'presage-2', label: 'Presage 2', status: 'default', credits: 1, min_plan: null, retires_at: null,
      }]);
    }

    if (chemin === '/v1/usage') {
      // La forme observee sur la passerelle de test le 11 septembre 2026.
      const utilise = 100 - this.solde;
      return json(200, {
        plan: 'free', credit_balance: this.solde, credits_low: this.solde < 10,
        included_units_per_month: null,
        period: { key: '2026-09', reset_at: '2026-10-01T00:00:00.000Z', units_used: utilise },
        totals: { units: utilise },
        by_kind: [{ key: 'predict', label: null, units: utilise }],
      });
    }

    if (chemin === '/v1/datasets/evaluate') {
      const lignes = corps.data || [];
      const cible = corps.target;
      const colonnes = lignes.length ? Object.keys(lignes[0]) : [];
      if (!colonnes.includes(cible)) {
        return json(200, {
          target: cible, task: null, n_rows: lignes.length, columns: colonnes,
          validation: { status: 'failed', issues: [{ code: 'TARGET_COLUMN_MISSING' }] },
          hint: `The target column '${cible}' is missing. Columns: ${JSON.stringify(colonnes)}`,
          trial: null,
        });
      }
      return json(200, {
        target: cible, task: 'classification', n_rows: lignes.length, columns: colonnes,
        validation: { status: 'ok', issues: [] }, hint: null,
        trial: {
          metrics: { accuracy: 0.83 }, baselines: { majority_accuracy: 0.5 },
          verdict: { level: 'usable', message: 'The engine beats the majority class on this data.' },
        },
      });
    }

    if (chemin === '/v1/forecast/backtest') {
      const lignes = corps.data || [];
      return json(200, {
        target: corps.target, timestamp: corps.timestamp || 'date', item_id: corps.item_id ?? null,
        n_rows: lignes.length, columns: lignes.length ? Object.keys(lignes[0]) : [],
        validation: { status: 'ok', issues: [] }, hint: null,
        backtest: {
          metrics: { MASE: 0.62 }, baselines: { naive_mase: 1.0 }, by_window: [0.55, 0.7, 0.61],
          seasonal_period: 7, warnings: null, n_context: lignes.length,
          verdict: { level: 'usable', message: 'The engine beats the naive forecast on this series.' },
        },
      });
    }

    if (chemin === '/v1/models' && methode === 'POST') {
      if ('engine' in corps) throw new Error('Legacy engine field sent');
      const family = corps.engine_family ?? 'presage';
      if (!['presage', 'flair', 'prophecy'].includes(family)) return erreur(422, 'VALIDATION_ERROR');
      this._compteur += 1;
      const id = `mdl_test${String(this._compteur).padStart(4, '0')}`;
      this.modeles.set(id, {
        id, name: corps.name || 'modele', latest_version: 1, task: 'classification', engine_family: family, engine: `${family}-2`,
      });
      return json(201, {
        model: this.modeles.get(id),
        version: { version: 1, id: 'ver_1' },
        validation: { row_count: (corps.data || []).length },
        credits_remaining: this.solde,
      });
    }

    if (chemin === '/v1/models' && methode === 'GET') {
      const limite = Number(params.get('limit') || 50);
      const decalage = Number(params.get('offset') || 0);
      const voulu = params.get('status');
      const tous = [...this.modeles.values()]
        .filter((m) => (m.status === 'archived') === (voulu === 'archived'));
      return json(200, {
        data: tous.slice(decalage, decalage + limite),
        pagination: { total: tous.length, limit: limite, offset: decalage },
      });
    }

    if (chemin.endsWith('/predict')) {
      const lignes = corps.rows || [];
      if (lignes.length > this.solde) {
        return erreur(402, 'CREDITS_EXHAUSTED', { balance: this.solde, required: lignes.length });
      }
      this.solde -= lignes.length;
      const base = this._scores;
      this._scores += lignes.length;
      // Un request_id par ligne, comme l'API ; le solde dans le corps ET en en-tete.
      return json(200, {
        model_id: chemin.split('/')[3],
        version: 1,
        n_scored: lignes.length,
        predictions: lignes.map((_, i) => ({
          request_id: `req_p${String(base + i).padStart(4, '0')}`, prediction: 1, proba_0: 0.2, proba_1: 0.8,
        })),
        credits_remaining: this.solde,
      }, { 'X-Spavik-Predictions-Remaining': String(this.solde) });
    }

    if (chemin.endsWith('/predictions')) {
      const n = Math.min(Number(params.get('limit') || 50), this._scores);
      return json(200, Array.from({ length: n }, (_, i) => ({
        request_id: `req_p${String(i).padStart(4, '0')}`, prediction: 1, scored_at: '2026-09-14T10:00:00Z',
      })));
    }

    if (chemin.endsWith('/outcomes')) {
      const recues = (corps.outcomes || []).length;
      this.pendingOutcomes += recues;
      return json(201, {
        accepted: recues,
        pending_outcomes: this.pendingOutcomes,
        unresolved: [],
        refresh_suggested: recues > 2,
      });
    }

    if (chemin.endsWith('/refresh')) {
      if (!this.pendingOutcomes) return erreur(409, 'NO_PENDING_OUTCOMES');
      const applique = this.pendingOutcomes;
      this.pendingOutcomes = 0;
      const id = chemin.split('/')[3];
      const modele = this.modeles.get(id) || { id };
      modele.latest_version = 2;
      this.modeles.set(id, modele);
      return json(201, {
        model: modele,
        version: { version: 2, id: 'ver_2' },
        outcomes_applied: applique,
        incomplete_outcomes: 0,
        context_size: 42,
      });
    }

    if (chemin.endsWith('/performance')) {
      return json(200, {
        model_id: chemin.split('/')[3],
        version: 2,
        task: 'classification',
        pending_outcomes: 0,
        refresh_suggested: false,
        training_metrics: { accuracy: 0.9 },
        observed: { accuracy: 1.0, n: 3 },
      });
    }

    if (chemin === '/v1/forecast') {
      const horizon = corps.horizon || 1;
      if (horizon > this.solde) return erreur(402, 'CREDITS_EXHAUSTED', { balance: this.solde });
      this.solde -= horizon;
      const cible = corps.target || 'valeur';
      const lignes = [`date,${cible}_prediction`];
      for (let i = 0; i < horizon; i += 1) {
        lignes.push(`2026-08-${String(i + 1).padStart(2, '0')},${100 + i}`);
      }
      return json(200, {
        target: cible,
        prediction_length: horizon,
        n_context: (corps.data || []).length,
        n_series: 1,
        point_estimate: 'mean',
        forecast_csv: `${lignes.join('\n')}\n`,
        // Le corps ne porte pas le solde, comme l'API reelle : seul l'en-tete le donne.
      }, { 'X-Spavik-Predictions-Remaining': String(this.solde) });
    }

    if (chemin.endsWith('/archive') || chemin.endsWith('/restore') || methode === 'DELETE') {
      const id = chemin.split('/')[3];
      if (!this.modeles.has(id)) return erreur(404, 'MODEL_NOT_FOUND');
      if (methode === 'DELETE') {
        // Suppression definitive : artefacts purges. Hors perimetre client.
        this.modeles.delete(id);
        return new Response(null, { status: 204, headers: { 'x-spavik-request-id': 'req_simule204' } });
      }
      const modele = this.modeles.get(id);
      modele.status = chemin.endsWith('/archive') ? 'archived' : 'ready';
      return json(200, { model: modele });
    }

    if (chemin.startsWith('/v1/models/')) {
      const id = chemin.split('/')[3];
      if (this.modeles.get(id)?.status === 'archived') {
        // Comme la vraie API : lire ou servir un modele archive est refuse.
        return erreur(409, 'MODEL_ARCHIVED', {
          messageDetail: 'This model is archived and serves nothing. Restore it to use it again.',
        });
      }
      if (this.modeles.has(id)) return json(200, { model: this.modeles.get(id) });
      return erreur(404, 'MODEL_NOT_FOUND');
    }

    // Route inconnue : la vraie API rend la page d'erreur du serveur, en HTML.
    return new Response(
      `<!DOCTYPE html>\n<html><body><pre>Cannot POST ${chemin}</pre></body></html>`,
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-spavik-request-id': 'req_html' } },
    );
  }
}
