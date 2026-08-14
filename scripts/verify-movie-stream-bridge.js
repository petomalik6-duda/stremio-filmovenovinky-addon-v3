import assert from 'node:assert/strict';
import { cleanPublicMeta } from '../src/public-meta.js';

const raw = {
  id: 'tt6930962',
  type: 'movie',
  name: 'Bodlinka: Pichlavé dobrodružství',
  releaseInfo: '2025',
  poster: 'https://example.test/poster.jpg',
  background: 'https://example.test/bg.jpg',
  description: 'Test description',
  videos: [{ id: 'youtube:trailer', title: 'Trailer', season: 1, episode: 1 }],
  behaviorHints: { defaultVideoId: 'tt6930962' },
  _addon: {
    imdbId: 'tt6930962',
    localId: 'filmovenovinky:test-bodlinka',
    lang: 'CZ'
  }
};

const meta = cleanPublicMeta(raw);
assert.equal(meta.id, 'tt6930962');
assert.equal(meta.behaviorHints.defaultVideoId, 'tt6930962');
assert.equal(meta.videos, undefined);
assert.equal(meta.type, 'movie');

console.log(JSON.stringify({
  ok: true,
  streamLookupId: meta.id,
  defaultVideoId: meta.behaviorHints.defaultVideoId,
  videosPresent: false
}, null, 2));
