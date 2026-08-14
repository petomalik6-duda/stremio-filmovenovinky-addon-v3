import assert from 'node:assert/strict';
import { cleanPublicMeta } from '../src/public-meta.js';

function richMovie({ name, imdbId, localId, year = '2025' }) {
  return {
    id: imdbId || localId,
    type: 'movie',
    name,
    poster: 'https://image.tmdb.org/t/p/w500/test.jpg',
    background: 'https://image.tmdb.org/t/p/w1280/test.jpg',
    description: 'A sufficiently rich movie description for the verification test.',
    releaseInfo: year,
    genres: ['Drama'],
    behaviorHints: { defaultVideoId: imdbId || localId },
    _addon: { imdbId: imdbId || null, localId, lang: 'CZ' }
  };
}

const mothers = cleanPublicMeta(richMovie({
  name: "My Mother's Wedding",
  imdbId: 'tt20911974',
  localId: 'filmovenovinky:test-mothers',
  year: '2023'
}));
assert.equal(mothers.id, 'tt20911974');
assert.equal(mothers.behaviorHints.defaultVideoId, 'tt20911974');
assert.equal(mothers.videos, undefined);

const addition = cleanPublicMeta(richMovie({
  name: 'Sčítání',
  imdbId: 'tt27722524',
  localId: 'filmovenovinky:test-addition',
  year: '2024'
}));
assert.equal(addition.id, 'tt27722524');
assert.equal(addition.behaviorHints.defaultVideoId, 'tt27722524');
assert.equal(addition.videos, undefined);

const bodlinka = cleanPublicMeta(richMovie({
  name: 'Bodlinka: Pichlavé dobrodružství',
  imdbId: 'tt6930962',
  localId: 'filmovenovinky:test-spiked',
  year: '2025'
}));
assert.equal(bodlinka.id, 'tt6930962');
assert.equal(bodlinka.behaviorHints.defaultVideoId, 'tt6930962');
assert.equal(bodlinka.videos, undefined);

const unmatched = cleanPublicMeta(richMovie({
  name: 'Unmatched Movie',
  imdbId: null,
  localId: 'filmovenovinky:test-unmatched'
}));
assert.equal(unmatched.id, 'filmovenovinky:test-unmatched');
assert.equal(unmatched.behaviorHints.defaultVideoId, 'filmovenovinky:test-unmatched');

console.log('IMDb public-id stream compatibility verification passed.');
