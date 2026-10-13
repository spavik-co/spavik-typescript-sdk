// Les formes d'entree acceptees menent toutes au meme tableau d'objets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { normaliser } from '../dist/esm/data.js';
import { SpavikDataError } from '../dist/esm/index.js';
import { CHURN } from './api-simulee.js';

test('tableau d objets', async () => {
  assert.deepEqual(await normaliser(CHURN), CHURN);
});

test('objet seul', async () => {
  assert.deepEqual(await normaliser({ a: 1 }), [{ a: 1 }]);
});

test('csv brut', async () => {
  assert.deepEqual(await normaliser('plan,seats\npro,12\nfree,1\n'),
    [{ plan: 'pro', seats: 12 }, { plan: 'free', seats: 1 }]);
});

test('csv : les nombres redeviennent des nombres', async () => {
  assert.deepEqual(await normaliser('a,b,c\n1,2.5,texte\n'), [{ a: 1, b: 2.5, c: 'texte' }]);
});

test('csv point-virgule', async () => {
  assert.deepEqual(await normaliser('a;b\n1;2\n'), [{ a: 1, b: 2 }]);
});

test('csv avec guillemets', async () => {
  assert.deepEqual(await normaliser('a,b\n"un, deux",3\n'), [{ a: 'un, deux', b: 3 }]);
});

test('fichier csv', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'spavik-'));
  const chemin = join(dossier, 'churn.csv');
  const entetes = Object.keys(CHURN[0]);
  const contenu = [entetes.join(','), ...CHURN.map((l) => entetes.map((c) => l[c]).join(','))];
  writeFileSync(chemin, `${contenu.join('\n')}\n`, 'utf8');
  assert.deepEqual(await normaliser(chemin), CHURN);
});

test('fichier json', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'spavik-'));
  const chemin = join(dossier, 'churn.json');
  writeFileSync(chemin, JSON.stringify(CHURN), 'utf8');
  assert.deepEqual(await normaliser(chemin), CHURN);
});

test('fichier absent dit le chemin', async () => {
  await assert.rejects(() => normaliser('/chemin/qui/nexiste/pas.csv'), (exc) => {
    assert.ok(exc instanceof SpavikDataError);
    assert.match(exc.message, /file not found/);
    assert.match(exc.message, /\/chemin\/qui\/nexiste\/pas\.csv/);
    return true;
  });
});

test('liste vide refusee', async () => {
  await assert.rejects(() => normaliser([]), SpavikDataError);
});

test('type non pris en charge', async () => {
  await assert.rejects(() => normaliser(42), (exc) => {
    assert.match(exc.message, /number/);
    return true;
  });
});
