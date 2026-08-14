import { metaQuality, preferRicherMeta } from '../src/meta-quality.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const enriched = {
  id: 'tt20911974', type: 'movie', name: "My Mother's Wedding",
  poster: 'https://image.tmdb.org/t/p/w500/full.jpg',
  background: 'https://image.tmdb.org/t/p/w1280/full.jpg',
  description: 'A'.repeat(220), runtime: '96 min', imdbRating: '6.3',
  director: ['Kristin Scott Thomas'], cast: ['Scarlett Johansson'], genres: ['Comedy','Drama','CZ'],
  _addon: { imdbId: 'tt20911974', tmdbId: 985602, key: 'movie|my mother wedding|2023|cz' }
};

const placeholder = {
  id: 'filmovenovinky:abc', type: 'movie', name: "My Mother's Wedding",
  poster: 'https://placehold.co/500x750?text=My%20Mother%27s%20Wedding',
  background: 'https://placehold.co/500x750?text=My%20Mother%27s%20Wedding',
  description: 'Dabing: CZ\n\nPridané: 2026-08-08', genres: ['CZ'],
  behaviorHints: { defaultVideoId: 'filmovenovinky:abc' },
  _addon: { key: 'movie|my mother wedding|2023|cz' }
};

assert(metaQuality(enriched) > metaQuality(placeholder), 'Enriched metadata must score above placeholder metadata.');
assert(preferRicherMeta(enriched, placeholder) === enriched, 'A failed force-full refresh must not downgrade enriched metadata.');
assert(preferRicherMeta(placeholder, enriched) === enriched, 'A later successful enrichment must replace placeholder metadata.');
assert(preferRicherMeta(enriched, null) === enriched, 'Provider failure must preserve existing enriched metadata.');

console.log(JSON.stringify({ ok: true, checks: 4, message: 'Metadata downgrade protection checks passed.' }, null, 2));
