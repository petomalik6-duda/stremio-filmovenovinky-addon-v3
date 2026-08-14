export function mergeTmdbLanguageFallback(primary, fallback, type = 'movie') {
  if (!primary) return fallback || null;
  if (!fallback) return primary;

  const out = { ...primary };
  const primaryOverview = String(primary.overview || '').trim();
  const fallbackOverview = String(fallback.overview || '').trim();

  // Zachovaj lokalizovaný CZ/SK názov. Z fallback jazyka ber iba údaje,
  // ktoré v primárnej odpovedi naozaj chýbajú.
  if (primaryOverview.length < 20 && fallbackOverview.length > primaryOverview.length) {
    out.overview = fallback.overview;
  }

  if (!out.poster_path && fallback.poster_path) out.poster_path = fallback.poster_path;
  if (!out.backdrop_path && fallback.backdrop_path) out.backdrop_path = fallback.backdrop_path;

  const titleKey = type === 'series' ? 'name' : 'title';
  if (!String(out[titleKey] || '').trim() && String(fallback[titleKey] || '').trim()) {
    out[titleKey] = fallback[titleKey];
  }

  return out;
}

function cleanOverview(value) {
  const out = String(value || '').replace(/\s+/g, ' ').trim();
  return out.length >= 20 ? out : '';
}

export function chooseTranslationOverview(payload, originalLanguage = '') {
  const rows = Array.isArray(payload?.translations) ? payload.translations : [];
  const preferredOriginal = String(originalLanguage || '').toLowerCase();
  const candidates = [];

  for (const row of rows) {
    const overview = cleanOverview(row?.data?.overview);
    if (!overview) continue;

    const lang = String(row?.iso_639_1 || '').toLowerCase();
    const country = String(row?.iso_3166_1 || '').toUpperCase();
    let priority = 10;

    // Prefer SK/CZ, then any English translation, then original language.
    // cs-CZ and en-US were already tried directly, but another country
    // variant can still contain a populated overview.
    if (lang === 'sk') priority = 100;
    else if (lang === 'cs') priority = 95;
    else if (lang === 'en') priority = 90;
    else if (preferredOriginal && lang === preferredOriginal) priority = 80;

    // Among translations with the same language, prefer the richer overview.
    candidates.push({ overview, priority, country, length: overview.length });
  }

  candidates.sort((a, b) => b.priority - a.priority || b.length - a.length || a.country.localeCompare(b.country));
  return candidates[0]?.overview || '';
}

export function buildFactualMetadataSummary(data, type = 'movie') {
  if (!data || typeof data !== 'object') return '';

  const title = String(type === 'series' ? (data.name || data.original_name || '') : (data.title || data.original_title || '')).trim();
  const date = String(type === 'series' ? (data.first_air_date || '') : (data.release_date || '')).trim();
  const year = /^\d{4}/.test(date) ? date.slice(0, 4) : '';
  const genres = (Array.isArray(data.genres) ? data.genres : []).map(g => String(g?.name || '').trim()).filter(Boolean).slice(0, 4);
  const director = type === 'series'
    ? (Array.isArray(data.created_by) ? data.created_by : []).map(x => String(x?.name || '').trim()).filter(Boolean).slice(0, 2)
    : (Array.isArray(data.credits?.crew) ? data.credits.crew : []).filter(x => x?.job === 'Director').map(x => String(x?.name || '').trim()).filter(Boolean).slice(0, 2);
  const cast = (Array.isArray(data.credits?.cast) ? data.credits.cast : []).map(x => String(x?.name || '').trim()).filter(Boolean).slice(0, 5);

  const head = [title ? `„${title}“` : (type === 'series' ? 'Seriál' : 'Film'), year ? `(${year})` : ''].filter(Boolean).join(' ');
  const facts = [];
  if (genres.length) facts.push(`Žáner: ${genres.join(', ')}`);
  if (director.length) facts.push(`Réžia: ${director.join(', ')}`);
  if (cast.length) facts.push(`Hrajú: ${cast.join(', ')}`);

  if (!facts.length) return '';
  return `${head}. ${facts.join('. ')}.`.replace(/\.\./g, '.').trim();
}
