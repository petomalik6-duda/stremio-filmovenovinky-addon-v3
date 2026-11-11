import fs from 'node:fs';
import { cleanPublicMeta } from '../src/public-meta.js';

const cache = JSON.parse(fs.readFileSync(new URL('../data/catalog-cache.json', import.meta.url), 'utf8'));
const requiredCases = new Map([
  ['tt20911974', "My Mother's Wedding"],
  ['tt27722524', 'Sčítání']
]);

function fail(meta, message) {
  throw new Error(`${meta?.name || meta?.id || 'unknown'}: ${message}`);
}

function assertString(meta, key, required = false) {
  const value = meta[key];
  if (value == null) {
    if (required) fail(meta, `${key} is required`);
    return;
  }
  if (typeof value !== 'string' || !value.trim()) fail(meta, `${key} must be a non-empty string`);
}

function assertStringArray(meta, key) {
  const value = meta[key];
  if (value == null) return;
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim())) {
    fail(meta, `${key} must be an array of non-empty strings`);
  }
}

let checked = 0;
let customIds = 0;
for (const raw of cache.metas || []) {
  const meta = cleanPublicMeta(raw);
  if (!meta) continue;
  checked++;

  assertString(meta, 'id', true);
  assertString(meta, 'type', true);
  assertString(meta, 'name', true);
  assertString(meta, 'poster', true);
  for (const key of ['background','description','releaseInfo','imdbRating','runtime','language','country','awards','website']) {
    assertString(meta, key);
  }
  for (const key of ['genres','director','cast']) assertStringArray(meta, key);

  if ('year' in meta) fail(meta, 'non-standard year leaked into public meta');
  if ('_addon' in meta) fail(meta, 'internal _addon leaked into public meta');

  if (meta.links != null) {
    if (!Array.isArray(meta.links)) fail(meta, 'links must be an array');
    for (const link of meta.links) {
      if (!link || typeof link !== 'object') fail(meta, 'invalid link object');
      for (const key of ['name','category','url']) {
        if (typeof link[key] !== 'string' || !link[key].trim()) fail(meta, `link.${key} must be a string`);
      }
    }
  }

  if (meta.type === 'movie') {
    if (!/^(?:tt\d+|tmdb:\d+|filmovenovinky:.+)$/.test(meta.id)) fail(meta, `invalid movie public id: ${meta.id}`);
    const expectedImdb = raw?._addon?.imdbId || (/^tt\d+$/.test(raw.id || '') ? raw.id : null);
    if (expectedImdb && meta.id !== expectedImdb) fail(meta, 'IMDb identity changed');
    if (meta.videos !== undefined) fail(meta, 'movies must not expose episode or embedded stream arrays');
    if (meta.id.startsWith('filmovenovinky:')) {
      customIds++;
      if (meta.behaviorHints?.defaultVideoId !== meta.id) fail(meta, 'local movie playback id changed');
    } else if (meta.behaviorHints !== undefined) {
      fail(meta, 'standard movie ids must use normal cross-addon stream aggregation');
    }
  }

  const expected = requiredCases.get(raw?._addon?.imdbId || raw?.id);
  if (expected) {
    if (meta.name !== expected) fail(meta, `expected ${expected}`);
    if (!meta.description || !meta.background || !meta.poster) fail(meta, 'required test movie has incomplete detail');
    if (meta.director && !Array.isArray(meta.director)) fail(meta, 'director normalization failed');
    requiredCases.delete(raw?._addon?.imdbId || raw?.id);
  }
}

if (requiredCases.size) throw new Error(`Required movies missing: ${[...requiredCases.keys()].join(', ')}`);

console.log(JSON.stringify({ ok: true, checked, customIds, schema: 'strict-stremio-meta' }, null, 2));
