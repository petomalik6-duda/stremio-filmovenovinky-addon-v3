'use strict';

/**
 * ADAPTER FILE - uprav podľa názvov funkcií v tvojom addone.
 *
 * FilmovéNovinky problém:
 * - TMDB detail môže chýbať
 * - alebo film má TMDB detail, ale `detailUrl: null`, takže stream nenájde
 */

const fs = require('fs');
const path = require('path');
const { repairMissingTmdbMetadata } = require('./tmdb-repair');
const { repairMissingStreamSources } = require('./stream-source-repair');

const CACHE_CANDIDATES = [
  path.join(__dirname, '..', 'data', 'cache.json'),
  path.join(__dirname, '..', 'data', 'filmovenovinky-cache.json'),
  path.join(__dirname, '..', 'data', 'items.json'),
  path.join(__dirname, '..', 'cache.json')
];

function findCacheFile() {
  const found = CACHE_CANDIDATES.find(p => fs.existsSync(p));
  if (!found) {
    throw new Error('Nenašiel som cache súbor. Uprav CACHE_CANDIDATES v repair-filmovenovinky-after-refresh.js');
  }
  return found;
}

function loadCache() {
  const file = findCacheFile();
  const cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { file, cache };
}

function getItems(cache) {
  if (Array.isArray(cache.items)) return cache.items;
  if (Array.isArray(cache.metas)) return cache.metas;
  if (cache.data && Array.isArray(cache.data.items)) return cache.data.items;
  throw new Error('V cache nevidím pole items/metas. Uprav getItems() v repair-filmovenovinky-after-refresh.js');
}

function saveCache(file, cache) {
  fs.writeFileSync(file, JSON.stringify(cache, null, 2));
}

async function repairTmdbAfterRefresh({ limit = 300 } = {}) {
  const { file } = loadCache();
  return await repairMissingTmdbMetadata({ cacheFile: file, limit });
}

async function repairStreamsAfterRefresh({ limit = 300 } = {}) {
  const { file } = loadCache();
  return await repairMissingStreamSources({ cachePath: file, limit });
}

module.exports = { repairTmdbAfterRefresh, repairStreamsAfterRefresh };
