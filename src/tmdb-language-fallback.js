export function mergeTmdbLanguageFallback(primary, fallback, type = 'movie') {
  if (!primary) return fallback || null;
  if (!fallback) return primary;

  const out = { ...primary };
  const primaryOverview = String(primary.overview || '').trim();
  const fallbackOverview = String(fallback.overview || '').trim();

  // Zachovaj lokalizovaný CZ/SK názov. Z fallback jazyka ber iba údaje,
  // ktoré v primárnej lokalizácii reálne chýbajú.
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
