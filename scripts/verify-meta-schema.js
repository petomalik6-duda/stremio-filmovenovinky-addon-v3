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
    if (!meta.id.startsWith('filmovenovinky:')) fail(meta, `movie public id must use filmovenovinky:, got ${meta.id}`);
    customIds++;
    if (meta.videos != null) {
      if (!Array.isArray(meta.videos) || meta.videos.length !== 1) fail(meta, 'movie videos must contain exactly one stream bridge video');
      const video = meta.videos[0];
      if (!video || typeof video !== 'object') fail(meta, 'invalid movie video object');
      if (typeof video.id !== 'string' || !/^tt\d+$/.test(video.id)) fail(meta, 'movie video id must be IMDb tt id');
      if (typeof video.title !== 'string' || !video.title.trim()) fail(meta, 'movie video title is required');
      if ('season' in video || 'episode' in video) fail(meta, 'movie video must not expose season/episode');
    }
    if (!meta.behaviorHints || typeof meta.behaviorHints !== 'object' || Array.isArray(meta.behaviorHints)) {
      fail(meta, 'behaviorHints must be an object');
    }
    assertString({name: meta.name, defaultVideoId: meta.behaviorHints.defaultVideoId}, 'defaultVideoId', true);
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
