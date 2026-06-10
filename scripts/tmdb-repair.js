const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const CACHE_FILE = process.env.CACHE_FILE || path.join(process.cwd(), 'data', 'cache.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanTitle(title = '') {
  return String(title)
    .replace(/\((CZ|SK|CZ\/SK|SK\/CZ|Dabing|Tit|Titulky|HD|Full HD|4K).*?\)/gi, '')
    .replace(/\b(CZ|SK|CZ\/SK|SK\/CZ|Dabing|Tit|Titulky|HD|Full HD|4K|WEBRip|BluRay|HDRip)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getYear(item = {}) {
  if (item.year) return String(item.year).match(/\d{4}/)?.[0] || null;
  const fromTitle = String(item.title || '').match(/\b(19\d{2}|20\d{2})\b/);
  return fromTitle ? fromTitle[1] : null;
}

function needsTmdbRepair(item = {}) {
  if (!item) return false;
  if (item.type && item.type !== 'movie') return false;

  return (
    !item.tmdbId ||
    !item.poster ||
    !item.background ||
    !item.description ||
    String(item.description || '').length < 25
  );
}

function normalizeTmdbMovie(tmdb, originalItem = {}) {
  if (!tmdb || !tmdb.id) return originalItem;

  const poster = tmdb.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : originalItem.poster;
  const background = tmdb.backdrop_path ? `https://image.tmdb.org/t/p/w1280${tmdb.backdrop_path}` : originalItem.background;
  const year = tmdb.release_date ? tmdb.release_date.slice(0, 4) : getYear(originalItem);

  return {
    ...originalItem,
    type: 'movie',
    id: originalItem.imdbId || originalItem.id || `tmdb:${tmdb.id}`,
    tmdbId: String(tmdb.id),
    name: originalItem.name || originalItem.title || tmdb.title,
    title: originalItem.title || originalItem.name || tmdb.title,
    originalTitle: tmdb.original_title || originalItem.originalTitle,
    year,
    poster,
    background,
    description: tmdb.overview || originalItem.description || '',
    releaseDate: tmdb.release_date || originalItem.releaseDate,
    metadataStatus: 'ok',
    lastTmdbRepairAt: new Date().toISOString()
  };
}

async function tmdbFetch(url) {
  if (!TMDB_API_KEY) throw new Error('Missing TMDB_API_KEY');

  const sep = url.includes('?') ? '&' : '?';
  const finalUrl = `${url}${sep}api_key=${encodeURIComponent(TMDB_API_KEY)}&language=cs-CZ`;
  const res = await fetch(finalUrl);

  if (!res.ok) {
    throw new Error(`TMDB HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function findTmdbByImdb(imdbId) {
  if (!imdbId || !/^tt\d+$/i.test(imdbId)) return null;

  const data = await tmdbFetch(`https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id`);
  const movie = data.movie_results && data.movie_results[0];
  return movie || null;
}

async function searchTmdbByTitle(title, year) {
  const cleaned = cleanTitle(title);
  if (!cleaned) return null;

  let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleaned)}`;
  if (year) url += `&year=${encodeURIComponent(year)}`;

  const data = await tmdbFetch(url);
  if (!data.results || !data.results.length) return null;

  // Prefer exact/similar title and same year if possible.
  const normalized = cleaned.toLowerCase();
  const exact = data.results.find(m => {
    const t1 = String(m.title || '').toLowerCase();
    const t2 = String(m.original_title || '').toLowerCase();
    const y = m.release_date ? m.release_date.slice(0, 4) : null;
    return (t1 === normalized || t2 === normalized) && (!year || y === String(year));
  });

  return exact || data.results[0];
}

async function getTmdbDetails(tmdbId) {
  if (!tmdbId) return null;
  return tmdbFetch(`https://api.themoviedb.org/3/movie/${tmdbId}?append_to_response=external_ids,credits`);
}

function readCache(cacheFile = CACHE_FILE) {
  if (!fs.existsSync(cacheFile)) {
    throw new Error(`Cache file not found: ${cacheFile}`);
  }
  return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
}

function writeCache(cache, cacheFile = CACHE_FILE) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

function getMovieArray(cache) {
  if (Array.isArray(cache)) return cache;
  if (Array.isArray(cache.movies)) return cache.movies;
  if (Array.isArray(cache.items)) return cache.items.filter(x => !x.type || x.type === 'movie');
  if (Array.isArray(cache.metas)) return cache.metas.filter(x => !x.type || x.type === 'movie');
  return [];
}

async function repairMissingTmdbMetadata(options = {}) {
  const limit = Number(options.limit || 100);
  const delayMs = Number(options.delayMs || 300);
  const cacheFile = options.cacheFile || CACHE_FILE;

  const cache = readCache(cacheFile);
  const movies = getMovieArray(cache);
  const targets = movies.filter(needsTmdbRepair).slice(0, limit);

  const result = {
    ok: true,
    cacheFile,
    scanned: movies.length,
    targets: targets.length,
    repaired: 0,
    failed: 0,
    missing: []
  };

  for (const item of targets) {
    try {
      const year = getYear(item);
      let tmdb = null;

      if (item.imdbId) {
        tmdb = await findTmdbByImdb(item.imdbId);
      }

      if (!tmdb) {
        tmdb = await searchTmdbByTitle(item.title || item.name, year);
      }

      if (!tmdb || !tmdb.id) {
        item.metadataStatus = 'missing_tmdb';
        item.lastTmdbRepairAt = new Date().toISOString();
        result.failed++;
        result.missing.push({ title: item.title || item.name, year, reason: 'TMDB not found' });
        await sleep(delayMs);
        continue;
      }

      const details = await getTmdbDetails(tmdb.id);
      const enriched = normalizeTmdbMovie(details || tmdb, item);
      Object.assign(item, enriched);
      result.repaired++;
    } catch (err) {
      item.metadataStatus = 'missing_tmdb';
      item.lastTmdbRepairAt = new Date().toISOString();
      result.failed++;
      result.missing.push({
        title: item.title || item.name,
        year: getYear(item),
        reason: err.message
      });
    }

    await sleep(delayMs);
  }

  writeCache(cache, cacheFile);
  return result;
}

module.exports = {
  cleanTitle,
  needsTmdbRepair,
  repairMissingTmdbMetadata
};
