function isPlaceholderUrl(value) {
  return /(?:^|\.)placehold\.co\//i.test(String(value || ''));
}


function hasNarrativeDescription(meta) {
  const lines = String(meta?.description || '')
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean)
    .filter(line => !/^(Origin[aá]lny n[aá]zov|Dabing|Pridan[eé]|ČSFD|IMDb|TMDB):/i.test(line));
  return lines.join(' ').length >= 20;
}

export function metaNeedsDetailRepair(meta) {
  if (!meta) return true;
  if (!meta.poster || isPlaceholderUrl(meta.poster)) return true;
  if (!meta.background || isPlaceholderUrl(meta.background)) return true;
  if (!hasNarrativeDescription(meta)) return true;
  return false;
}

export function metaQuality(meta) {
  if (!meta) return -1;

  let q = 0;
  const imdbId = meta?._addon?.imdbId || (String(meta.id || '').startsWith('tt') ? meta.id : null);
  const tmdbId = meta?._addon?.tmdbId || null;

  if (imdbId) q += 1000;
  if (tmdbId) q += 500;
  if (meta.poster && !isPlaceholderUrl(meta.poster)) q += 100;
  if (meta.background && !isPlaceholderUrl(meta.background)) q += 50;
  if (String(meta.description || '').length > 160) q += 30;
  if (Array.isArray(meta.cast) && meta.cast.length) q += 20;
  if ((Array.isArray(meta.director) && meta.director.length) || (typeof meta.director === 'string' && meta.director.trim())) q += 15;
  if (meta.runtime) q += 10;
  if (meta.imdbRating) q += 10;
  if (Array.isArray(meta.genres) && meta.genres.length > 1) q += 5;

  return q;
}

export function preferRicherMeta(existing, candidate) {
  if (!existing) return candidate;
  if (!candidate) return existing;

  const oldImdb = existing?._addon?.imdbId || (String(existing.id || '').startsWith('tt') ? existing.id : null);
  const newImdb = candidate?._addon?.imdbId || (String(candidate.id || '').startsWith('tt') ? candidate.id : null);
  const oldTmdb = existing?._addon?.tmdbId || null;
  const newTmdb = candidate?._addon?.tmdbId || null;

  if (oldImdb && !newImdb) return existing;
  if (oldTmdb && !newTmdb && !newImdb) return existing;

  return metaQuality(candidate) >= metaQuality(existing) ? candidate : existing;
}
