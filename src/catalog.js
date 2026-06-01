import { scrapeFilmovenovinky, itemKey } from './scrape.js';
import { fetchCsfdMeta, searchCsfd } from './csfd.js';
import { tmdbByImdb, tmdbSearch } from './tmdb.js';
import { readStore, writeStore, storePath } from './store.js';

const MAX_ITEMS = Number(process.env.MAX_ITEMS || 500);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_HOURS || 12) * 60 * 60 * 1000;
const REFRESH_NEW_ONLY = String(process.env.REFRESH_NEW_ONLY || 'true').toLowerCase() !== 'false';
const CSFD_SEARCH_FALLBACK = String(process.env.CSFD_SEARCH_FALLBACK || 'true').toLowerCase() !== 'false';
const ENRICH_LIMIT = Number(process.env.ENRICH_LIMIT || 80);

let cache = { at: 0, metas: [], byId: new Map(), items: [], sourceHash: '' };
let running = null;

function buildIndex(metas) { return new Map((metas || []).map(m => [m.id, m])); }
function stremioId(item, csfd, tmdb) { return tmdb?.imdbId || csfd?.imdbId || `filmovenovinky:${Buffer.from(`${item.type}-${item.name}-${item.year}-${item.lang}`).toString('base64url')}`; }
function score(meta) { const n = Number(meta.imdbRating || 0); return Number.isFinite(n) ? n : 0; }
function tmdbUrl(type, id) { return `https://www.themoviedb.org/${type === 'series' ? 'tv' : 'movie'}/${id}`; }

function toMeta(item, csfd = {}, tmdb = null) {
  const type = item.type === 'series' ? 'series' : 'movie';
  const id = stremioId(item, csfd, tmdb);
  const imdbId = tmdb?.imdbId || csfd?.imdbId || null;
  const displayName = item.name || tmdb?.name;
  const links = [
    item.csfdUrl ? { name: 'ČSFD', category: 'Info', url: item.csfdUrl } : null,
    imdbId ? { name: 'IMDb', category: 'Info', url: `https://www.imdb.com/title/${imdbId}/` } : null,
    tmdb?.tmdbId ? { name: 'TMDB', category: 'Info', url: tmdbUrl(type, tmdb.tmdbId) } : null,
    item.detailUrl ? { name: 'FilmovéNovinky', category: 'Info', url: item.detailUrl } : null,
    { name: 'Zdroj', category: 'Info', url: item.sourceUrl }
  ].filter(Boolean);
  const descriptionParts = [
    tmdb?.description || csfd.description || '',
    item.originalName ? `Originálny názov: ${item.originalName}` : null,
    `Dabing: ${item.lang || 'CZ/SK'}`,
    `Pridané: ${item.dateAdded}`,
    item.csfdUrl ? `ČSFD: ${item.csfdUrl}` : null,
    imdbId ? `IMDb: ${imdbId}` : null,
    tmdb?.tmdbId ? `TMDB: ${tmdb.tmdbId}` : null
  ].filter(Boolean);
  return {
    id, type,
    name: displayName,
    poster: tmdb?.poster || csfd.poster || undefined,
    background: tmdb?.background || undefined,
    description: descriptionParts.join('\n\n'),
    releaseInfo: tmdb?.releaseInfo || item.year || undefined,
    year: Number(tmdb?.releaseInfo || item.year) || undefined,
    runtime: tmdb?.runtime,
    genres: [...new Set([...(tmdb?.genres || []), ...(csfd.genres || []), item.lang].filter(Boolean))],
    imdbRating: tmdb?.imdbRating,
    director: tmdb?.director,
    cast: tmdb?.cast,
    links,
    behaviorHints: { defaultVideoId: id },
    videos: tmdb?.trailer ? [{ id: `yt:${tmdb.trailer}`, title: 'Trailer', released: item.dateAdded }] : undefined,
    _addon: { key: item.key || itemKey(item), dateAdded: item.dateAdded, lang: item.lang, csfdUrl: item.csfdUrl || null, imdbId, tmdbId: tmdb?.tmdbId || null, sourceType: type, titleRaw: item.titleRaw }
  };
}

async function enrichItem(item) {
  let csfdUrl = item.csfdUrl;
  if (item.type !== 'series' && !csfdUrl && CSFD_SEARCH_FALLBACK) {
    csfdUrl = await searchCsfd(item.originalName || item.name, item.year) || await searchCsfd(item.name, item.year);
  }
  const normalizedItem = { ...item, csfdUrl };
  const csfd = item.type === 'series' ? {} : await fetchCsfdMeta(csfdUrl);
  let tmdb = await tmdbByImdb(csfd.imdbId, item.type);
  if (!tmdb) tmdb = await tmdbSearch(item.originalName || item.name, item.year, item.type);
  if (!tmdb && item.originalName) tmdb = await tmdbSearch(item.name, item.year, item.type);
  return toMeta(normalizedItem, csfd, tmdb);
}

async function loadFromDisk() { const store = await readStore(); cache = { ...store, byId: buildIndex(store.metas) }; return cache; }

export async function refreshCache({ forceFull = false } = {}) {
  if (running) return running;
  running = (async () => {
    const current = cache.at ? cache : await loadFromDisk();
    const scraped = await scrapeFilmovenovinky(MAX_ITEMS);
    if (!forceFull && current.sourceHash === scraped.sourceHash && current.metas.length) {
      cache = { ...current, at: Date.now(), byId: buildIndex(current.metas) };
      await writeStore({ at: cache.at, sourceHash: cache.sourceHash, items: cache.items, metas: cache.metas });
      return cache.metas;
    }
    const oldByKey = new Map((current.metas || []).map(m => [m._addon?.key, m]).filter(([k]) => k));
    const metas = [];
    let enriched = 0;
    for (const item of scraped.items) {
      const key = item.key || itemKey(item);
      const reusable = !forceFull && REFRESH_NEW_ONLY && oldByKey.get(key);
      if (reusable) { metas.push(reusable); continue; }
      if (!forceFull && enriched >= ENRICH_LIMIT && oldByKey.has(key)) { metas.push(oldByKey.get(key)); continue; }
      try { metas.push(await enrichItem(item)); enriched += 1; }
      catch (e) { console.error('Enrich failed:', item.name, e.message); metas.push(toMeta(item)); }
    }
    cache = { at: Date.now(), sourceHash: scraped.sourceHash, items: scraped.items, metas, byId: buildIndex(metas) };
    await writeStore({ at: cache.at, sourceHash: cache.sourceHash, items: cache.items, metas: cache.metas });
    return metas;
  })().finally(() => { running = null; });
  return running;
}

export async function getCatalog() {
  if (!cache.at) await loadFromDisk();
  if (!cache.at || Date.now() - cache.at > CACHE_TTL_MS) {
    try { return await refreshCache(); } catch (e) { console.error('Refresh failed:', e.message); return cache.metas || []; }
  }
  return cache.metas;
}
export async function getMetaById(id) { await getCatalog(); return cache.byId.get(id) || null; }
export async function getCatalogStats() {
  await getCatalog();
  return { at: cache.at, items: cache.metas.length, cacheFile: storePath(), movies: cache.metas.filter(m => m.type === 'movie').length, series: cache.metas.filter(m => m.type === 'series').length, cz: cache.metas.filter(m => m._addon?.lang === 'CZ').length, sk: cache.metas.filter(m => m._addon?.lang === 'SK').length, czsk: cache.metas.filter(m => m._addon?.lang === 'CZ/SK').length, withCsfd: cache.metas.filter(m => m._addon?.csfdUrl).length, withImdb: cache.metas.filter(m => m._addon?.imdbId).length, withTmdb: cache.metas.filter(m => m._addon?.tmdbId).length };
}
export function searchCatalog(metas, query) { const q = String(query || '').trim().toLowerCase(); if (!q) return metas; return metas.filter(m => `${m.name} ${m.description || ''} ${(m.genres || []).join(' ')} ${m._addon?.titleRaw || ''}`.toLowerCase().includes(q)); }
export function filterCatalog(metas, id, type) {
  let arr = [...metas].filter(m => !type || m.type === type);
  if (id === 'filmovenovinky-cz') arr = arr.filter(m => m._addon?.lang === 'CZ');
  if (id === 'filmovenovinky-sk') arr = arr.filter(m => m._addon?.lang === 'SK');
  if (id === 'filmovenovinky-czsk') arr = arr.filter(m => m._addon?.lang === 'CZ/SK');
  if (id === 'filmovenovinky-serialy') arr = arr.filter(m => m.type === 'series');
  if (id === 'filmovenovinky-top') return arr.filter(m => score(m) > 0).sort((a, b) => score(b) - score(a));
  return arr.sort((a, b) => String(b._addon?.dateAdded || '').localeCompare(String(a._addon?.dateAdded || '')));
}
