import { localStremioId } from './ids.js';

const META_FIELDS = new Set([
  'id', 'type', 'name', 'poster', 'posterShape', 'background', 'logo',
  'description', 'genres', 'releaseInfo', 'director', 'cast', 'imdbRating',
  'released', 'trailers', 'links', 'videos', 'runtime', 'language', 'country',
  'awards', 'website', 'behaviorHints'
]);

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

  // Stremio Meta schema requires director/cast/genres to be arrays of strings.
  // Older FilmovéNovinky cache stored director as a comma-separated string;
  // normalize it here so already-generated GitHub cache becomes client-safe
  // immediately, without requiring a full refresh.
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

  // First strip internal/non-standard cache fields and normalize strict types.
  const safeMeta = cleanKnownMetaFields(meta);

  if (safeMeta.type === 'movie') {
    // Movie metadata must not contain episode/video arrays: several clients
    // interpret them as a series. A movie has one logical video instead.
    delete safeMeta.videos;

    // Use an addon-owned metadata id so clients cannot silently redirect the
    // detail lookup to an incomplete Cinemeta entry. Keep IMDb as the stream
    // video id so existing tt-prefixed stream addons remain compatible.
    const videoId = addon.imdbId ||
      (typeof originalId === 'string' && originalId.startsWith('tt') ? originalId : localId);

    safeMeta.id = localId;
    safeMeta.behaviorHints = { defaultVideoId: String(videoId) };
  }

  return safeMeta;
}
