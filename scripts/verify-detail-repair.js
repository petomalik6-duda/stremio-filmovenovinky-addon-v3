import assert from 'node:assert/strict';
import { metaNeedsDetailRepair } from '../src/meta-quality.js';

const rich = { poster: 'https://image.tmdb.org/t/p/w500/poster.jpg', background: 'https://image.tmdb.org/t/p/w1280/bg.jpg', description: 'A complete narrative description with enough detail to describe this film.' };
assert.equal(metaNeedsDetailRepair(rich), false);
assert.equal(metaNeedsDetailRepair({ ...rich, poster: 'https://placehold.co/500x750/test.png' }), true, 'placeholder posters must be repaired');
assert.equal(metaNeedsDetailRepair({ ...rich, background: 'https://placehold.co/bg.png' }), true);
assert.equal(metaNeedsDetailRepair({ ...rich, description: 'Dabing: CZ' }), true);
assert.equal(metaNeedsDetailRepair({ ...rich, poster: undefined }), true);
assert.equal(metaNeedsDetailRepair({ ...rich, poster: 'https://example.com/placehold.co/poster.jpg' }), false, 'a path is not a placeholder hostname');
console.log('Metadata detail repair fixture checks passed.');
