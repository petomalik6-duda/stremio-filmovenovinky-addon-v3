import { localStremioId } from './ids.js';

const META_FIELDS = new Set([
  'id', 'type', 'name', 'poster', 'posterShape', 'background', 'logo',
  'description', 'genres', 'releaseInfo', 'director', 'cast', 'imdbRating',
  'released', 'trailers', 'links', 'videos', 'runtime', 'language', 'country',
  'awards', 'website', 'behaviorHints'
]);

function placeholderPoster(name) {
  return `https://placehold.co/500x750/222222/ffffff.png?text=${encodeURIComponent(String(name || 'CZ/SK').slice(0, 35))}`;
}

function asString(value) {
  if (value === undefined || value === null) return undefined;
  const out = String(value).trim();
  return out || undefined;
}

function asStringArray(value, { splitComma = false } = {}) {
  if (value === undefined || value === null) return undefined;

  const source = Array.isArray(value)
    ? value
    : splitComma
      ? String(value).split(',')
      : [value];

  const out = source
    .map(v => asString(v))
    .filter(Boolean);

  return out.length ? [...new Set(out)] : undefined;
}

function cleanLinks(value) {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map(link => {
      if (!link || typeof link !== 'object') return null;
      const name = asString(link.name);
      const category = asString(link.category);
      const url = asString(link.url);
      return name && category && url ? { name, category, url } : null;
    })
    .filter(Boolean);
  return out.length ? out : undefined;
}

function cleanBehaviorHints(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const defaultVideoId = asString(value.defaultVideoId);
  return defaultVideoId ? { defaultVideoId } : undefined;
}

function cleanKnownMetaFields(meta) {
  const out = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (!META_FIELDS.has(key) || value === undefined || value === null) continue;
    out[key] = value;
  }

  out.id = asString(out.id);
  out.type = asString(out.type);
  out.name = asString(out.name);
  out.poster = asString(out.poster);
  out.posterShape = asString(out.posterShape);
  out.background = asString(out.background);
  out.logo = asString(out.logo);
  out.description = asString(out.description);
  out.releaseInfo = asString(out.releaseInfo);
  out.imdbRating = asString(out.imdbRating);
  out.released = asString(out.released);
  out.runtime = asString(out.runtime);
  out.language = asString(out.language);
  out.country = asString(out.country);
  out.awards = asString(out.awards);
  out.website = asString(out.website);

  out.director = asStringArray(out.director, { splitComma: true });
  out.cast = asStringArray(out.cast);
  out.genres = asStringArray(out.genres);
  out.links = cleanLinks(out.links);
  out.behaviorHints = cleanBehaviorHints(out.behaviorHints);

  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export function publicLocalId(meta) {
  if (!meta) return null;

  if (meta?._addon?.localId) return meta._addon.localId;

  return localStremioId({
    type: meta.type === 'series' ? 'series' : 'movie',
    name: meta.name || 'Bez názvu',
    year: meta.year || meta.releaseInfo || '',
    lang: meta?._addon?.lang || 'CZ/SK'
  });
}

export function cleanPublicMeta(meta) {
  if (!meta) return null;

  const addon = meta._addon || {};
  const originalId = meta.id;
  const localId = publicLocalId(meta);
  const safeMeta = cleanKnownMetaFields(meta);

  const displayName = safeMeta.name || meta.name || 'CZ/SK';
  if (!safeMeta.poster) safeMeta.poster = placeholderPoster(displayName);
  if (!safeMeta.posterShape) safeMeta.posterShape = 'poster';
  if (!safeMeta.background) safeMeta.background = safeMeta.poster;

  if (safeMeta.type === 'movie') {
    // Reference-addon identity model used by Nuvio aggregation:
    // IMDb first, otherwise TMDB, and only then a local FilmovéNovinky fallback.
    const imdbId = addon.imdbId ||
      (typeof originalId === 'string' && /^tt\d+$/.test(originalId) ? originalId : null);
    const rawTmdbId = addon.tmdbId ||
      (typeof originalId === 'string' && /^tmdb:\d+$/.test(originalId)
        ? originalId.slice('tmdb:'.length)
        : null);
    const tmdbId = rawTmdbId && Number(rawTmdbId) > 0 ? `tmdb:${Number(rawTmdbId)}` : null;
    const publicId = imdbId || tmdbId || localId;

    safeMeta.id = publicId;

    // Standard tt/tmdb IDs must remain clean so Nuvio can ask every compatible
    // stream addon for the same video ID. Local-only entries keep their direct hint.
    if (/^tt\d+$/.test(publicId) || /^tmdb:\d+$/.test(publicId)) {
      delete safeMeta.behaviorHints;
    } else {
      safeMeta.behaviorHints = { defaultVideoId: String(publicId) };
    }

    // Movies use meta.id itself as the playback identity; no embedded videos.
    delete safeMeta.videos;
  }

  return safeMeta;
}
