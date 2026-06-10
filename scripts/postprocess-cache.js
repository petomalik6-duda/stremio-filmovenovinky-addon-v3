import fs from 'fs/promises';

const CACHE_FILE = process.env.CACHE_FILE || 'data/catalog-cache.json';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_LANGUAGE = process.env.TMDB_LANGUAGE || 'cs-CZ';
const DELAY_MS = Number(process.env.POSTPROCESS_DELAY_MS || 200);
const LIMIT = Number(process.env.POSTPROCESS_LIMIT || 1000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function norm(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getOriginalName(meta) {
  const d = String(meta.description || '');
  const m = d.match(/Origin[aá]lny n[aá]zov:\s*([^\n]+)/i);
  return m?.[1]?.trim() || null;
}

function getYear(meta) {
  return String(meta.year || meta.releaseInfo || '').match(/(19\d{2}|20\d{2})/)?.[1] || '';
}

function getCsfdUrl(meta) {
  return meta?._addon?.csfdUrl || String(meta.description || '').match(/https?:\/\/www\.csfd\.cz\/[^\s]+/i)?.[0] || null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; FilmovenovinkyCacheWorkflow/1.0)',
      'accept': 'text/html,application/xhtml+xml'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function imdbFromCsfd(csfdUrl) {
  if (!csfdUrl) return null;
  try {
    const html = await fetchText(csfdUrl);
    return html.match(/imdb\.com\/title\/(tt\d{7,10})/i)?.[1]
      || html.match(/\btt\d{7,10}\b/i)?.[0]
      || null;
  } catch {
    return null;
  }
}

async function tmdbGet(path, params = {}) {
  if (!TMDB_API_KEY) return null;
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', TMDB_LANGUAGE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function tmdbByImdb(imdbId) {
  if (!imdbId) return null;
  const data = await tmdbGet(`/find/${imdbId}`, { external_source: 'imdb_id' });
  return data?.movie_results?.[0]?.id || null;
}

async function imdbFromTmdbId(tmdbId) {
  if (!tmdbId) return null;
  const data = await tmdbGet(`/movie/${tmdbId}`, { append_to_response: 'external_ids' });
  return data?.external_ids?.imdb_id || null;
}

function scoreMovie(meta, movie) {
  const wanted = [meta.name, getOriginalName(meta)].filter(Boolean).map(norm);
  const found = [movie.title, movie.original_title].filter(Boolean).map(norm);
  const year = getYear(meta);
  const movieYear = String(movie.release_date || '').slice(0, 4);

  let score = 0;
  if (year && movieYear === year) score += 40;
  for (const w of wanted) {
    for (const f of found) {
      if (w === f) score += 60;
      else if (w.includes(f) || f.includes(w)) score += 25;
    }
  }
  return score;
}

async function tmdbSearch(meta) {
  const year = getYear(meta);
  const titles = [getOriginalName(meta), meta.name].filter(Boolean);
  const queries = [...new Set(titles.flatMap(t => [t, norm(t)]).filter(Boolean))];

  let best = null;
  let bestScore = 0;

  for (const query of queries) {
    for (const withYear of [true, false]) {
      const data = await tmdbGet('/search/movie', {
        query,
        year: withYear ? year : undefined,
        include_adult: false
      });
      const results = Array.isArray(data?.results) ? data.results.slice(0, 8) : [];
      for (const movie of results) {
        const s = scoreMovie(meta, movie);
        if (s > bestScore) {
          bestScore = s;
          best = movie;
        }
      }
      if (bestScore >= 90) return best;
      await sleep(50);
    }
  }

  return bestScore >= 60 ? best : null;
}

function setImdb(meta, imdbId) {
  if (!imdbId) return false;
  meta.id = imdbId;
  meta.behaviorHints = { ...(meta.behaviorHints || {}), defaultVideoId: imdbId };
  meta._addon = { ...(meta._addon || {}), imdbId };
  if (!String(meta.description || '').includes(`IMDb: ${imdbId}`)) {
    meta.description = `${meta.description || ''}\n\nIMDb: ${imdbId}`.trim();
  }
  const hasImdbLink = (meta.links || []).some(l => l?.name === 'IMDb' || String(l?.url || '').includes('imdb.com/title/'));
  if (!hasImdbLink) {
    meta.links = [
      ...(meta.links || []),
      { name: 'IMDb', category: 'Info', url: `https://www.imdb.com/title/${imdbId}/` }
    ];
  }
  return true;
}

const raw = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
const metas = Array.isArray(raw.metas) ? raw.metas : [];
let checked = 0;
let fixed = 0;
let csfdHits = 0;
let tmdbHits = 0;

for (const meta of metas) {
  if (checked >= LIMIT) break;
  if (meta.type !== 'movie') continue;

  const currentImdb = meta?._addon?.imdbId || (String(meta.id || '').startsWith('tt') ? meta.id : null);
  if (currentImdb) {
    if (meta.id !== currentImdb) {
      setImdb(meta, currentImdb);
      fixed += 1;
    }
    continue;
  }

  checked += 1;

  let imdbId = await imdbFromCsfd(getCsfdUrl(meta));
  if (imdbId) csfdHits += 1;

  if (!imdbId && meta?._addon?.tmdbId) {
    imdbId = await imdbFromTmdbId(meta._addon.tmdbId);
    if (imdbId) tmdbHits += 1;
  }

  if (!imdbId && TMDB_API_KEY) {
    const movie = await tmdbSearch(meta);
    if (movie?.id) {
      meta._addon = { ...(meta._addon || {}), tmdbId: movie.id };
      if (!String(meta.description || '').includes(`TMDB: ${movie.id}`)) {
        meta.description = `${meta.description || ''}\n\nTMDB: ${movie.id}`.trim();
      }
      imdbId = await imdbFromTmdbId(movie.id);
      if (imdbId) tmdbHits += 1;
    }
  }

  if (imdbId) {
    setImdb(meta, imdbId);
    fixed += 1;
  }

  await sleep(DELAY_MS);
}

raw.metas = metas;
raw.at = Date.now();
raw.lastError = null;
await fs.writeFile(CACHE_FILE, JSON.stringify(raw, null, 2));
console.log(JSON.stringify({ ok: true, checked, fixed, csfdHits, tmdbHits, cacheFile: CACHE_FILE }, null, 2));
