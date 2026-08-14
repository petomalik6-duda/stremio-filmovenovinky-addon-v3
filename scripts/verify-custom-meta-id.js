import assert from 'node:assert/strict';
import { cleanPublicMeta } from '../src/public-meta.js';
import { buildMetaIndex } from '../src/ids.js';

const cases = [
  ['tt20911974', "My Mother's Wedding", 'filmovenovinky:test-mothers'],
  ['tt27722524', 'Sčítání', 'filmovenovinky:test-addition']
];

for (const [imdbId, expectedName, localId] of cases) {
  const raw = {
    id: imdbId,
    type: 'movie',
    name: expectedName,
    poster: 'https://image.tmdb.org/t/p/w500/test.jpg',
    background: 'https://image.tmdb.org/t/p/w1280/test.jpg',
    description: 'A sufficiently rich test description.',
    releaseInfo: '2024',
    genres: ['Drama'],
    behaviorHints: { defaultVideoId: imdbId },
    _addon: { imdbId, localId, lang: 'CZ', key: `movie|${imdbId}` }
  };

  const meta = cleanPublicMeta(raw);
  assert.equal(meta.id, imdbId, `${expectedName}: public metadata must use IMDb id`);
  assert.equal(meta.behaviorHints?.defaultVideoId, imdbId);
  assert.equal(meta.videos, undefined, `${expectedName}: movie must not expose videos array`);
  assert.equal(meta.name, expectedName);
  assert.ok(meta.poster && meta.description && meta.background);
  assert.equal(Object.prototype.hasOwnProperty.call(meta, '_addon'), false);

  const index = buildMetaIndex([raw], []);
  assert.equal(index.get(imdbId), raw);
  assert.equal(index.get(localId), raw, `${expectedName}: old local id must remain a working alias`);
}

console.log(JSON.stringify({
  ok: true,
  strategy: 'IMDb public id + FilmovéNovinky local-id alias',
  tested: cases.map(([id, name]) => ({ id, name }))
}, null, 2));
