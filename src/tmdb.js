import axios from 'axios';

const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w500';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280';
const LANG = process.env.TMDB_LANGUAGE || 'cs-CZ';

const TMDB_YEAR_TOLERANCE = Number(process.env.TMDB_YEAR_TOLERANCE || 1);
const TMDB_SEARCH_LIMIT = Number(process.env.TMDB_SEARCH_LIMIT || 8);

function tmdbEnabled() { return String(process.env.ENABLE_TMDB || 'false').toLowerCase() === 'true'; }
function key() { return tmdbEnabled() ? (process.env.TMDB_API_KEY || '') : ''; }

async function tmdbGet(path, params = {}) {
  if (!key()) return null;
  const { data } = await axios.get(`${TMDB}${path}`, {
    params: { api_key: key(), language: LANG, ...params },
    timeout: 15000
  });
  return data;
}

export async function tmdbByImdb(imdbId, type='movie') {
  if (!imdbId || !key()) return null;
  const found = await tmdbGet(`/find/${imdbId}`, { external_source: 'imdb_id' });
  const res = type === 'series' ? found?.tv_results?.[0] : found?.movie_results?.[0];
  if (!res?.id) return null;
  return type === 'series' ? tmdbSeries(res.id) : tmdbMovie(res.id);
}

export async function tmdbSearch(title, year, type='movie') {
  if (!title || !key()) return null;

  const queries = [...new Set([
    cleanQuery(title),
    stripSubtitle(cleanQuery(title)),
  ].filter(Boolean))];

  const attempts = [];
  for (const q of queries) {
    if (year) attempts.push({ query: q, year });
    attempts.push({ query: q, year: undefined });
  }

  let best = null;

  for (const attempt of attempts) {
    const found = await searchOne(attempt.query, attempt.year, type, year);
    if (found && (!best || found._score > best._score)) best = found;
    if (best && best._score >= 90) break;
  }

  if (!best) return null;
  delete best._score;
  return best;
}

async function searchOne(title, requestYear, type, expectedYear) {
  const path = type === 'series' ? '/search/tv' : '/search/movie';
  const params = type === 'series'
    ? { query: title, first_air_date_year: requestYear || undefined, include_adult: false }
    : { query: title, year: requestYear || undefined, include_adult: false };

  const data = await tmdbGet(path, params);
  const results = Array.isArray(data?.results) ? data.results.slice(0, TMDB_SEARCH_LIMIT) : [];
  if (!results.length) return null;

  const candidates = [];

  for (const result of results) {
    try {
      const full = type === 'series' ? await tmdbSeries(result.id) : await tmdbMovie(result.id);
      if (!full) continue;
      full._score = scoreCandidate(title, expectedYear, full);
      candidates.push(full);
    } catch (e) {
      console.error('[tmdb] candidate failed:', title, result.id, e.message);
    }
  }

  candidates.sort((a, b) => b._score - a._score);
  const best = candidates[0];

  if (!best) return null;

  // Pri nových budúcich filmoch býva rok na webe iný než TMDB release year.
  // Ak názov sedí dobre, povoľ aj rozdiel roka.
  const hasStrongTitle = best._score >= 50;
  const yearOk = !expectedYear || !best.releaseInfo || Math.abs(Number(best.releaseInfo) - Number(expectedYear)) <= TMDB_YEAR_TOLERANCE;

  if (yearOk || hasStrongTitle) return best;
  return null;
}

function scoreCandidate(query, expectedYear, meta) {
  let score = 0;
  const q = normalize(query);
  const name = normalize(meta.name);
  const original = normalize(meta.originalName);

  if (name === q) score += 70;
  else if (original === q) score += 70;
  else if (name.includes(q) || q.includes(name)) score += 35;
  else if (original.includes(q) || q.includes(original)) score += 35;

  if (expectedYear && meta.releaseInfo) {
    const diff = Math.abs(Number(meta.releaseInfo) - Number(expectedYear));
    if (diff === 0) score += 25;
    else if (diff <= TMDB_YEAR_TOLERANCE) score += 10;
    else score -= 10;
  }

  if (meta.imdbId) score += 10;
  if (meta.poster) score += 3;
  return score;
}

function common(data, type) {
  const title = type === 'series' ? (data.name || data.original_name) : (data.title || data.original_title);
  const original = type === 'series' ? data.original_name : data.original_title;
  const date = type === 'series' ? data.first_air_date : data.release_date;
  return {
    tmdbId: data.id,
    imdbId: data.external_ids?.imdb_id || null,
    name: title,
    originalName: original,
    description: data.overview || '',
    poster: data.poster_path ? `${IMG}${data.poster_path}` : null,
    background: data.backdrop_path ? `${BACKDROP}${data.backdrop_path}` : null,
    releaseInfo: (date || '').slice(0, 4),
    genres: (data.genres || []).map(g => g.name),
    imdbRating: data.vote_average ? String(Math.round(data.vote_average * 10) / 10) : undefined,
    cast: (data.credits?.cast || []).slice(0, 8).map(c => c.name),
    trailer: (data.videos?.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer')?.key || null
  };
}

export async function tmdbMovie(id) {
  const data = await tmdbGet(`/movie/${id}`, { append_to_response: 'external_ids,credits,videos' });
  if (!data) return null;
  return {
    ...common(data, 'movie'),
    type: 'movie',
    runtime: data.runtime ? `${data.runtime} min` : undefined,
    director: (data.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name).join(', ')
  };
}

export async function tmdbSeries(id) {
  const data = await tmdbGet(`/tv/${id}`, { append_to_response: 'external_ids,credits,videos' });
  if (!data) return null;
  return {
    ...common(data, 'series'),
    type: 'series',
    runtime: data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min/ep` : undefined,
    director: (data.created_by || []).map(c => c.name).join(', ')
  };
}

function cleanQuery(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSubtitle(value) {
  return String(value || '').split(':')[0].trim();
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
